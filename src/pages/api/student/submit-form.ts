import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { submissionSchema, routeError } from '../../../lib/input';
import { submitSurvey } from '../../../lib/projectOperations';
import { studentPath } from '../../../lib/i18n';

export const POST: APIRoute = async ({ request, redirect }) => {
    try {
        const data = submissionSchema.parse(
            Object.fromEntries((await request.formData()).entries()),
        );
        await submitSurvey(db, data);
        return redirect(studentPath(data.lang, '/student/confirmation'));
    } catch (error) {
        return routeError(error);
    }
};
