import { and, eq, isNull, inArray } from 'drizzle-orm';
import {
    studentRecords,
    studentEmails,
    classMembers,
    classes,
    degrees,
    enrollments,
    classGroups,
    classGroupMembers,
} from '../../db/schema';
import type { AppDatabase } from './db';
import { studentNameKey } from './identityMatching';
import { InputError } from './input';
import {
    canReadStudent,
    requireClass,
    requireStudent,
    teachingAccess,
    type TeacherAccess,
} from './access';

export type DataSession = Pick<
    AppDatabase,
    'select' | 'insert' | 'update' | 'delete' | 'query' | 'all'
>;
export function academicPeriod(date = new Date()) {
    const year = date.getUTCFullYear() - (date.getUTCMonth() < 8 ? 1 : 0);
    return `${year}-${year + 1}`;
}

export async function resolveStudent(
    store: DataSession,
    input: { name: string; email?: string | null; studentRecordId?: number },
    access?: TeacherAccess,
) {
    const name = input.name.trim();
    const email = input.email?.trim().toLowerCase() || null;
    if (!name) throw new InputError('Ikaslearen izena beharrezkoa da.');
    let person: typeof studentRecords.$inferSelect | undefined;
    if (input.studentRecordId !== undefined) {
        person = await store.query.studentRecords.findFirst({
            where: eq(studentRecords.id, input.studentRecordId),
        });
        if (!person) throw new InputError('Ikaslea ez da existitzen.');
    } else if (email) {
        const aliases = await store.query.studentEmails.findMany({
            where: eq(studentEmails.email, email),
        });
        const ids = [...new Set(aliases.map((row) => row.studentId))];
        if (ids.length > 1)
            throw new InputError(
                'Email hau hainbat identitateri dagokio. Eskatu masterrari lotura berrikusteko.',
                409,
            );
        if (ids.length === 1)
            person = await store.query.studentRecords.findFirst({
                where: eq(studentRecords.id, ids[0]),
            });
    } else {
        const matches = (await store.query.studentRecords.findMany()).filter(
            (row) => studentNameKey(row.name) === studentNameKey(name),
        );
        if (matches.length > 1)
            throw new InputError(
                'Izen bera duten ikasleak daude. Aukeratu zerrendako identitatea edo gehitu emaila.',
                409,
            );
        person = matches[0];
    }
    if (person) {
        if (access && !canReadStudent(access, person.id))
            throw new InputError(
                'Dagoen identitatea lotzeko, masterraren laguntza behar da.',
                403,
            );
        return person;
    }
    const [created] = await store
        .insert(studentRecords)
        .values({ name, email, createdBy: access?.actor.id ?? null })
        .returning();
    if (email)
        await store
            .insert(studentEmails)
            .values({ studentId: created.id, email, source: 'teacher-entry' });
    return created;
}

export async function enrollStudent(
    store: DataSession,
    person: typeof studentRecords.$inferSelect,
    classId: number,
    period: string,
) {
    const group = await store.query.classes.findFirst({
        where: eq(classes.id, classId),
    });
    if (!group) throw new InputError('Klasea ez da existitzen.');
    const existing = await store.query.classMembers.findFirst({
        where: and(
            eq(classMembers.classId, classId),
            eq(classMembers.studentRecordId, person.id),
        ),
    });
    if (existing) return existing;
    const degree =
        group.degreeId === null
            ? undefined
            : await store.query.degrees.findFirst({
                  where: eq(degrees.id, group.degreeId),
              });
    const [member] = await store
        .insert(classMembers)
        .values({
            classId,
            studentRecordId: person.id,
            name: person.name,
            email: person.email,
        })
        .returning();
    await store.insert(enrollments).values({
        studentId: person.id,
        classId,
        className: group.name,
        degreeName: degree?.name,
        year: group.year,
        academicPeriod: period,
        startedAt: new Date().toISOString(),
        source: 'teacher-enrollment',
    });
    return member;
}

