import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { testDatabase } from './testDatabase';
import { teachingAccess } from '../access';
import { graphTeamResults } from '../graphTeamResults';

it('compares both saved algorithms within one project/date without exposing formation inputs or treating drafts as confirmations', async () => {
    const f = await testDatabase();
    try {
        const [master] = await f.db
            .insert(schema.users)
            .values({
                username: 'master',
                hashedPassword: 'unused',
                role: 'master',
            })
            .returning();
        const access = await teachingAccess(f.db, master);
        const projects = await f.db
            .insert(schema.projects)
            .values([
                { name: 'Selected', projectType: 'balanced' },
                { name: 'Other', projectType: 'balanced' },
            ])
            .returning();
        const allocation = [
            {
                teamNumber: 2,
                studentIds: [3],
                justification: 'private justification',
            },
            {
                teamNumber: 1,
                studentIds: [1, 2],
                justification: 'private justification',
            },
        ];
        const drafts = await f.db
            .insert(schema.teamDrafts)
            .values([
                {
                    projectId: projects[0].id,
                    projectName: 'Selected',
                    algorithmVersion: 'v1',
                    source: 'legacy-draft',
                    createdAt: '2026-10-01T10:00:00Z',
                    allocation,
                },
                {
                    projectId: projects[0].id,
                    projectName: 'Selected',
                    algorithmVersion: 'v2',
                    source: 'legacy-draft',
                    createdAt: '2026-10-02T10:00:00Z',
                    allocation: [
                        { teamNumber: 1, studentIds: [2], justification: '' },
                        { teamNumber: 2, studentIds: [1], justification: '' },
                    ],
                },
                {
                    projectId: projects[0].id,
                    projectName: 'Selected',
                    algorithmVersion: 'v1',
                    source: 'generated',
                    createdAt: '2026-10-15T10:00:00Z',
                    allocation: [
                        { teamNumber: 1, studentIds: [1], justification: '' },
                    ],
                },
                {
                    projectId: projects[1].id,
                    projectName: 'Private other project',
                    algorithmVersion: 'v2',
                    source: 'generated',
                    createdAt: '2026-10-16T10:00:00Z',
                    allocation,
                },
            ])
            .returning();
        const visible = new Set([1, 2]);
        const current = await graphTeamResults(
            f.db,
            access,
            projects[0].id,
            visible,
        );
        expect(current.map((result) => result.id)).toEqual([
            `draft-${drafts[2].id}`,
            `draft-${drafts[1].id}`,
        ]);
        expect(current.every((result) => result.kind === 'draft')).toBe(true);
        const historical = await graphTeamResults(
            f.db,
            access,
            projects[0].id,
            visible,
            '2026-10-10',
        );
        expect(historical.map((result) => result.id)).toEqual([
            `draft-${drafts[0].id}`,
            `draft-${drafts[1].id}`,
        ]);
        expect(historical[0].teams).toEqual([
            { teamNumber: 1, studentIds: [1, 2] },
        ]);
        expect(JSON.stringify(historical)).not.toMatch(
            /private justification|Private other project|inputSnapshot/,
        );
        expect(
            await graphTeamResults(
                f.db,
                access,
                projects[0].id,
                visible,
                '2026-09-30',
            ),
        ).toEqual([]);
        expect(await f.db.query.confirmedAssignments.findMany()).toEqual([]);
        const [confirmed] = await f.db
            .insert(schema.confirmedAssignments)
            .values({
                originProjectId: projects[0].id,
                projectId: projects[0].id,
                projectName: 'Selected',
                revision: 1,
                algorithmVersion: 'v2',
                allocation,
                confirmedAt: '2026-10-14T10:00:00Z',
            })
            .returning();
        const adopted = await graphTeamResults(
            f.db,
            access,
            projects[0].id,
            visible,
        );
        expect(adopted[0]).toMatchObject({
            id: `confirmed-${confirmed.id}`,
            kind: 'confirmed',
            revision: 1,
            teams: [{ teamNumber: 1, studentIds: [1, 2] }],
        });
        expect(
            (
                await graphTeamResults(
                    f.db,
                    access,
                    projects[0].id,
                    visible,
                    '2026-10-10',
                )
            ).every((result) => result.kind === 'draft'),
        ).toBe(true);
    } finally {
        await f.close();
    }
});

it('filters historical members by current access and rejects the project after responsibility is revoked', async () => {
    const f = await testDatabase();
    try {
        const [teacher] = await f.db
            .insert(schema.users)
            .values({
                username: 'teacher',
                hashedPassword: 'unused',
                role: 'admin',
            })
            .returning();
        const classes = await f.db
            .insert(schema.classes)
            .values([
                { name: 'Allowed', year: 1 },
                { name: 'Private', year: 2 },
            ])
            .returning();
        const people = await f.db
            .insert(schema.studentRecords)
            .values([{ name: 'Visible' }, { name: 'Private' }])
            .returning();
        await f.db.insert(schema.enrollments).values(
            people.map((person, i) => ({
                studentId: person.id,
                classId: classes[i].id,
                className: classes[i].name,
                year: classes[i].year,
                academicPeriod: '2026-2027',
                source: 'test',
            })),
        );
        await f.db
            .insert(schema.teacherResponsibilities)
            .values({ userId: teacher.id, classId: classes[0].id });
        const [project] = await f.db
            .insert(schema.projects)
            .values({
                name: 'Selected',
                projectType: 'balanced',
                ownerId: teacher.id,
            })
            .returning();
        await f.db.insert(schema.students).values({
            projectId: project.id,
            studentRecordId: people[0].id,
            name: people[0].name,
        });
        await f.db.insert(schema.teamDrafts).values({
            projectId: project.id,
            projectName: project.name,
            algorithmVersion: 'v1',
            source: 'legacy-draft',
            createdAt: '2026-10-01T10:00:00Z',
            allocation: [
                {
                    teamNumber: 1,
                    studentIds: people.map((person) => person.id),
                    justification: '',
                },
            ],
        });
        const access = await teachingAccess(f.db, teacher);
        const visible = new Set(people.map((person) => person.id));
        const results = await graphTeamResults(
            f.db,
            access,
            project.id,
            visible,
        );
        expect(results[0].teams).toEqual([
            { teamNumber: 1, studentIds: [people[0].id] },
        ]);
        await f.db
            .delete(schema.teacherResponsibilities)
            .where(eq(schema.teacherResponsibilities.userId, teacher.id));
        const revoked = await teachingAccess(f.db, teacher);
        await expect(
            graphTeamResults(f.db, revoked, project.id, visible),
        ).rejects.toMatchObject({ status: 403 });
    } finally {
        await f.close();
    }
});
