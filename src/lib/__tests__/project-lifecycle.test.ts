import { it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import {
    archiveProject,
    restoreProject,
    deleteProject,
} from '../projectLifecycle';
import {
    createProject,
    submitSurvey,
    resetSurvey,
    replaceTeams,
} from '../projectOperations';
import {
    generateDraft,
    confirmDraft,
    confirmedPairHistory,
} from '../formation';
import { issueUpdateRequest, requestContext } from '../studentUpdates';
import { teachingAccess } from '../access';
import { loadStudentProfiles } from '../studentProfiles';
import { projectSchema, submissionSchema } from '../input';
import { skillGroups } from '../skills';
import { testDatabase } from './testDatabase';

async function setup() {
    const f = await testDatabase();
    const [master, teacher] = await f.db
        .insert(schema.users)
        .values([
            { username: 'master', role: 'master', hashedPassword: 'unused' },
            { username: 'teacher', role: 'admin', hashedPassword: 'unused' },
        ])
        .returning();
    const [group] = await f.db
        .insert(schema.classes)
        .values({ name: 'Class', year: 2 })
        .returning();
    const people = await f.db
        .insert(schema.studentRecords)
        .values(['Ane', 'Iker', 'Leire', 'Miren'].map((name) => ({ name })))
        .returning();
    await f.db.insert(schema.enrollments).values(
        people.map((person) => ({
            studentId: person.id,
            classId: group.id,
            className: 'Class',
            year: 2,
            academicPeriod: '2026-2027',
            source: 'test',
        })),
    );
    await f.db
        .insert(schema.teacherResponsibilities)
        .values({ userId: teacher.id, classId: group.id });
    const access = await teachingAccess(f.db, master);
    const input = projectSchema.parse({
        name: 'Film',
        numTeams: 2,
        projectType: 'balanced',
        adminEmail: 'teacher@example.com',
        academicPeriod: '2025-2026',
        studentsJson: JSON.stringify(
            people.map((person) => ({
                name: person.name,
                studentRecordId: person.id,
            })),
        ),
    });
    const project = await createProject(f.db, input, access);
    const other = await createProject(
        f.db,
        { ...input, name: 'Other' },
        access,
    );
    const participants = await f.db.query.students.findMany({
        where: eq(schema.students.projectId, project.id),
    });
    const invite = (index: number) =>
        issueUpdateRequest(f.db, access, {
            studentId: people[index].id,
            projectId: project.id,
            participantId: participants[index].id,
            assessmentAsked: true,
            preferencesAsked: true,
        });
    const answered = await invite(0);
    await submitSurvey(
        f.db,
        submissionSchema.parse({
            projectId: project.id,
            studentId: participants[0].id,
            email: 'ane@example.com',
            comfort: JSON.stringify([participants[1].id]),
            preferWith: '[]',
            preferAvoid: '[]',
            ...Object.fromEntries(
                skillGroups.flatMap((group) =>
                    group.keys.map((key) => [`${group.prefix}_${key}`, 5]),
                ),
            ),
        }),
        answered.requestId,
    );
    const pending = await invite(1),
        expired = await invite(2),
        revoked = await invite(3);
    await f.db
        .update(schema.updateRequests)
        .set({ expiresAt: '2000-01-01' })
        .where(eq(schema.updateRequests.id, expired.requestId));
    await f.db
        .update(schema.updateRequests)
        .set({ revokedAt: '2026-01-01' })
        .where(eq(schema.updateRequests.id, revoked.requestId));
    const independent = await issueUpdateRequest(f.db, access, {
        studentId: people[2].id,
        assessmentAsked: true,
        preferencesAsked: false,
    });
    const draft = await generateDraft(f.db, access, project.id, 'v2');
    await confirmDraft(f.db, access, project.id, draft.id);
    await f.db.insert(schema.pairingRestrictions).values({
        student1Id: people[0].id,
        student2Id: people[1].id,
        scope: 'project',
        projectId: project.id,
        academicPeriod: '2025-2026',
        createdBy: master.id,
        createdAt: '2026-01-01',
        reviewAt: '2027-01-01',
        reason: 'Private source rule',
    });
    return {
        ...f,
        master,
        teacher,
        access,
        people,
        project,
        other,
        participants,
        pending,
        expired,
        revoked,
        answered,
        independent,
        draft,
    };
}

it('archives reversibly, preserves data and never reactivates pending, expired, revoked or consumed invitations', async () => {
    const s = await setup();
    try {
        await s.db
            .update(schema.projects)
            .set({ status: 'completed' })
            .where(eq(schema.projects.id, s.project.id));
        const responses = await s.db.query.responses.findMany(),
            assessments = await s.db.query.assessments.findMany(),
            assignments = await s.db.query.confirmedAssignments.findMany();
        const teacherAccess = await teachingAccess(s.db, s.teacher);
        await archiveProject(s.db, teacherAccess, s.project.id);
        const archived = (await s.db.query.projects.findFirst({
            where: eq(schema.projects.id, s.project.id),
        }))!;
        expect(archived.statusBeforeArchive).toBe('completed');
        await archiveProject(s.db, teacherAccess, s.project.id);
        expect(
            (await s.db.query.projects.findFirst({
                where: eq(schema.projects.id, s.project.id),
            }))!.archivedAt,
        ).toBe(archived.archivedAt);
        await expect(
            generateDraft(s.db, s.access, s.project.id, 'v2'),
        ).rejects.toThrow();
        await expect(
            resetSurvey(s.db, s.project.id, s.participants[0].id),
        ).rejects.toThrow();
        await expect(
            replaceTeams(s.db, s.project.id, 'v2', []),
        ).rejects.toThrow();
        await expect(requestContext(s.db, s.pending.token)).rejects.toThrow();
        expect(await restoreProject(s.db, teacherAccess, s.project.id)).toBe(
            'completed',
        );
        for (const invitation of [s.pending, s.expired, s.revoked, s.answered])
            await expect(
                requestContext(s.db, invitation.token),
            ).rejects.toThrow();
        expect(
            (await requestContext(s.db, s.independent.token)).request.scope,
        ).toBe('period');
        const fresh = await issueUpdateRequest(s.db, s.access, {
            studentId: s.people[1].id,
            participantId: s.participants[1].id,
            projectId: s.project.id,
            assessmentAsked: true,
            preferencesAsked: true,
        });
        expect(
            (await requestContext(s.db, fresh.token)).request.projectId,
        ).toBe(s.project.id);
        expect(await s.db.query.responses.findMany()).toEqual(responses);
        expect(await s.db.query.assessments.findMany()).toEqual(assessments);
        expect(await s.db.query.confirmedAssignments.findMany()).toEqual(
            assignments,
        );
        await s.db
            .update(schema.projects)
            .set({
                status: 'archived',
                archivedAt: null,
                statusBeforeArchive: null,
            })
            .where(eq(schema.projects.id, s.other.id));
        expect(await restoreProject(s.db, teacherAccess, s.other.id)).toBe(
            'setup',
        );
    } finally {
        await s.close();
    }
});

it('deletes only project-local records and retains student knowledge, provenance and confirmed pairing history', async () => {
    const s = await setup();
    try {
        const ids = s.people.map((person) => person.id);
        const history = await confirmedPairHistory(s.db, ids);
        const people = await s.db.query.studentRecords.findMany(),
            enrollments = await s.db.query.enrollments.findMany();
        const assessment = (await s.db.query.assessments.findFirst())!;
        const preference =
            (await s.db.query.preferenceSubmissions.findFirst())!;
        const choices = await s.db.query.preferenceChoices.findMany();
        await s.db.insert(schema.teamHistory).values({
            projectId: s.project.id,
            student1Id: s.participants[0].id,
            student2Id: s.participants[1].id,
        });
        await deleteProject(s.db, s.access, s.project.id);
        expect(
            await s.db.query.projects.findFirst({
                where: eq(schema.projects.id, s.project.id),
            }),
        ).toBeUndefined();
        expect(
            await s.db.query.projects.findFirst({
                where: eq(schema.projects.id, s.other.id),
            }),
        ).toBeDefined();
        expect(
            await s.db.query.students.findMany({
                where: eq(schema.students.projectId, s.project.id),
            }),
        ).toEqual([]);
        expect(await s.db.query.responses.findMany()).toEqual([]);
        expect(await s.db.query.teams.findMany()).toEqual([]);
        expect(await s.db.query.teamHistory.findMany()).toEqual([]);
        expect(await s.db.query.studentRecords.findMany()).toEqual(people);
        expect(await s.db.query.enrollments.findMany()).toEqual(enrollments);
        expect(await s.db.query.assessments.findFirst()).toEqual({
            ...assessment,
            projectId: null,
        });
        expect(await s.db.query.preferenceSubmissions.findFirst()).toEqual({
            ...preference,
            projectId: null,
        });
        expect(await s.db.query.preferenceChoices.findMany()).toEqual(choices);
        expect(await confirmedPairHistory(s.db, ids)).toEqual(history);
        const source = (await s.db.query.deletedProjectSources.findFirst())!;
        expect(source).toMatchObject({
            id: s.project.id,
            name: 'Film',
            academicPeriod: '2025-2026',
            deletedBy: s.master.id,
        });
        expect(source.retainedRecords.assessmentIds).toEqual([assessment.id]);
        expect(source.retainedRecords.preferenceSubmissionIds).toEqual([
            preference.id,
        ]);
        expect(source.retainedRecords.assignmentIds).toHaveLength(1);
        expect(
            (await s.db.query.pairingRestrictions.findFirst())!.projectId,
        ).toBeNull();
        expect((await s.db.query.teamDrafts.findFirst())!.projectName).toBe(
            'Film',
        );
        expect(
            (await s.db.query.updateRequests.findFirst({
                where: eq(schema.updateRequests.id, s.pending.requestId),
            }))!,
        ).toMatchObject({ projectId: null, participantId: null });
        await expect(requestContext(s.db, s.pending.token)).rejects.toThrow();
        const profile = (
            await loadStudentProfiles(s.db, s.access, [s.people[0].id], {
                relationshipView: 'latest-recorded',
            })
        ).get(s.people[0].id)!;
        expect(profile.values.skillsTechnical.camera).toBe(5);
        expect(profile.relationships[0].sourceLabel).toContain('Film');
        expect(profile.assignments).toHaveLength(1);
        expect(
            (await s.client.execute('PRAGMA foreign_key_check')).rows,
        ).toEqual([]);
    } finally {
        await s.close();
    }
});

it('enforces deletion permissions and rolls back archive/deletion when persistence fails', async () => {
    const s = await setup();
    try {
        const teacherAccess = await teachingAccess(s.db, s.teacher);
        await expect(
            deleteProject(s.db, teacherAccess, s.project.id),
        ).rejects.toThrow();
        const outsider = { ...teacherAccess, projectIds: new Set<number>() };
        await expect(
            archiveProject(s.db, outsider, s.project.id),
        ).rejects.toThrow();
        await s.client.execute(
            "CREATE TRIGGER fail_revoke BEFORE UPDATE ON update_requests BEGIN SELECT RAISE(ABORT, 'fail'); END",
        );
        await expect(
            archiveProject(s.db, s.access, s.project.id),
        ).rejects.toThrow();
        expect(
            (await s.db.query.projects.findFirst({
                where: eq(schema.projects.id, s.project.id),
            }))!.archivedAt,
        ).toBeNull();
        expect((await requestContext(s.db, s.pending.token)).request.id).toBe(
            s.pending.requestId,
        );
        await s.client.execute('DROP TRIGGER fail_revoke');
        await s.client.execute(
            "CREATE TRIGGER fail_delete BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT, 'fail'); END",
        );
        await expect(
            deleteProject(s.db, s.access, s.project.id),
        ).rejects.toThrow();
        expect(await s.db.query.deletedProjectSources.findMany()).toEqual([]);
        expect(await s.db.query.responses.findMany()).toHaveLength(1);
        expect((await requestContext(s.db, s.pending.token)).request.id).toBe(
            s.pending.requestId,
        );
        await s.client.execute('DROP TRIGGER fail_delete');
        const [review] = await s.db
            .insert(schema.identityReviews)
            .values({
                sourceType: 'participant',
                sourceId: s.participants[0].id,
                provisionalStudentId: s.people[0].id,
                reason: 'Unresolved',
                candidates: [],
            })
            .returning();
        await expect(
            deleteProject(s.db, s.access, s.project.id),
        ).rejects.toThrow('identitate');
        await s.db
            .update(schema.identityReviews)
            .set({ resolvedAt: '2026-10-14' })
            .where(eq(schema.identityReviews.id, review.id));
        await s.db
            .delete(schema.preferenceSubmissions)
            .where(eq(schema.preferenceSubmissions.projectId, s.project.id));
        await expect(
            deleteProject(s.db, s.access, s.project.id),
        ).rejects.toThrow('Inportatu erantzunen historia');
        expect(await s.db.query.responses.findMany()).toHaveLength(1);
        expect(await s.db.query.deletedProjectSources.findMany()).toEqual([]);
    } finally {
        await s.close();
    }
});