export async function importStudents(
    db: AppDatabase,
    access: TeacherAccess,
    classId: number,
    members: { name: string; email: string | null }[],
    period = academicPeriod(),
) {
    requireClass(access, classId);
    return db.transaction(async (tx) => {
        const inserted = [];
        for (const input of members)
            inserted.push(
                await enrollStudent(
                    tx,
                    await resolveStudent(tx, input, access),
                    classId,
                    period,
                ),
            );
        return inserted;
    });
}
// Adding a class membership never ends another enrollment.
export async function enrollExistingStudent(
    db: AppDatabase,
    access: TeacherAccess,
    studentId: number,
    classId: number,
    period: string,
) {
    return db.transaction(async (tx) => {
        const current = await teachingAccess(tx, access.actor);
        requireClass(current, classId);
        requireStudent(current, studentId);
        const person = await tx.query.studentRecords.findFirst({
            where: eq(studentRecords.id, studentId),
        });
        if (!person || person.needsReview)
            throw new InputError('Ikaslearen identitatea berrikusi behar da.');
        if (!/^\d{4}-\d{4}$/.test(period))
            throw new InputError('Ikasturtea ez da balioduna.');
        return enrollStudent(tx, person, classId, period);
    });
}
export async function updateStudentIdentity(
    store: DataSession,
    studentId: number,
    name: string,
    email: string | null,
) {
    await store
        .update(studentRecords)
        .set({ name, email })
        .where(eq(studentRecords.id, studentId));
    if (email)
        await store
            .insert(studentEmails)
            .values({
                studentId,
                email: email.trim().toLowerCase(),
                source: 'teacher-correction',
            })
            .onConflictDoNothing();
    await store
        .update(classMembers)
        .set({ name, email })
        .where(eq(classMembers.studentRecordId, studentId));
}
export async function endEnrollment(
    store: DataSession,
    memberId: number,
    expectedClassId?: number,
) {
    const member = await store.query.classMembers.findFirst({
        where: eq(classMembers.id, memberId),
    });
    if (
        !member ||
        (expectedClassId !== undefined && member.classId !== expectedClassId)
    )
        throw new InputError('Matrikula ez da existitzen.', 404);
    if (member.studentRecordId)
        await store
            .update(classGroupMembers)
            .set({ leftAt: new Date().toISOString() })
            .where(
                and(
                    eq(classGroupMembers.studentId, member.studentRecordId),
                    isNull(classGroupMembers.leftAt),
                    inArray(
                        classGroupMembers.groupId,
                        store
                            .select({ id: classGroups.id })
                            .from(classGroups)
                            .where(eq(classGroups.classId, member.classId)),
                    ),
                ),
            );
    if (member.studentRecordId)
        await store
            .update(enrollments)
            .set({
                endedAt: new Date().toISOString(),
                rosterSnapshot: { ...member },
            })
            .where(
                and(
                    eq(enrollments.studentId, member.studentRecordId),
                    eq(enrollments.classId, member.classId),
                    isNull(enrollments.endedAt),
                ),
            );
    await store.delete(classMembers).where(eq(classMembers.id, memberId));
    return member;
}
export async function moveStudent(
    db: AppDatabase,
    access: TeacherAccess,
    memberId: number,
    classId: number,
    period: string,
) {
    requireClass(access, classId);
    return db.transaction(async (tx) => {
        const member = await tx.query.classMembers.findFirst({
            where: eq(classMembers.id, memberId),
        });
        if (!member?.studentRecordId)
            throw new InputError('Identitatea lotu behar da lehenago.');
        requireClass(access, member.classId);
        const person = await tx.query.studentRecords.findFirst({
            where: eq(studentRecords.id, member.studentRecordId),
        });
        if (!person) throw new InputError('Ikaslea ez da existitzen.');
        await endEnrollment(tx, memberId);
        return enrollStudent(tx, person, classId, period);
    });
}
