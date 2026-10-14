import { isArchivedProject } from './projectLifecycle';
import { and, eq } from 'drizzle-orm';
import {
    projects,
    students,
    responses,
    assessments,
    preferenceSubmissions,
} from '../../db/schema';
import type { AppDatabase } from './db';
import { resolveStudent, academicPeriod } from './studentIdentity';
import { saveKnowledge, consumeRequest } from './studentUpdates';
import type { TeacherAccess } from './access';
import { InputError, type ProjectInput, type Submission } from './input';
import { teachingAccess } from './access';
import { classGroupAudience } from './classGroups';

function accessCode() {
    return `${Math.floor(1000 + Math.random() * 9000)}${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]}`;
}

export async function createProject(
    db: AppDatabase,
    data: ProjectInput,
    access?: TeacherAccess,
) {
    const participants =
        data.studentsJson ??
        (data.studentList || '')
            .split('\n')
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => ({ name, email: '' }));
    return db.transaction(async (tx) => {
        let audience: Awaited<ReturnType<typeof classGroupAudience>> | null =
            null;
        if (data.classGroupId) {
            if (!access)
                throw new InputError('Klasearen baimena behar da.', 403);
            audience = await classGroupAudience(
                tx,
                await teachingAccess(tx, access.actor),
                data.classGroupId,
                participants.map((person) =>
                    'studentRecordId' in person &&
                    typeof person.studentRecordId === 'number'
                        ? person.studentRecordId
                        : 0,
                ),
            );
        }
        let code = accessCode();
        for (
            let attempts = 0;
            await tx.query.projects.findFirst({
                where: eq(projects.accessCode, code),
            });
            attempts++
        ) {
            if (attempts >= 10)
                throw new Error('Unable to generate a unique access code');
            code = accessCode();
        }
        const [project] = await tx
            .insert(projects)
            .values({
                ownerId: access?.actor.id ?? null,
                academicPeriod: data.academicPeriod || academicPeriod(),
                historyMode: data.historyMode || 'balanced',
                name: data.name,
                description: data.description,
                audienceSnapshot: audience,
                numTeams: data.numTeams ?? null,
                targetTeamSize: data.targetTeamSize ?? null,
                projectType: data.projectType,
                adminEmail: data.adminEmail,
                accessCode: code,
                status: 'active',
            })
            .returning();
        const identities = new Set<number>();
        for (const participant of participants) {
            const person = await resolveStudent(tx, participant, access);
            // Deduplicate explicit roster IDs; repeated typed names still need review.
            if (identities.has(person.id)) {
                if (
                    'studentRecordId' in participant &&
                    participant.studentRecordId === person.id
                )
                    continue;
                throw new InputError(
                    'Ikasle bera ezin da proiektuan bitan gehitu. Bereizi izen bereko pertsonak emailaren bidez.',
                );
            }
            identities.add(person.id);
            await tx.insert(students).values({
                projectId: project.id,
                studentRecordId: person.id,
                name: person.name,
                email: person.email,
            });
        }
        return project;
    });
}

