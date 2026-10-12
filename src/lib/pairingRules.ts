import { eq } from 'drizzle-orm';
import { pairingRestrictions, students } from '../../db/schema';
import type { AppDatabase } from './db';
import {
    requireStudent,
    requireProject,
    isMaster,
    type TeacherAccess,
} from './access';
import { InputError } from './input';
import { academicPeriod } from './studentIdentity';

export async function addRestriction(
    db: AppDatabase,
    access: TeacherAccess,
    input: {
        student1Id: number;
        student2Id: number;
        scope: 'project' | 'period';
        projectId?: number;
        academicPeriod?: string;
        reviewAt: string;
        reason?: string;
    },
) {
    requireStudent(access, input.student1Id);
    requireStudent(access, input.student2Id);
    if (input.student1Id === input.student2Id)
        throw new InputError('Aukeratu bi ikasle ezberdin.');
    if (input.scope === 'project') {
        if (!input.projectId) throw new InputError('Aukeratu proiektua.');
        requireProject(access, input.projectId);
        const participants = await db.query.students.findMany({
            where: eq(students.projectId, input.projectId),
        });
        if (
            ![input.student1Id, input.student2Id].every((id) =>
                participants.some((row) => row.studentRecordId === id),
            )
        )
            throw new InputError(
                'Bi ikasleek proiektuan parte hartu behar dute.',
            );
    }
    const [row] = await db
        .insert(pairingRestrictions)
        .values({
            student1Id: Math.min(input.student1Id, input.student2Id),
            student2Id: Math.max(input.student1Id, input.student2Id),
            scope: input.scope,
            projectId: input.scope === 'project' ? input.projectId! : null,
            academicPeriod: input.academicPeriod || academicPeriod(),
            reviewAt: input.reviewAt,
            reason: input.reason || null,
            createdBy: access.actor.id,
            createdAt: new Date().toISOString(),
        })
        .returning();
    return row;
}
export async function withdrawRestriction(
    db: AppDatabase,
    access: TeacherAccess,
    id: number,
) {
    const rule = await db.query.pairingRestrictions.findFirst({
        where: eq(pairingRestrictions.id, id),
    });
    if (!rule) throw new InputError('Murrizketa ez da existitzen.', 404);
    requireStudent(access, rule.student1Id);
    requireStudent(access, rule.student2Id);
    if (!isMaster(access) && rule.createdBy !== access.actor.id)
        throw new InputError(
            'Murrizketa egileak edo masterrak bakarrik alda dezake.',
            403,
        );
    await db
        .update(pairingRestrictions)
        .set({ withdrawnAt: new Date().toISOString() })
        .where(eq(pairingRestrictions.id, id));
}
