import type { APIRoute } from 'astro';
import { parseId, routeError } from '../../../lib/input';
import { db } from '../../../lib/db';
import { students } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const studentId = parseId(url.searchParams.get('studentId'));
        const projectId = parseId(url.searchParams.get('projectId'));
        const exclude = url.searchParams.get('exclude') === 'true';

        if (!studentId || !projectId) {
            return new Response('Invalid params', { status: 400 });
        }

        await db
            .update(students)
            .set({ isExcluded: exclude })
            .where(
                and(
                    eq(students.id, studentId),
                    eq(students.projectId, projectId),
                ),
            );

        return Response.json({ success: true });
    } catch (error) {
        return routeError(error);
    }
};
