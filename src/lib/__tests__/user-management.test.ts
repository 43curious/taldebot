import { it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { createUser, updateUser, deleteUser } from '../userManagement';
import { teachingAccess } from '../access';
import { verifyPassword } from '../auth';
import { testDatabase } from './testDatabase';

async function setup() {
    const f = await testDatabase();
    const [master, otherMaster] = await f.db
        .insert(schema.users)
        .values([
            { username: 'master', hashedPassword: 'unused', role: 'master' },
            {
                username: 'other-master',
                hashedPassword: 'unused',
                role: 'master',
            },
        ])
        .returning();
    const [degree] = await f.db
        .insert(schema.degrees)
        .values({ name: 'Media' })
        .returning();
    const groups = await f.db
        .insert(schema.classes)
        .values([
            { name: 'First', year: 1, degreeId: degree.id },
            { name: 'Second', year: 2, degreeId: degree.id },
        ])
        .returning();
    return {
        ...f,
        master,
        otherMaster,
        degree,
        groups,
        access: await teachingAccess(f.db, master),
    };
}
const input = {
    username: 'teacher',
    fullName: 'Teacher',
    email: 'teacher@example.com',
    role: 'admin' as const,
    degreeIds: [],
    classIds: [],
};

it('creates accounts with responsibilities, supports additional masters, and preserves class-only grants', async () => {
    const s = await setup();
    try {
        const id = await createUser(s.db, s.access, {
            ...input,
            password: 'test-password',
            classIds: [s.groups[0].id, s.groups[0].id],
        });
        let account = (await s.db.query.users.findFirst({
            where: eq(schema.users.id, id),
        }))!;
        expect(
            await verifyPassword('test-password', account.hashedPassword),
        ).toBe(true);
        expect((await teachingAccess(s.db, account)).classIds).toEqual(
            new Set([s.groups[0].id]),
        );
        expect(
            await s.db.query.teacherResponsibilities.findMany(),
        ).toHaveLength(1);
        await updateUser(s.db, s.access, id, {
            ...input,
            role: 'master',
            classIds: [s.groups[0].id],
        });
        account = (await s.db.query.users.findFirst({
            where: eq(schema.users.id, id),
        }))!;
        expect((await teachingAccess(s.db, account)).actor.role).toBe('master');
        await updateUser(s.db, s.access, id, {
            ...input,
            degreeIds: [s.degree.id],
        });
        account = (await s.db.query.users.findFirst({
            where: eq(schema.users.id, id),
        }))!;
        expect((await teachingAccess(s.db, account)).classIds).toEqual(
            new Set(s.groups.map((group) => group.id)),
        );
        const masterId = await createUser(s.db, s.access, {
            ...input,
            username: 'new-master',
            role: 'master',
            password: 'test-password',
        });
        expect(
            (await s.db.query.users.findFirst({
                where: eq(schema.users.id, masterId),
            }))!.role,
        ).toBe('master');
    } finally {
        await s.close();
    }
});

it('rolls back both account and role changes when a grant write fails', async () => {
    const s = await setup();
    try {
        const id = await createUser(s.db, s.access, {
            ...input,
            password: 'test-password',
            classIds: [s.groups[0].id],
        });
        const before = (await s.db.query.users.findFirst({
            where: eq(schema.users.id, id),
        }))!;
        const grants = await s.db.query.teacherResponsibilities.findMany();
        await s.client.execute(
            "CREATE TRIGGER fail_grants BEFORE INSERT ON teacher_responsibilities BEGIN SELECT RAISE(ABORT, 'fail'); END",
        );
        await expect(
            updateUser(s.db, s.access, id, {
                ...input,
                role: 'master',
                classIds: [s.groups[1].id],
            }),
        ).rejects.toThrow();
        expect(
            await s.db.query.users.findFirst({
                where: eq(schema.users.id, id),
            }),
        ).toEqual(before);
        expect(await s.db.query.teacherResponsibilities.findMany()).toEqual(
            grants,
        );
        await expect(
            createUser(s.db, s.access, {
                ...input,
                username: 'failed',
                password: 'test-password',
                classIds: [s.groups[1].id],
            }),
        ).rejects.toThrow();
        expect(
            await s.db.query.users.findFirst({
                where: eq(schema.users.username, 'failed'),
            }),
        ).toBeUndefined();
        await s.client.execute('DROP TRIGGER fail_grants');
        await expect(
            updateUser(s.db, s.access, id, { ...input, classIds: [9999] }),
        ).rejects.toThrow('ez dago erabilgarri');
        expect(await s.db.query.teacherResponsibilities.findMany()).toEqual(
            grants,
        );
    } finally {
        await s.close();
    }
});

it('protects self access and authored records, rejects teachers and rechecks a revoked master role', async () => {
    const s = await setup();
    try {
        await expect(
            updateUser(s.db, s.access, s.master.id, {
                ...input,
                username: 'master',
            }),
        ).rejects.toThrow('norberaren');
        await expect(deleteUser(s.db, s.access, s.master.id)).rejects.toThrow(
            'norberaren',
        );
        const id = await createUser(s.db, s.access, {
            ...input,
            password: 'test-password',
        });
        const teacher = (await s.db.query.users.findFirst({
            where: eq(schema.users.id, id),
        }))!;
        await expect(
            createUser(s.db, await teachingAccess(s.db, teacher), {
                ...input,
                username: 'forged',
                password: 'test-password',
            }),
        ).rejects.toThrow();
        await s.db
            .insert(schema.studentRecords)
            .values({ name: 'Authored', createdBy: id });
        await expect(deleteUser(s.db, s.access, id)).rejects.toThrow(
            'egiletza',
        );
        expect(
            await s.db.query.users.findFirst({
                where: eq(schema.users.id, id),
            }),
        ).toBeDefined();
        await s.db
            .update(schema.users)
            .set({ role: 'admin' })
            .where(eq(schema.users.id, s.master.id));
        await expect(
            deleteUser(s.db, s.access, s.otherMaster.id),
        ).rejects.toThrow('master sarbidea');
        expect(
            (await s.db.query.users.findFirst({
                where: eq(schema.users.id, s.otherMaster.id),
            }))!.role,
        ).toBe('master');
    } finally {
        await s.close();
    }
});
