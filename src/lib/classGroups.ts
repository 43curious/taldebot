import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
    classGroups,
    classGroupMembers,
    classMembers,
    classes,
    studentRecords,
    confirmedAssignments,
} from '../../db/schema';
import {
    requireClass,
    requireProject,
    teachingAccess,
    type TeacherAccess,
} from './access';
import type { AppDatabase } from './db';
import type { DataSession } from './studentIdentity';
import { InputError, positiveId } from './input';
import type { ClassGroupAudience } from './trackingTypes';

export const groupSchema = z.object({
    classId: positiveId,
    name: z.string().trim().min(1).max(100),
    moduleName: z.string().trim().min(1).max(100),
    studentIds: z.array(positiveId).transform((ids) => [...new Set(ids)]),
});

export async function requireGroup(
    store: DataSession,
    access: TeacherAccess,
    id: number,
) {
    const group = await store.query.classGroups.findFirst({
        where: eq(classGroups.id, id),
    });
    if (!group?.classId || group.archivedAt)
        throw new InputError('Moduluko taldea ez dago erabilgarri.', 404);
    requireClass(access, group.classId);
    return group;
}

async function validateMembers(
    store: DataSession,
    classId: number,
    ids: number[],
) {
    if (!ids.length) return;
    const roster = await store
        .select({
            id: studentRecords.id,
            needsReview: studentRecords.needsReview,
        })
        .from(classMembers)
        .innerJoin(
            studentRecords,
            eq(studentRecords.id, classMembers.studentRecordId),
        )
        .where(
            and(
                eq(classMembers.classId, classId),
                inArray(studentRecords.id, ids),
            ),
        );
    const valid = new Set(
        roster
            .filter((person) => !person.needsReview)
            .map((person) => person.id),
    );
    if (ids.some((id) => !valid.has(id)))
        throw new InputError(
            'Taldeko ikasle guztiek klase honetan egon behar dute, identitate baieztatuarekin.',
            409,
        );
}

async function uniqueName(
    store: DataSession,
    classId: number,
    moduleName: string,
    name: string,
    exceptId?: number,
) {
    const matches = await store.query.classGroups.findMany({
        where: and(
            eq(classGroups.classId, classId),
            eq(classGroups.moduleName, moduleName),
            eq(classGroups.name, name),
            isNull(classGroups.archivedAt),
        ),
    });
    if (matches.some((group) => group.id !== exceptId))
        throw new InputError(
            'Modulu honetan izen bereko talde bat dago. Aukeratu beste izen bat.',
            409,
        );
}

// Membership changes end dated rows and add new rows; they never modify prior activity audiences.
export async function saveClassGroup(
    db: AppDatabase,
    access: TeacherAccess,
    data: z.input<typeof groupSchema>,
    groupId?: number,
) {
    const input = groupSchema.parse(data);
    return db.transaction(async (tx) => {
        const current = await teachingAccess(tx, access.actor);
        requireClass(current, input.classId);
        const group = groupId ? await requireGroup(tx, current, groupId) : null;
        if (group && group.classId !== input.classId)
            throw new InputError('Taldea beste klase batekoa da.', 403);
        const parent = await tx.query.classes.findFirst({
            where: eq(classes.id, input.classId),
        });
        if (!parent) throw new InputError('Klasea ez da existitzen.', 404);
        await validateMembers(tx, parent.id, input.studentIds);
        await uniqueName(tx, parent.id, input.moduleName, input.name, groupId);
        const now = new Date().toISOString();
        const saved =
            group ??
            (
                await tx
                    .insert(classGroups)
                    .values({
                        classId: parent.id,
                        className: parent.name,
                        name: input.name,
                        moduleName: input.moduleName,
                        createdBy: access.actor.id,
                        createdAt: now,
                    })
                    .returning()
            )[0];
        if (group)
            await tx
                .update(classGroups)
                .set({ name: input.name, moduleName: input.moduleName })
                .where(eq(classGroups.id, group.id));
        const active = await tx.query.classGroupMembers.findMany({
            where: and(
                eq(classGroupMembers.groupId, saved.id),
                isNull(classGroupMembers.leftAt),
            ),
        });
        const removed = active.filter(
            (row) => !input.studentIds.includes(row.studentId),
        );
        if (removed.length)
            await tx
                .update(classGroupMembers)
                .set({ leftAt: now })
                .where(
                    inArray(
                        classGroupMembers.id,
                        removed.map((row) => row.id),
                    ),
                );
        const added = input.studentIds.filter(
            (id) => !active.some((row) => row.studentId === id),
        );
        if (added.length)
            await tx
                .insert(classGroupMembers)
                .values(
                    added.map((studentId) => ({
                        groupId: saved.id,
                        studentId,
                        joinedAt: now,
                        addedBy: access.actor.id,
                        source: 'manual' as const,
                    })),
                );
        return saved.id;
    });
}

