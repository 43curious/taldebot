import { beforeEach, afterEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { testDatabase } from './testDatabase';
import { teachingAccess } from '../access';
import {
    resolveStudent,
    enrollStudent,
    endEnrollment,
} from '../studentIdentity';
import {
    saveClassGroup,
    archiveClassGroup,
    importAssignmentGroups,
} from '../classGroups';
import { createProject } from '../projectOperations';
import { deleteProject } from '../projectLifecycle';
import { projectSchema } from '../input';
import {
    generateDraft,
    confirmDraft,
    confirmedPairHistory,
} from '../formation';
let fixture: Awaited<ReturnType<typeof testDatabase>>;
beforeEach(async () => {
    fixture = await testDatabase();
});
afterEach(async () => {
    await fixture.close();
});
async function setup() {
    const { db } = fixture;
    const [master, teacher] = await db
        .insert(schema.users)
        .values([
            { username: 'master', hashedPassword: 'unused', role: 'master' },
            { username: 'teacher', hashedPassword: 'unused', role: 'admin' },
        ])
        .returning();
    const classes = await db
        .insert(schema.classes)
        .values([
            { name: 'First', year: 1 },
            { name: 'Second', year: 2 },
        ])
        .returning();
    await db
        .insert(schema.teacherResponsibilities)
        .values({ userId: teacher.id, classId: classes[0].id });
    const access = await teachingAccess(db, master);
    const people = [];
    for (const name of ['Ane', 'Iker', 'Miren', 'Leire']) {
        const person = await resolveStudent(
            db,
            { name, email: `${name}@example.com` },
            access,
        );
        await enrollStudent(db, person, classes[0].id, '2026-2027');
        people.push(person);
    }
    await enrollStudent(db, people[0], classes[1].id, '2026-2027');
    return { db, master, teacher, classes, access, people };
}
const activity = (ids: number[], classGroupId?: number) =>
    projectSchema.parse({
        name: 'Film',
        numTeams: 1,
        adminEmail: 'teacher@example.com',
        projectType: 'balanced',
        classGroupId,
        studentsJson: JSON.stringify(
            ids.map((id) => ({ name: 'Roster name', studentRecordId: id })),
        ),
    });
it('preserves overlapping dated group memberships and immutable activity audiences through edits, enrollment ends and archiving', async () => {
    const s = await setup(),
        ids = s.people.map((person) => person.id);
    const data = {
        classId: s.classes[0].id,
        moduleName: 'Writing',
        name: 'A',
        studentIds: [ids[0], ids[1], ids[0]],
    };
    const groupId = await saveClassGroup(s.db, s.access, data);
    const overlapping = await saveClassGroup(s.db, s.access, {
        ...data,
        name: 'B',
    });
    const otherClass = await saveClassGroup(s.db, s.access, {
        ...data,
        classId: s.classes[1].id,
        studentIds: [ids[0]],
    });
    const project = await createProject(
        s.db,
        activity([ids[0]], groupId),
        s.access,
    );
    const original = project.audienceSnapshot;
    expect(original).toMatchObject({
        groupName: 'A',
        moduleName: 'Writing',
        classId: s.classes[0].id,
        studentIds: [ids[0]],
    });
    await saveClassGroup(
        s.db,
        s.access,
        { ...data, name: 'Renamed', studentIds: [ids[0], ids[2]] },
        groupId,
    );
    let history = await s.db.query.classGroupMembers.findMany({
        where: eq(schema.classGroupMembers.groupId, groupId),
    });
    expect(history).toHaveLength(3);
    expect(
        history.find((row) => row.studentId === ids[1])!.leftAt,
    ).not.toBeNull();
    expect(
        (await s.db.query.projects.findFirst({
            where: eq(schema.projects.id, project.id),
        }))!.audienceSnapshot,
    ).toEqual(original);
    expect(
        (
            await s.db.query.students.findMany({
                where: eq(schema.students.projectId, project.id),
            })
        ).map((row) => row.studentRecordId),
    ).toEqual([ids[0]]);
    const member = await s.db.query.classMembers.findFirst({
        where: (row, { and, eq }) =>
            and(
                eq(row.studentRecordId, ids[0]),
                eq(row.classId, s.classes[0].id),
            ),
    });
    await s.db.transaction((tx) => endEnrollment(tx, member!.id));
    history = await s.db.query.classGroupMembers.findMany({
        where: eq(schema.classGroupMembers.studentId, ids[0]),
    });
    expect(
        history
            .filter(
                (row) => row.groupId === groupId || row.groupId === overlapping,
            )
            .every((row) => row.leftAt !== null),
    ).toBe(true);
    expect(
        history.find((row) => row.groupId === otherClass)!.leftAt,
    ).toBeNull();
    await archiveClassGroup(s.db, s.access, groupId);
    await expect(
        createProject(s.db, activity([ids[2]], groupId), s.access),
    ).rejects.toThrow('erabilgarri');
    const draft = await generateDraft(s.db, s.access, project.id, 'v2', {
        method: 'random',
    });
    expect(draft.inputSnapshot!.audience).toEqual(original);
    await confirmDraft(s.db, s.access, project.id, draft.id);
    await deleteProject(s.db, s.access, project.id);
    expect(
        (await s.db.query.deletedProjectSources.findFirst({
            where: eq(schema.deletedProjectSources.id, project.id),
        }))!.audienceSnapshot,
    ).toEqual(original);
    expect(await confirmedPairHistory(s.db, ids)).toEqual([]);
});
it('rejects cross-class, unresolved and stale audiences, and rechecks revoked grants before writes', async () => {
    const s = await setup(),
        ids = s.people.map((person) => person.id);
    const access = await teachingAccess(s.db, s.teacher);
    const data = {
        classId: s.classes[0].id,
        moduleName: 'Writing',
        name: 'A',
        studentIds: [ids[0], ids[1]],
    };
    const groupId = await saveClassGroup(s.db, access, data);
    await expect(
        saveClassGroup(s.db, access, { ...data, classId: s.classes[1].id }),
    ).rejects.toThrow('baimenik');
    await expect(
        saveClassGroup(s.db, s.access, { ...data, classId: s.classes[1].id }),
    ).rejects.toThrow('klase honetan');
    await expect(saveClassGroup(s.db, access, data)).rejects.toThrow(
        'izen bereko',
    );
    await expect(
        createProject(s.db, activity([ids[2]], groupId), access),
    ).rejects.toThrow('Zerrenda aldatu');
    expect(await s.db.query.projects.findMany()).toHaveLength(0);
    await s.db
        .update(schema.studentRecords)
        .set({ needsReview: true })
        .where(eq(schema.studentRecords.id, ids[1]));
    await expect(
        createProject(s.db, activity([ids[1]], groupId), access),
    ).rejects.toThrow('identitate');
    await s.db
        .delete(schema.teacherResponsibilities)
        .where(eq(schema.teacherResponsibilities.userId, s.teacher.id));
    await expect(
        saveClassGroup(
            s.db,
            access,
            { ...data, studentIds: [ids[0]] },
            groupId,
        ),
    ).rejects.toThrow('baimenik');
    await expect(
        createProject(s.db, activity([ids[0]], groupId), access),
    ).rejects.toThrow('baimenik');
});
it('imports confirmed random teams atomically with provenance without adding new pair history', async () => {
    const s = await setup(),
        ids = s.people.map((person) => person.id);
    const project = await createProject(s.db, activity(ids), s.access);
    const draft = await generateDraft(s.db, s.access, project.id, 'v2', {
        method: 'random',
        numTeams: 2,
    });
    await expect(
        importAssignmentGroups(
            s.db,
            s.access,
            s.classes[0].id,
            draft.id,
            'Writing',
            'Group',
        ),
    ).rejects.toThrow();
    const assignment = await confirmDraft(s.db, s.access, project.id, draft.id);
    const before = await confirmedPairHistory(s.db, ids);
    const groups = await importAssignmentGroups(
        s.db,
        s.access,
        s.classes[0].id,
        assignment.id,
        'Writing',
        'Group',
    );
    expect(groups).toHaveLength(2);
    const saved = await s.db.query.classGroups.findMany();
    expect(saved.every((row) => row.sourceAssignmentId === assignment.id)).toBe(
        true,
    );
    expect(
        (await s.db.query.classGroupMembers.findMany())
            .map((row) => row.studentId)
            .sort(),
    ).toEqual([...ids].sort());
    expect(await confirmedPairHistory(s.db, ids)).toEqual(before);
    // A duplicate name in the second team rolls back the first imported team too.
    await saveClassGroup(s.db, s.access, {
        classId: s.classes[0].id,
        moduleName: 'Sound',
        name: 'Duplicate 2',
        studentIds: [],
    });
    await expect(
        importAssignmentGroups(
            s.db,
            s.access,
            s.classes[0].id,
            assignment.id,
            'Sound',
            'Duplicate',
        ),
    ).rejects.toThrow('izen bereko');
    expect(
        (await s.db.query.classGroups.findMany()).some(
            (row) => row.name === 'Duplicate 1',
        ),
    ).toBe(false);
});
