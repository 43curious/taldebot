import { and, eq, isNull } from 'drizzle-orm';
import {
    identityReviews,
    studentRecords,
    classMembers,
    students,
    enrollments,
    assessments,
    preferenceSubmissions,
    preferenceChoices,
    teamDrafts,
} from '../../db/schema';
import type { AppDatabase } from './db';
import { requireMaster, type TeacherAccess } from './access';
import { InputError } from './input';

export async function resolveIdentityReview(
    db: AppDatabase,
    access: TeacherAccess,
    reviewId: number,
    studentId: number,
) {
    requireMaster(access);
    return db.transaction(async (tx) => {
        const review = await tx.query.identityReviews.findFirst({
            where: eq(identityReviews.id, reviewId),
        });
        const person = await tx.query.studentRecords.findFirst({
            where: eq(studentRecords.id, studentId),
        });
        if (!review || review.resolvedAt || !person)
            throw new InputError(
                'Berrikuspena edo identitatea ez dago erabilgarri.',
            );
        if (person.needsReview && person.id !== review.provisionalStudentId)
            throw new InputError(
                'Ebatzi hautatutako identitatearen berrikuspena lehenago.',
            );
        if (review.sourceType === 'response')
            throw new InputError(
                'Erantzun honek ez du parte-hartzaile ziurrik. Jatorrizko datuak gordeta daude; ez da egiletzarik asmatuko.',
            );
        if (review.sourceType === 'roster') {
            const member = await tx.query.classMembers.findFirst({
                where: eq(classMembers.id, review.sourceId),
            });
            if (!member)
                throw new InputError(
                    'Matrikula historikoa da; lotura ezin da egungo zerrendan aldatu. Mantendu jatorrizko erregistroa.',
                );
            const duplicate = await tx.query.classMembers.findFirst({
                where: and(
                    eq(classMembers.classId, member.classId),
                    eq(classMembers.studentRecordId, studentId),
                ),
            });
            if (duplicate && duplicate.id !== member.id)
                throw new InputError(
                    'Identitate hau dagoeneko klase honetan dago. Ez dira bi ikasle automatikoki batuko.',
                );
            await tx
                .update(classMembers)
                .set({
                    studentRecordId: person.id,
                    name: person.name,
                    email: person.email,
                })
                .where(eq(classMembers.id, member.id));
            if (member.studentRecordId)
                await tx
                    .update(enrollments)
                    .set({ studentId: person.id })
                    .where(
                        and(
                            eq(enrollments.studentId, member.studentRecordId),
                            eq(enrollments.classId, member.classId),
                            isNull(enrollments.endedAt),
                        ),
                    );
        } else {
            const participant = await tx.query.students.findFirst({
                where: eq(students.id, review.sourceId),
            });
            if (!participant)
                throw new InputError('Parte-hartzailea ez da existitzen.');
            const duplicate = await tx.query.students.findFirst({
                where: and(
                    eq(students.projectId, participant.projectId!),
                    eq(students.studentRecordId, studentId),
                ),
            });
            if (duplicate && duplicate.id !== participant.id)
                throw new InputError(
                    'Identitate hori dagoeneko proiektu honetan dago. Mantendu bi pertsona bereiziak.',
                );
            const oldId = participant.studentRecordId;
            await tx
                .update(students)
                .set({ studentRecordId: person.id })
                .where(eq(students.id, participant.id));
            await tx
                .update(assessments)
                .set({ studentId: person.id })
                .where(eq(assessments.legacyParticipantId, participant.id));
            await tx
                .update(preferenceSubmissions)
                .set({ studentId: person.id })
                .where(
                    eq(
                        preferenceSubmissions.legacyParticipantId,
                        participant.id,
                    ),
                );
            const submissions = await tx.query.preferenceSubmissions.findMany({
                where: eq(
                    preferenceSubmissions.projectId,
                    participant.projectId!,
                ),
            });
            for (const submission of submissions) {
                if (!oldId || !submission.rawLegacyData) continue;
                for (const [kind, column] of [
                    ['comfort', 'comfort'],
                    ['preferWith', 'prefer_with'],
                    ['preferAvoid', 'prefer_avoid'],
                ] as const) {
                    let original: unknown = submission.rawLegacyData[column];
                    if (typeof original === 'string') {
                        try {
                            original = JSON.parse(original);
                        } catch {
                            original = [];
                        }
                    }
                    if (
                        Array.isArray(original) &&
                        original.includes(participant.id)
                    )
                        await tx
                            .update(preferenceChoices)
                            .set({ targetStudentId: person.id })
                            .where(
                                and(
                                    eq(
                                        preferenceChoices.submissionId,
                                        submission.id,
                                    ),
                                    eq(
                                        preferenceChoices.targetStudentId,
                                        oldId,
                                    ),
                                    eq(preferenceChoices.kind, kind),
                                ),
                            );
                }
            }
            const drafts = await tx.query.teamDrafts.findMany({
                where: eq(teamDrafts.projectId, participant.projectId!),
            });
            for (const draft of drafts)
                if (draft.source === 'legacy-draft' && oldId)
                    await tx
                        .update(teamDrafts)
                        .set({
                            allocation: draft.allocation.map((team) => ({
                                ...team,
                                studentIds: team.studentIds.map((id) =>
                                    id === oldId ? person.id : id,
                                ),
                            })),
                        })
                        .where(eq(teamDrafts.id, draft.id));
        }
        await tx
            .update(studentRecords)
            .set({ needsReview: false })
            .where(eq(studentRecords.id, person.id));
        await tx
            .update(identityReviews)
            .set({
                resolvedAt: new Date().toISOString(),
                resolvedBy: access.actor.id,
                resolvedStudentId: person.id,
            })
            .where(eq(identityReviews.id, review.id));
    });
}
