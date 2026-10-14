import type { APIRoute } from 'astro';
import { routeError } from '../../../lib/input';
import { validateTrialSurvey } from '../../../lib/trialSurvey';

// Admin middleware supplies authentication. Validation has no persistence path.
export const POST: APIRoute = async ({ request }) => {
    try {
        validateTrialSurvey(Object.fromEntries(await request.formData()));
        return Response.json({ success: true });
    } catch (error) {
        return routeError(error);
    }
};
