import type { APIRoute } from 'astro';
import { parseId, routeError, InputError } from '../../../lib/input';
import { db } from '../../../lib/db';
import { students, projects } from '../../../../db/schema';
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

        const project = await db.query.projects.findFirst({
            where: eq(projects.id, projectId),
        });
        if (!project || project.archivedAt)
            throw new InputError('Proiektua ez dago erabilgarri.', 404);
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
