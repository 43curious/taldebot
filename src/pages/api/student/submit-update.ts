import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { independentUpdateSchema, routeError } from '../../../lib/input';
import { completeIndependentUpdate } from '../../../lib/studentUpdates';
import { studentPath } from '../../../lib/i18n';
export const POST: APIRoute = async ({ request, redirect }) => {
    try {
        const data = independentUpdateSchema.parse(
            Object.fromEntries((await request.formData()).entries()),
        );
        await completeIndependentUpdate(db, data.requestToken, {
            assessment: data.assessmentJson,
            preferences: data.preferencesJson,
        });
        return redirect(studentPath(data.lang, '/student/confirmation'));
    } catch (error) {
        return routeError(error);
    }
};
