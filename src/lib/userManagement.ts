import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
    classes,
    degrees,
    teacherResponsibilities,
    users,
} from '../../db/schema';
import type { AppDatabase } from './db';
import type { DataSession } from './studentIdentity';
import { requireMaster, type TeacherAccess } from './access';
import { hashPassword } from './auth';
import { InputError, positiveId } from './input';

export const accountSchema = z.object({
    username: z.string().trim().min(1),
    fullName: z.string().trim().default(''),
    email: z.union([z.string().trim().email(), z.literal('')]).default(''),
    role: z.enum(['admin', 'master']),
    degreeIds: z.array(positiveId).default([]),
    classIds: z.array(positiveId).default([]),
});
type AccountInput = z.infer<typeof accountSchema>;

async function currentMaster(store: DataSession, access: TeacherAccess) {
    requireMaster(access);
    const actor = await store.query.users.findFirst({
        where: eq(users.id, access.actor.id),
    });
    if (actor?.role !== 'master')
        throw new InputError(
            'Erabiltzaileak kudeatzeko master sarbidea behar da.',
            403,
        );
}

async function responsibilities(
    store: DataSession,
    userId: number,
    input: AccountInput,
) {
    const degreeIds = [...new Set(input.degreeIds)],
        classIds = [...new Set(input.classIds)];
    const [selectedDegrees, selectedClasses] = await Promise.all([
        degreeIds.length
            ? store.query.degrees.findMany({
                  columns: { id: true },
                  where: inArray(degrees.id, degreeIds),
              })
            : [],
        classIds.length
            ? store.query.classes.findMany({
                  columns: { id: true },
                  where: inArray(classes.id, classIds),
              })
            : [],
    ]);
    if (
        selectedDegrees.length !== degreeIds.length ||
        selectedClasses.length !== classIds.length
    )
        throw new InputError(
            'Hautatutako gradu edo klase bat ez dago erabilgarri.',
        );
    await store
        .delete(teacherResponsibilities)
        .where(eq(teacherResponsibilities.userId, userId));
    const grants = [
        ...degreeIds.map((degreeId) => ({ userId, degreeId, classId: null })),
        ...classIds.map((classId) => ({ userId, degreeId: null, classId })),
    ];
    if (grants.length)
        await store.insert(teacherResponsibilities).values(grants);
}

async function protectMaster(
    store: DataSession,
    access: TeacherAccess,
    account: typeof users.$inferSelect,
) {
    if (account.id === access.actor.id)
        throw new InputError(
            'Ezin da norberaren master sarbidea kendu edo kontua ezabatu.',
            409,
        );
    if (account.role === 'master') {
        const masters = await store.query.users.findMany({
            columns: { id: true },
            where: eq(users.role, 'master'),
        });
        if (masters.length <= 1)
            throw new InputError(
                'Azken masterraren kontua mantendu behar da.',
                409,
            );
    }
}

// Account and grants share a transaction, so failed responsibility writes leave neither half saved.
export async function createUser(
    db: AppDatabase,
    access: TeacherAccess,
    data: AccountInput & { password: string },
) {
    requireMaster(access);
    const input = accountSchema
        .extend({ password: z.string().min(1) })
        .parse(data);
    const hashedPassword = await hashPassword(input.password);
    return db.transaction(async (tx) => {
        await currentMaster(tx, access);
        if (
            await tx.query.users.findFirst({
                where: eq(users.username, input.username),
            })
        )
            throw new InputError('Erabiltzaile izena existitzen da dagoeneko.');
        const [account] = await tx
            .insert(users)
            .values({
                username: input.username,
                fullName: input.fullName || null,
                email: input.email || null,
                role: input.role,
                hashedPassword,
            })
            .returning({ id: users.id });
        await responsibilities(tx, account.id, input);
        return account.id;
    });
}

export async function updateUser(
    db: AppDatabase,
    access: TeacherAccess,
    userId: number,
    data: AccountInput,
) {
    requireMaster(access);
    const id = positiveId.parse(userId),
        input = accountSchema.parse(data);
    return db.transaction(async (tx) => {
        await currentMaster(tx, access);
        const account = await tx.query.users.findFirst({
            where: eq(users.id, id),
        });
        if (!account) throw new InputError('Erabiltzailea ez da aurkitu.', 404);
        if (account.role === 'master' && input.role !== 'master')
            await protectMaster(tx, access, account);
        const duplicate = await tx.query.users.findFirst({
            where: and(
                eq(users.username, input.username),
                sql`${users.id} <> ${id}`,
            ),
        });
        if (duplicate)
            throw new InputError('Erabiltzaile izena existitzen da dagoeneko.');
        await tx
            .update(users)
            .set({
                username: input.username,
                fullName: input.fullName || null,
                email: input.email || null,
                role: input.role,
            })
            .where(eq(users.id, id));
        await responsibilities(tx, id, input);
    });
}

export async function deleteUser(
    db: AppDatabase,
    access: TeacherAccess,
    userId: number,
) {
    requireMaster(access);
    const id = positiveId.parse(userId);
    await db.transaction(async (tx) => {
        await currentMaster(tx, access);
        const account = await tx.query.users.findFirst({
            where: eq(users.id, id),
        });
        if (!account) throw new InputError('Erabiltzailea ez da aurkitu.', 404);
        await protectMaster(tx, access, account);
        const authored = await tx.all(sql`
            SELECT id FROM confirmed_assignments WHERE confirmed_by=${id}
            UNION ALL SELECT id FROM pairing_restrictions WHERE created_by=${id}
            UNION ALL SELECT id FROM update_requests WHERE issued_by=${id}
            UNION ALL SELECT id FROM student_records WHERE created_by=${id}
            UNION ALL SELECT id FROM class_members WHERE notes_author_id=${id}
            UNION ALL SELECT id FROM team_drafts WHERE created_by=${id}
            UNION ALL SELECT id FROM identity_reviews WHERE resolved_by=${id}
            UNION ALL SELECT id FROM projects WHERE owner_id=${id}
            UNION ALL SELECT id FROM deleted_project_sources WHERE deleted_by=${id}
            UNION ALL SELECT id FROM class_groups WHERE created_by=${id}
            UNION ALL SELECT id FROM class_group_members WHERE added_by=${id}
        `);
        if (authored.length)
            throw new InputError(
                'Kontu honek erregistroen egiletza du. Mantendu kontua eta aldatu bere ardurak hemen.',
                409,
            );
        await tx.delete(users).where(eq(users.id, id));
    });
}