export async function archiveClassGroup(
    db: AppDatabase,
    access: TeacherAccess,
    id: number,
) {
    return db.transaction(async (tx) => {
        await requireGroup(tx, await teachingAccess(tx, access.actor), id);
        const now = new Date().toISOString();
        await tx
            .update(classGroupMembers)
            .set({ leftAt: now })
            .where(
                and(
                    eq(classGroupMembers.groupId, id),
                    isNull(classGroupMembers.leftAt),
                ),
            );
        await tx
            .update(classGroups)
            .set({ archivedAt: now })
            .where(eq(classGroups.id, id));
    });
}

// A confirmed allocation supplies provenance, rather than creating another assignment-history system.
export async function importAssignmentGroups(
    db: AppDatabase,
    access: TeacherAccess,
    classId: number,
    assignmentId: number,
    moduleName: string,
    prefix: string,
) {
    const input = groupSchema.parse({
        classId,
        moduleName,
        name: prefix,
        studentIds: [],
    });
    return db.transaction(async (tx) => {
        const current = await teachingAccess(tx, access.actor);
        requireClass(current, classId);
        const assignment = await tx.query.confirmedAssignments.findFirst({
            where: eq(confirmedAssignments.id, assignmentId),
        });
        if (!assignment?.projectId)
            throw new InputError(
                'Hautatu eskuragarri dagoen proiektu baten berrespena.',
                404,
            );
        requireProject(current, assignment.projectId);
        const ids = assignment.allocation.flatMap((team) => team.studentIds);
        if (
            !ids.length ||
            new Set(ids).size !== ids.length ||
            assignment.allocation.some((team) => !team.studentIds.length)
        )
            throw new InputError(
                'Berretsitako kideak berrikusi behar dira.',
                409,
            );
        await validateMembers(tx, classId, ids);
        const parent = await tx.query.classes.findFirst({
            where: eq(classes.id, classId),
        });
        if (!parent) throw new InputError('Klasea ez da existitzen.', 404);
        const result: number[] = [];
        for (const team of assignment.allocation) {
            const name = `${input.name} ${team.teamNumber}`;
            if (name.length > 100)
                throw new InputError(
                    'Taldeen izenak luzeegiak dira. Laburtu aurrizkia.',
                );
            await uniqueName(tx, classId, input.moduleName, name);
            const now = new Date().toISOString();
            const [group] = await tx
                .insert(classGroups)
                .values({
                    classId,
                    className: parent.name,
                    name,
                    moduleName: input.moduleName,
                    sourceAssignmentId: assignment.id,
                    createdBy: access.actor.id,
                    createdAt: now,
                })
                .returning();
            await tx
                .insert(classGroupMembers)
                .values(
                    team.studentIds.map((studentId) => ({
                        groupId: group.id,
                        studentId,
                        joinedAt: now,
                        addedBy: access.actor.id,
                        source: 'confirmed-assignment' as const,
                    })),
                );
            result.push(group.id);
        }
        return result;
    });
}

export async function classGroupAudience(
    store: DataSession,
    access: TeacherAccess,
    groupId: number,
    selectedIds: number[],
): Promise<ClassGroupAudience> {
    const group = await requireGroup(store, access, groupId);
    const ids = [...new Set(selectedIds)];
    const members = await store.query.classGroupMembers.findMany({
        where: and(
            eq(classGroupMembers.groupId, groupId),
            isNull(classGroupMembers.leftAt),
        ),
    });
    if (
        !ids.length ||
        ids.some((id) => !members.some((member) => member.studentId === id))
    )
        throw new InputError(
            'Aukeratu moduluko taldearen egungo ikasleak. Zerrenda aldatu bada, kargatu berriro.',
            409,
        );
    await validateMembers(store, group.classId!, ids);
    const parent = await store.query.classes.findFirst({
        where: eq(classes.id, group.classId!),
    });
    return {
        groupId,
        groupName: group.name,
        moduleName: group.moduleName,
        classId: parent!.id,
        className: parent!.name,
        year: parent!.year,
        capturedAt: new Date().toISOString(),
        studentIds: ids,
    };
}
