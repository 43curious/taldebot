import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { parseId, routeError } from '../../../lib/input';
import { generateDraft } from '../../../lib/formation';
const optionsSchema = z.object({
    numTeams: z.preprocess(
        (value) => (value === '' || value === undefined ? undefined : value),
        z.coerce.number().int().positive().optional(),
    ),
    historyMode: z.enum(['variety', 'balanced', 'familiar']).optional(),
});
export const POST: APIRoute = async ({ request, redirect, locals }) => {
    const url = new URL(request.url);
    const projectId = parseId(url.searchParams.get('projectId'));
    if (!projectId)
        return Response.json({ error: 'Invalid project ID' }, { status: 400 });
    const version = url.searchParams.get('version') === 'v1' ? 'v1' : 'v2';
    try {
        const form = request.headers.get('content-type')?.includes('form')
            ? Object.fromEntries((await request.formData()).entries())
            : {};
        await generateDraft(
            db,
            locals.teacherAccess,
            projectId,
            version,
            optionsSchema.parse(form),
        );
        return redirect(`/admin/teams/${projectId}?version=${version}`);
    } catch (error) {
        return routeError(error);
    }
};
