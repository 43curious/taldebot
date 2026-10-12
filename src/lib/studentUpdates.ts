import { createHash, randomBytes } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
    assessments,
    preferenceSubmissions,
    preferenceChoices,
    updateRequests,
    studentRecords,
    students,
    enrollments,
    projects,
    users,
} from '../../db/schema';
import type { AppDatabase } from './db';
import type { DataSession } from './studentIdentity';
import { academicPeriod } from './studentIdentity';
import {
    requireStudent,
    requireProject,
    teachingAccess,
    canReadStudent,
    type TeacherAccess,
} from './access';
import type { AssessmentValues, PreferenceKind } from './trackingTypes';
import { InputError } from './input';
import { loadStudentProfiles } from './studentProfiles';

export type Preferences = Record<PreferenceKind, number[]>;
const digest = (token: string) =>
    createHash('sha256').update(token).digest('hex');
const pending = (request: typeof updateRequests.$inferSelect) =>
    !request.revokedAt &&
    !request.consumedAt &&
    Date.parse(request.expiresAt) > Date.now();

export async function issueUpdateRequest(
    db: AppDatabase,
    access: TeacherAccess,
    input: {
        studentId: number;
        projectId?: number;
        participantId?: number;
        assessmentAsked: boolean;
        preferencesAsked: boolean;
        academicPeriod?: string;
    },
) {
    requireStudent(access, input.studentId);
    if (!input.assessmentAsked && !input.preferencesAsked)
        throw new InputError('Aukeratu gutxienez atal bat.');
    const person = await db.query.studentRecords.findFirst({
        where: eq(studentRecords.id, input.studentId),
    });
    if (!person || person.needsReview)
        throw new InputError(
            'Ikaslearen identitatea berrikusi behar da lehenago.',
        );
    const enrollment = await db.query.enrollments.findFirst({
        where: and(
            eq(enrollments.studentId, person.id),
            isNull(enrollments.endedAt),
        ),
        orderBy: (row, { desc }) => [desc(row.id)],
    });
    let period = input.academicPeriod || academicPeriod();
    if (input.projectId) {
        if (!input.assessmentAsked || !input.preferencesAsked)
            throw new InputError(
                'Proiektuko inkestak bi atalak eskatzen ditu.',
            );
        requireProject(access, input.projectId);
        const project = await db.query.projects.findFirst({
            where: eq(projects.id, input.projectId),
        });
        const participant = input.participantId
            ? await db.query.students.findFirst({
                  where: eq(students.id, input.participantId),
              })
            : undefined;
        if (
            !project ||
            project.archivedAt ||
            !participant ||
            participant.projectId !== project.id ||
            participant.studentRecordId !== person.id ||
            participant.hasCompleted ||
            participant.isExcluded
        )
            throw new InputError('Proiektuko inkesta ez dago erabilgarri.');
        period = project.academicPeriod || period;
    }
    const token = randomBytes(32).toString('base64url');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    const request = await db.transaction(async (tx) => {
        const sameScope = input.projectId
            ? eq(updateRequests.projectId, input.projectId)
            : and(
                  eq(updateRequests.scope, 'period'),
                  eq(updateRequests.academicPeriod, period),
              );
        await tx
            .update(updateRequests)
            .set({ revokedAt: now })
            .where(
                and(
                    eq(updateRequests.studentId, person.id),
                    sameScope,
                    isNull(updateRequests.consumedAt),
                    isNull(updateRequests.revokedAt),
                ),
            );
        const [created] = await tx
            .insert(updateRequests)
            .values({
                studentId: person.id,
                issuedBy: access.actor.id,
                scope: input.projectId ? 'project' : 'period',
                projectId: input.projectId ?? null,
                participantId: input.participantId ?? null,
                classId: enrollment?.classId ?? null,
                academicPeriod: period,
                assessmentAsked: input.assessmentAsked,
                preferencesAsked: input.preferencesAsked,
                tokenHash: digest(token),
                createdAt: now,
                expiresAt,
            })
            .returning();
        return created;
    });
    return { requestId: request.id, token, expiresAt };
}

