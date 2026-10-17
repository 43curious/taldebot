import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import {
    teacherSurveyTarget,
    teacherSurveyReturn,
} from '../../../lib/teacherSurveyTarget';
import { submitTeacherSurvey } from '../../../lib/teacherSurvey';
import { routeError } from '../../../lib/input';

const input = z.object({
    target: teacherSurveyTarget,
    answers: z.unknown(),
    consent: z.boolean(),
    email: z.string().optional(),
});
export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const data = input.parse(await request.json());
        await submitTeacherSurvey(
            db,
            locals.teacherAccess,
            data.target,
            data.answers,
            data.consent,
            data.email,
        );
        return Response.json({
            returnUrl: `${teacherSurveyReturn(data.target)}?saved=teacher-entry`,
        });
    } catch (error) {
        return routeError(error);
    }
};
