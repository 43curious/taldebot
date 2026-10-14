import { eq, and, inArray } from 'drizzle-orm';
import { studentRecords, classMembers } from '../../db/schema';
import { requireStudent, teachingAccess, type TeacherAccess } from './access';
import type { AppDatabase } from './db';
import { z } from 'zod';

export const townSchema = z
    .string()
    .trim()
    .max(120, 'Herriaren izenak gehienez 120 karaktere izan ditzake.')
    .transform((value) => value.replace(/\s+/g, ' '));
export const townKey = (town: string) =>
    town.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('eu');

// Only a teacher-confirmed term-time town can affect formation.
export async function updateStudentLocation(
    db: AppDatabase,
    access: TeacherAccess,
    studentId: number,
    town: string,
) {
    const value = townSchema.parse(town);
    return db.transaction(async (tx) => {
        requireStudent(await teachingAccess(tx, access.actor), studentId);
        await tx
            .update(studentRecords)
            .set({
                termTimeTown: value || null,
                termTimeTownSource: 'teacher',
                termTimeTownUpdatedAt: new Date().toISOString(),
            })
            .where(eq(studentRecords.id, studentId));
    });
}

// Preserve unambiguous roster towns as suggestions, without assuming they are term-time residences.
// Mark each processed identity once, so later edits/clears cannot be overwritten on migration reruns.
export async function backfillStudentLocations(db: AppDatabase) {
    return db.transaction(async (tx) => {
        const unknown = await tx.query.studentRecords.findMany({
            where: eq(studentRecords.termTimeTownSource, 'unknown'),
        });
        if (!unknown.length) return;
        const roster = await tx.query.classMembers.findMany({
            columns: { studentRecordId: true, town: true },
            where: inArray(
                classMembers.studentRecordId,
                unknown.map((person) => person.id),
            ),
        });
        for (const person of unknown) {
            const towns = new Map<string, string>();
            for (const row of roster.filter(
                (row) => row.studentRecordId === person.id,
            )) {
                if (!row.town?.trim()) continue;
                towns.set(
                    townKey(row.town),
                    row.town.trim().replace(/\s+/g, ' '),
                );
            }
            if (!towns.size) continue;
            const town = towns.size === 1 ? [...towns.values()][0] : null;
            await tx
                .update(studentRecords)
                .set({
                    termTimeTown:
                        town && townSchema.safeParse(town).success
                            ? town
                            : null,
                    termTimeTownSource: 'roster',
                })
                .where(
                    and(
                        eq(studentRecords.id, person.id),
                        eq(studentRecords.termTimeTownSource, 'unknown'),
                    ),
                );
        }
    });
}
