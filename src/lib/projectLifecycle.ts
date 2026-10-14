import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import {
    projects,
    students,
    responses,
    assessments,
    preferenceSubmissions,
    pairingRestrictions,
    updateRequests,
    teamDrafts,
    confirmedAssignments,
    identityReviews,
    deletedProjectSources,
    users,
} from '../../db/schema';
import type { AppDatabase } from './db';
import { requireMaster, requireProject, type TeacherAccess } from './access';
import { InputError, positiveId } from './input';

export const isArchivedProject = (project: {
    archivedAt: string | null;
    status: string | null;
}) => Boolean(project.archivedAt) || project.status === 'archived';
type RestoredStatus = 'setup' | 'active' | 'completed';
const restorable = (status: string | null): RestoredStatus =>
    status === 'active' || status === 'completed' ? status : 'setup';

export async function archiveProject(
    db: AppDatabase,
    access: TeacherAccess,
    projectId: number,
) {
    const id = positiveId.parse(projectId);
    requireProject(access, id);
    await db.transaction(async (tx) => {
        const project = await tx.query.projects.findFirst({
            where: eq(projects.id, id),
        });
        if (!project) throw new InputError('Proiektua ez da aurkitu.', 404);
        const now = new Date().toISOString();
        if (!isArchivedProject(project))
            await tx
                .update(projects)
                .set({
                    status: 'archived',
                    archivedAt: now,
                    statusBeforeArchive: restorable(project.status),
                })
                .where(eq(projects.id, id));
        // Revocation survives restoration, including invitations issued before this feature.
        await tx
            .update(updateRequests)
            .set({ revokedAt: now })
            .where(
                and(
                    eq(updateRequests.projectId, id),
                    isNull(updateRequests.revokedAt),
                    isNull(updateRequests.consumedAt),
                ),
            );
    });
}

export async function restoreProject(
    db: AppDatabase,
    access: TeacherAccess,
    projectId: number,
) {
    const id = positiveId.parse(projectId);
    requireProject(access, id);
    return db.transaction(async (tx) => {
        const project = await tx.query.projects.findFirst({
            where: eq(projects.id, id),
        });
        if (!project) throw new InputError('Proiektua ez da aurkitu.', 404);
        if (!isArchivedProject(project)) return project.status;
        const status = restorable(project.statusBeforeArchive);
        await tx
            .update(updateRequests)
            .set({ revokedAt: new Date().toISOString() })
            .where(
                and(
                    eq(updateRequests.projectId, id),
                    isNull(updateRequests.revokedAt),
                    isNull(updateRequests.consumedAt),
                ),
            );
        await tx
            .update(projects)
            .set({ status, archivedAt: null, statusBeforeArchive: null })
            .where(eq(projects.id, id));
        return status;
    });
}

// Delete the working project, retaining independent knowledge and its original source identity.
export async function deleteProject(
    db: AppDatabase,
    access: TeacherAccess,
    projectId: number,
) {
    const id = positiveId.parse(projectId);
    requireMaster(access);
    return db.transaction(async (tx) => {
        const actor = await tx.query.users.findFirst({
            where: eq(users.id, access.actor.id),
        });
        if (actor?.role !== 'master')
            throw new InputError(
                'Proiektua ezabatzeko master sarbidea behar da.',
                403,
            );
        const project = await tx.query.projects.findFirst({
            where: eq(projects.id, id),
        });
        if (!project) throw new InputError('Proiektua ez da aurkitu.', 404);
        const [
            participants,
            sourceResponses,
            assessmentRows,
            preferenceRows,
            requests,
            restrictions,
            drafts,
            assignments,
        ] = await Promise.all([
            tx.query.students.findMany({ where: eq(students.projectId, id) }),
            tx.query.responses.findMany({ where: eq(responses.projectId, id) }),
            tx.query.assessments.findMany({
                columns: { id: true, legacyResponseId: true },
                where: eq(assessments.projectId, id),
            }),
            tx.query.preferenceSubmissions.findMany({
                columns: { id: true, legacyResponseId: true },
                where: eq(preferenceSubmissions.projectId, id),
            }),
            tx.query.updateRequests.findMany({
                columns: { id: true },
                where: eq(updateRequests.projectId, id),
            }),
            tx.query.pairingRestrictions.findMany({
                columns: { id: true },
                where: eq(pairingRestrictions.projectId, id),
            }),
            tx.query.teamDrafts.findMany({
                columns: { id: true },
                where: eq(teamDrafts.projectId, id),
            }),
            tx.query.confirmedAssignments.findMany({
                columns: { id: true },
                where: eq(confirmedAssignments.projectId, id),
            }),
        ]);
        const reviews = await tx.query.identityReviews.findMany({
            where: or(
                and(
                    eq(identityReviews.sourceType, 'participant'),
                    inArray(
                        identityReviews.sourceId,
                        participants.map((row) => row.id),
                    ),
                ),
                and(
                    eq(identityReviews.sourceType, 'response'),
                    inArray(
                        identityReviews.sourceId,
                        sourceResponses.map((row) => row.id),
                    ),
                ),
            ),
        });
        if (
            reviews.some(
                (review) =>
                    review.sourceType === 'participant' && !review.resolvedAt,
            )
        )
            throw new InputError(
                'Ebatzi proiektu honetako identitate-berrikuspenak ezabatu aurretik.',
                409,
            );
        const preferenceResponseIds = new Set(
            preferenceRows.map((row) => row.legacyResponseId),
        );
        const retainedResponseIds = new Set([
            ...assessmentRows
                .filter((row) =>
                    preferenceResponseIds.has(row.legacyResponseId),
                )
                .map((row) => row.legacyResponseId),
            ...reviews
                .filter((row) => row.sourceType === 'response' && row.rawSource)
                .map((row) => row.sourceId),
        ]);
        if (sourceResponses.some((row) => !retainedResponseIds.has(row.id)))
            throw new InputError(
                'Inportatu erantzunen historia ezabatu aurretik; jatorrizko datuak mantendu dira.',
                409,
            );
        const now = new Date().toISOString();
        for (const review of reviews) {
            const source =
                review.sourceType === 'participant'
                    ? participants.find((row) => row.id === review.sourceId)
                    : sourceResponses.find((row) => row.id === review.sourceId);
            if (source && !review.rawSource)
                await tx
                    .update(identityReviews)
                    .set({ rawSource: { ...source } })
                    .where(eq(identityReviews.id, review.id));
        }
        await tx.insert(deletedProjectSources).values({
            id,
            name: project.name,
            audienceSnapshot: project.audienceSnapshot,
            projectType: project.projectType,
            academicPeriod: project.academicPeriod,
            collectionYear: project.collectionYear,
            createdAt: project.createdAt,
            deletedAt: now,
            deletedBy: access.actor.id,
            retainedRecords: {
                assessmentIds: assessmentRows.map((row) => row.id),
                preferenceSubmissionIds: preferenceRows.map((row) => row.id),
                requestIds: requests.map((row) => row.id),
                restrictionIds: restrictions.map((row) => row.id),
                draftIds: drafts.map((row) => row.id),
                assignmentIds: assignments.map((row) => row.id),
                reviewIds: reviews.map((row) => row.id),
            },
        });
        await tx
            .update(updateRequests)
            .set({ revokedAt: now })
            .where(
                and(
                    eq(updateRequests.projectId, id),
                    isNull(updateRequests.revokedAt),
                    isNull(updateRequests.consumedAt),
                ),
            );
        await tx.delete(projects).where(eq(projects.id, id));
    });
}