export async function requestContext(db: AppDatabase, token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new InputError('Esteka pertsonala ez da balioduna.', 401);
    const request = await db.query.updateRequests.findFirst({
        where: eq(updateRequests.tokenHash, digest(token)),
    });
    if (!request || !pending(request) || request.issuedBy === null)
        throw new InputError(
            'Esteka iraungi, erabili edo baliogabetu da.',
            410,
        );
    const issuer = await db.query.users.findFirst({
        where: eq(users.id, request.issuedBy),
    });
    if (!issuer) throw new InputError('Esteka ez dago erabilgarri.', 410);
    const access = await teachingAccess(db, issuer);
    requireStudent(access, request.studentId);
    const person = await db.query.studentRecords.findFirst({
        where: eq(studentRecords.id, request.studentId),
    });
    if (!person || person.needsReview)
        throw new InputError('Esteka ez dago erabilgarri.', 410);
    let peers: { id: number; name: string }[];
    if (request.scope === 'project') {
        if (!request.projectId)
            throw new InputError('Proiektua ez dago erabilgarri.', 410);
        requireProject(access, request.projectId);
        const project = await db.query.projects.findFirst({
            where: eq(projects.id, request.projectId),
        });
        const participant = request.participantId
            ? await db.query.students.findFirst({
                  where: eq(students.id, request.participantId),
              })
            : undefined;
        if (
            !project ||
            project.archivedAt ||
            !participant ||
            participant.isExcluded ||
            participant.hasCompleted ||
            participant.studentRecordId !== person.id
        )
            throw new InputError('Inkesta ez dago erabilgarri.', 410);
        const participants = await db.query.students.findMany({
            where: eq(students.projectId, project.id),
        });
        peers = participants
            .filter((row) => row.studentRecordId !== null && !row.isExcluded)
            .map((row) => ({ id: row.studentRecordId!, name: row.name }));
    } else {
        const active = await db.query.enrollments.findMany({
            where: and(
                eq(enrollments.studentId, person.id),
                isNull(enrollments.endedAt),
            ),
        });
        if (
            request.classId !== null &&
            !active.some((row) => row.classId === request.classId)
        )
            throw new InputError(
                'Klasea aldatu da; eskatu esteka berri bat.',
                410,
            );
        const cohort = await db.query.enrollments.findMany({
            where: and(
                inArray(
                    enrollments.classId,
                    active.flatMap((row) =>
                        row.classId === null ? [] : [row.classId],
                    ),
                ),
                isNull(enrollments.endedAt),
            ),
        });
        const ids = [...new Set(cohort.map((row) => row.studentId))].filter(
            (id) => id !== person.id && canReadStudent(access, id),
        );
        peers = (
            await db.query.studentRecords.findMany({
                where: inArray(studentRecords.id, ids),
            })
        ).map((row) => ({ id: row.id, name: row.name }));
    }
    const profile = (
        await loadStudentProfiles(db, access, [person.id], {
            projectId: request.projectId ?? undefined,
            academicPeriod: request.academicPeriod,
        })
    ).get(person.id)!;
    const initialPreferences: Preferences = {
        comfort: [],
        preferWith: [],
        preferAvoid: [],
    };
    const allowed = new Set(peers.map((row) => row.id));
    for (const link of profile.relationships)
        if (
            !link.incoming &&
            link.kind !== 'restriction' &&
            allowed.has(link.target)
        )
            initialPreferences[link.kind].push(link.target);
    return { request, person, peers, initialPreferences };
}

export async function saveKnowledge(
    store: DataSession,
    input: {
        studentId: number;
        assessment?: AssessmentValues;
        preferences?: Preferences;
        source:
            'project-survey' | 'independent-update' | 'legacy-survey' | 'demo';
        scope: 'project' | 'period';
        academicPeriod: string;
        projectId?: number;
        projectName?: string;
        collectionYear?: number | null;
        requestId?: number;
        legacyResponseId?: number;
        legacyParticipantId?: number;
    },
) {
    const submittedAt = new Date().toISOString();
    const provenance = {
        studentId: input.studentId,
        academicPeriod: input.academicPeriod,
        source: input.source,
        projectId: input.projectId ?? null,
        projectName: input.projectName ?? null,
        collectionYear: input.collectionYear ?? null,
        requestId: input.requestId ?? null,
        submittedAt,
        legacyResponseId: input.legacyResponseId ?? null,
        legacyParticipantId: input.legacyParticipantId ?? null,
    };
    if (input.assessment !== undefined)
        await store
            .insert(assessments)
            .values({ ...provenance, data: input.assessment });
    if (input.preferences !== undefined) {
        const [submission] = await store
            .insert(preferenceSubmissions)
            .values({ ...provenance, scope: input.scope })
            .returning();
        const choices = (
            ['comfort', 'preferWith', 'preferAvoid'] as const
        ).flatMap((kind) =>
            input.preferences![kind].map((targetStudentId) => ({
                submissionId: submission.id,
                targetStudentId,
                kind,
            })),
        );
        if (choices.length)
            await store.insert(preferenceChoices).values(choices);
    }
}
export async function consumeRequest(store: DataSession, requestId: number) {
    const request = await store.query.updateRequests.findFirst({
        where: eq(updateRequests.id, requestId),
    });
    if (!request || !pending(request))
        throw new InputError('Esteka jada ez dago erabilgarri.', 410);
    await store
        .update(updateRequests)
        .set({ consumedAt: new Date().toISOString() })
        .where(eq(updateRequests.id, requestId));
}
export async function completeIndependentUpdate(
    db: AppDatabase,
    token: string,
    data: { assessment?: AssessmentValues; preferences?: Preferences },
) {
    const context = await requestContext(db, token);
    const { request } = context;
    if (request.scope !== 'period')
        throw new InputError('Esteka hau proiektuko inkestarako da.');
    if (
        request.assessmentAsked !== (data.assessment !== undefined) ||
        request.preferencesAsked !== (data.preferences !== undefined)
    )
        throw new InputError('Erantzun eskatutako atalei bakarrik.');
    const ids = data.preferences ? Object.values(data.preferences).flat() : [];
    const allowed = new Set(context.peers.map((row) => row.id));
    if (
        ids.some((id) => !allowed.has(id) || id === request.studentId) ||
        new Set(ids).size !== ids.length
    )
        throw new InputError('Hautatutako kideak ez dira baliodunak.');
    if (data.assessment?.skillsSoft.motivation !== undefined)
        throw new InputError('Motibazioa proiektuko galdera da.');
    await db.transaction(async (tx) => {
        await consumeRequest(tx, request.id);
        await saveKnowledge(tx, {
            studentId: request.studentId,
            ...data,
            source: 'independent-update',
            scope: 'period',
            academicPeriod: request.academicPeriod,
            requestId: request.id,
        });
    });
}
