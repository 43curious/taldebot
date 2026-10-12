import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { InputError, routeError } from '../../../lib/input';
import { requireProject } from '../../../lib/access';
import { projects } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

const deletionSchema = z.object({
    projectId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const body: unknown = await request.json().catch(() => {
            throw new InputError('Invalid JSON');
        });
        const { projectId } = deletionSchema.parse(body);
        requireProject(locals.teacherAccess, projectId);
        const deleted = await db
            .update(projects)
            .set({ status: 'archived', archivedAt: new Date().toISOString() })
            .where(eq(projects.id, projectId))
            .returning({ id: projects.id });
        if (!deleted.length) throw new InputError('Project not found', 404);
        return Response.json({ success: true });
    } catch (error) {
        return routeError(error);
    }
};
