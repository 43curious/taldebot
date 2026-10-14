import { it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { teachingAccess } from '../access';
import { testDatabase } from './testDatabase';

it('loads current responsibilities in one query while preserving class, identity and project isolation', async () => {
    const f = await testDatabase();
    try {
        const [teacher, other] = await f.db
            .insert(schema.users)
            .values([
                {
                    username: 'teacher',
                    hashedPassword: 'unused',
                    role: 'admin',
                },
                { username: 'other', hashedPassword: 'unused', role: 'admin' },
            ])
            .returning();
        const [degree, emptyDegree] = await f.db
            .insert(schema.degrees)
            .values([{ name: 'Media' }, { name: 'Empty' }])
            .returning();
        const [first, sibling] = await f.db
            .insert(schema.classes)
            .values([
                { name: 'First', year: 1, degreeId: degree.id },
                { name: 'Sibling', year: 2, degreeId: degree.id },
            ])
            .returning();
        const people = await f.db
            .insert(schema.studentRecords)
            .values([
                { name: 'Assigned' },
                { name: 'Sibling only' },
                { name: 'Both classes' },
                { name: 'Collected', createdBy: teacher.id },
                {
                    name: 'Collected but enrolled elsewhere',
                    createdBy: teacher.id,
                },
                { name: 'Former enrollment', createdBy: teacher.id },
                { name: 'Active detached class', createdBy: teacher.id },
            ])
            .returning();
        for (const [personIndex, classId, endedAt] of [
            [0, first.id, null],
            [1, sibling.id, null],
            [2, first.id, null],
            [2, sibling.id, null],
            [4, sibling.id, null],
            [5, sibling.id, '2025-06-01'],
            [6, null, null],
        ] as const)
            await f.db
                .insert(schema.enrollments)
                .values({
                    studentId: people[personIndex].id,
                    classId,
                    endedAt,
                    className: 'Snapshot',
                    year: 1,
                    academicPeriod: '2026-2027',
                    source: 'test',
                });
        await f.db
            .insert(schema.teacherResponsibilities)
            .values({ userId: teacher.id, classId: first.id });
        const projects = await f.db
            .insert(schema.projects)
            .values([
                { name: 'Visible', projectType: 'balanced' },
                { name: 'Mixed', projectType: 'balanced', ownerId: teacher.id },
                {
                    name: 'Unlinked',
                    projectType: 'balanced',
                    ownerId: teacher.id,
                },
                {
                    name: 'Own empty',
                    projectType: 'balanced',
                    ownerId: teacher.id,
                },
                {
                    name: 'Other empty',
                    projectType: 'balanced',
                    ownerId: other.id,
                },
            ])
            .returning();
        await f.db.insert(schema.students).values([
            {
                projectId: projects[0].id,
                name: 'Assigned',
                studentRecordId: people[0].id,
            },
            {
                projectId: projects[1].id,
                name: 'Assigned',
                studentRecordId: people[0].id,
            },
            {
                projectId: projects[1].id,
                name: 'Sibling',
                studentRecordId: people[1].id,
            },
            { projectId: projects[2].id, name: 'Unresolved' },
        ]);
        f.clearQueryCount();
        let access = await teachingAccess(f.db, teacher);
        expect([...access.classIds]).toEqual([first.id]);
        expect([...access.degreeIds]).toEqual([degree.id]);
        expect(access.studentIds).toEqual(
            new Set([people[0].id, people[2].id, people[3].id, people[5].id]),
        );
        expect(access.projectIds).toEqual(
            new Set([projects[0].id, projects[3].id]),
        );
        expect(f.queryCount()).toBe(1);
        await f.db.insert(schema.teacherResponsibilities).values([
            { userId: teacher.id, degreeId: degree.id },
            { userId: teacher.id, degreeId: emptyDegree.id },
        ]);
        access = await teachingAccess(f.db, teacher);
        expect(access.classIds).toEqual(new Set([first.id, sibling.id]));
        expect(access.degreeIds).toEqual(new Set([degree.id, emptyDegree.id]));
        expect(access.projectIds.has(projects[1].id)).toBe(true);
        expect(access.projectIds.has(projects[2].id)).toBe(false);
        await f.db
            .delete(schema.teacherResponsibilities)
            .where(eq(schema.teacherResponsibilities.userId, teacher.id));
        access = await teachingAccess(f.db, teacher);
        expect(access.classIds.size).toBe(0);
        expect(access.studentIds).toEqual(
            new Set([people[3].id, people[5].id]),
        );
        expect(access.projectIds).toEqual(new Set([projects[3].id]));
        f.clearQueryCount();
        await teachingAccess(f.db, { id: other.id, role: 'master' });
        expect(f.queryCount()).toBe(0);
    } finally {
        await f.close();
    }
});
