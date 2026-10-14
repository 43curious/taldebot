import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { InputError, routeError } from '../../../lib/input';
import { deleteProject } from '../../../lib/projectLifecycle';

const deletionSchema = z.object({
    projectId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    confirmed: z.literal(true),
});
export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const body: unknown = await request.json().catch(() => {
            throw new InputError('Invalid JSON');
        });
        const { projectId } = deletionSchema.parse(body);
        await deleteProject(db, locals.teacherAccess, projectId);
        return Response.json({
            success: true,
            message:
                'Proiektua ezabatu da. Ikasleen historia eta jatorria mantendu dira.',
        });
    } catch (error) {
        return routeError(error);
    }
};