export async function submitSurvey(
    db: AppDatabase,
    data: Submission,
    requestId?: number,
) {
    await db.transaction(async (tx) => {
        const participants = await tx.query.students.findMany({
            where: eq(students.projectId, data.projectId),
        });
        const student = participants.find((row) => row.id === data.studentId);
        if (!student || student.hasCompleted || student.isExcluded)
            throw new InputError('Student unavailable or already completed');
        const ids = new Set(participants.map((row) => row.id));
        if (
            [...data.comfort, ...data.preferWith, ...data.preferAvoid].some(
                (id) => !ids.has(id),
            )
        )
            throw new InputError('Selection outside this project');
        if (requestId) await consumeRequest(tx, requestId);
        const [saved] = await tx
            .insert(responses)
            .values({
                projectId: data.projectId,
                studentId: data.studentId,
                skillsNarrative: {
                    creativity: data.narrative_creativity,
                    writing: data.narrative_writing,
                    references: data.narrative_references,
                    communication: data.narrative_communication,
                },
                skillsTechnical: {
                    camera: data.technical_camera,
                    sound: data.technical_sound,
                    editing: data.technical_editing,
                },
                skillsManagement: {
                    planning: data.management_planning,
                    production: data.management_production,
                },
                skillsSoft: {
                    leadership: data.soft_leadership,
                    listening: data.soft_listening,
                    proactivity: data.soft_proactivity,
                    teamwork: data.soft_teamwork,
                    motivation: data.soft_motivation,
                    conflict: data.soft_conflict,
                },
                comfort: data.comfort,
                preferWith: data.preferWith,
                preferAvoid: data.preferAvoid,
            })
            .returning();
        const project = await tx.query.projects.findFirst({
            where: eq(projects.id, data.projectId),
        });
        if (!project || isArchivedProject(project) || !student.studentRecordId)
            throw new InputError(
                'Proiektua edo ikaslearen identitatea ez dago erabilgarri.',
            );
        const peers = new Map(
            participants
                .filter((row) => !row.isExcluded)
                .map((row) => [row.id, row.studentRecordId]),
        );
        if (
            [...data.comfort, ...data.preferWith, ...data.preferAvoid].some(
                (id) => !peers.get(id),
            )
        )
            throw new InputError(
                'Hautatutako kideen identitateak berrikusi behar dira.',
            );
        const remap = (ids: number[]) =>
            ids
                .map((id) => peers.get(id))
                .filter((id): id is number => id !== null && id !== undefined);
        await saveKnowledge(tx, {
            studentId: student.studentRecordId,
            assessment: {
                skillsNarrative: saved.skillsNarrative,
                skillsTechnical: saved.skillsTechnical,
                skillsManagement: saved.skillsManagement,
                skillsSoft: saved.skillsSoft,
            },
            preferences: {
                comfort: remap(data.comfort),
                preferWith: remap(data.preferWith),
                preferAvoid: remap(data.preferAvoid),
            },
            source: requestId ? 'project-survey' : 'legacy-survey',
            scope: 'project',
            academicPeriod: project.academicPeriod || academicPeriod(),
            projectId: project.id,
            projectName: project.name,
            collectionYear: project.collectionYear,
            requestId,
            legacyResponseId: saved.id,
            legacyParticipantId: student.id,
        });
        await tx
            .update(students)
            .set({ hasCompleted: true, email: data.email })
            .where(
                and(
                    eq(students.id, data.studentId),
                    eq(students.projectId, data.projectId),
                ),
            );
    });
}

export async function resetSurvey(
    db: AppDatabase,
    projectId: number,
    studentId: number,
) {
    await db.transaction(async (tx) => {
        const project = await tx.query.projects.findFirst({
            where: eq(projects.id, projectId),
        });
        if (!project || isArchivedProject(project))
            throw new InputError('Proiektua ez dago erabilgarri.', 404);
        const scope = and(
            eq(students.id, studentId),
            eq(students.projectId, projectId),
        );
        if (!(await tx.query.students.findFirst({ where: scope })))
            throw new InputError('Student not found', 404);
        const existing = await tx.query.responses.findMany({
            where: and(
                eq(responses.studentId, studentId),
                eq(responses.projectId, projectId),
            ),
        });
        const date = new Date().toISOString();
        for (const response of existing) {
            await tx
                .update(assessments)
                .set({ withdrawnAt: date })
                .where(eq(assessments.legacyResponseId, response.id));
            await tx
                .update(preferenceSubmissions)
                .set({ withdrawnAt: date })
                .where(eq(preferenceSubmissions.legacyResponseId, response.id));
        }
        await tx
            .delete(responses)
            .where(
                and(
                    eq(responses.studentId, studentId),
                    eq(responses.projectId, projectId),
                ),
            );
        await tx.update(students).set({ hasCompleted: false }).where(scope);
    });
}
