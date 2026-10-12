import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { parseId, routeError } from '../../../lib/input';
import { resetSurvey } from '../../../lib/projectOperations';

export const POST: APIRoute = async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const studentId = parseId(params.get('studentId'));
    const projectId = parseId(params.get('projectId'));
    if (!studentId || !projectId)
        return Response.json({ error: 'Invalid IDs' }, { status: 400 });
    try {
        await resetSurvey(db, projectId, studentId);
        return Response.json({ success: true });
    } catch (error) {
        return routeError(error);
    }
};
