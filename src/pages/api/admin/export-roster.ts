import type { APIRoute } from 'astro';
import { eq, asc } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { classMembers, classes } from '../../../../db/schema';
import { requireClass } from '../../../lib/access';
import { parseId, routeError } from '../../../lib/input';
import { rosterCsv } from '../../../lib/roster';

export const GET: APIRoute = async ({ url, locals }) => {
    const classId = parseId(url.searchParams.get('classId'));
    if (!classId) return new Response('Invalid class ID', { status: 400 });
    try {
        requireClass(locals.teacherAccess, classId);
    } catch (error) {
        return routeError(error);
    }
    const group = await db.query.classes.findFirst({
        where: eq(classes.id, classId),
    });
    if (!group) return new Response('Class not found', { status: 404 });
    const members = await db
        .select()
        .from(classMembers)
        .where(eq(classMembers.classId, classId))
        .orderBy(asc(classMembers.name));
    const csv = rosterCsv([
        ['Izena', 'Emaila', 'Tutorea', 'Taldea', 'Ibilbidea'],
        ...members.map((member) => [
            member.name,
            member.email,
            member.tutor,
            member.division,
            member.academicStatus,
        ]),
    ]);
    return new Response(csv, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="class-${classId}.csv"`,
            'Cache-Control': 'no-store',
        },
    });
};
