import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { InputError, routeError } from '../../../lib/input';
import { archiveProject, restoreProject } from '../../../lib/projectLifecycle';

const inputSchema = z.object({
    projectId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    action: z.enum(['archive', 'restore']),
});
export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const body: unknown = await request.json().catch(() => {
            throw new InputError('JSON sarrera ez da balioduna.');
        });
        const { projectId, action } = inputSchema.parse(body);
        if (action === 'archive')
            await archiveProject(db, locals.teacherAccess, projectId);
        else await restoreProject(db, locals.teacherAccess, projectId);
        return Response.json({
            success: true,
            message:
                action === 'archive'
                    ? 'Proiektua artxibatu da. Historia mantendu da.'
                    : 'Proiektua leheneratu da. Inkestarako esteka berriak sortu behar dira.',
        });
    } catch (error) {
        return routeError(error);
    }
};
