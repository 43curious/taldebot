import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { positiveId, routeError } from '../../../lib/input';
import { inviteSurvey } from '../../../lib/surveyCollections';
const schema = z.object({
    surveyId: positiveId,
    studentId: positiveId.optional(),
});
export const POST: APIRoute = async ({ request, locals, url }) => {
    try {
        const data = schema.parse(await request.json());
        const links = await inviteSurvey(
            db,
            locals.teacherAccess,
            data.surveyId,
            data.studentId,
        );
        return Response.json({
            links: links.map((link) => ({
                ...link,
                url: new URL(`/student/survey/${link.token}`, url.origin).href,
            })),
        });
    } catch (error) {
        return routeError(error);
    }
};
