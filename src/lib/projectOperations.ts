import { and, eq } from 'drizzle-orm';
import { projects, students, responses, teams } from '../../db/schema';
import type { AppDatabase } from './db';
import { InputError, type ProjectInput, type Submission } from './input';

function accessCode() {
    return `${Math.floor(1000 + Math.random() * 9000)}${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]}`;
}

export async function createProject(db: AppDatabase, data: ProjectInput) {
    const participants =
        data.studentsJson ??
        (data.studentList || '')
            .split('\n')
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => ({ name, email: '' }));
    return db.transaction(async (tx) => {
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
                name: data.name,
                description: data.description,
                numTeams: data.numTeams ?? null,
                targetTeamSize: data.targetTeamSize ?? null,
                projectType: data.projectType,
                adminEmail: data.adminEmail,
                accessCode: code,
                status: 'active',
            })
            .returning();
        for (let offset = 0; offset < participants.length; offset += 100) {
            await tx
                .insert(students)
                .values(
                    participants
                        .slice(offset, offset + 100)
                        .map((student) => ({
                            ...student,
                            projectId: project.id,
                        })),
                );
        }
        return project;
    });
}

export async function submitSurvey(db: AppDatabase, data: Submission) {
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
        await tx.insert(responses).values({
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
        const scope = and(
            eq(students.id, studentId),
            eq(students.projectId, projectId),
        );
        if (!(await tx.query.students.findFirst({ where: scope })))
            throw new InputError('Student not found', 404);
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

export async function replaceTeams(
    db: AppDatabase,
    projectId: number,
    algorithmVersion: 'v1' | 'v2',
    allocation: Pick<
        typeof teams.$inferInsert,
        'teamNumber' | 'memberIds' | 'justification'
    >[],
) {
    await db.transaction(async (tx) => {
        await tx
            .delete(teams)
            .where(
                and(
                    eq(teams.projectId, projectId),
                    eq(teams.algorithmVersion, algorithmVersion),
                ),
            );
        if (allocation.length)
            await tx
                .insert(teams)
                .values(
                    allocation.map((team) => ({
                        ...team,
                        projectId,
                        algorithmVersion,
                    })),
                );
    });
}
