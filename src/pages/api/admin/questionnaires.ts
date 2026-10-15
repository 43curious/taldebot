import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { positiveId, routeError } from '../../../lib/input';
import { saveQuestionnaire } from '../../../lib/surveyCollections';
export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const data = await request.json();
        const result = await saveQuestionnaire(
            db,
            locals.teacherAccess,
            data,
            data.id === undefined ? undefined : positiveId.parse(data.id),
        );
        return Response.json(result);
    } catch (error) {
        return routeError(error);
    }
};
