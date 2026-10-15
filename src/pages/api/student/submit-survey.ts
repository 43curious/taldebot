import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { routeError } from '../../../lib/input';
import { submitCollectionSurvey } from '../../../lib/surveyCollections';
const schema = z.object({
    token: z.string(),
    answers: z.unknown(),
    consent: z.boolean(),
});
export const POST: APIRoute = async ({ request }) => {
    try {
        const data = schema.parse(await request.json());
        await submitCollectionSurvey(
            db,
            data.token,
            data.answers,
            data.consent,
        );
        return Response.json(
            { success: true },
            {
                headers: {
                    'Cache-Control': 'private, no-store',
                    'Referrer-Policy': 'no-referrer',
                },
            },
        );
    } catch (error) {
        const response = routeError(error);
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
    }
};
