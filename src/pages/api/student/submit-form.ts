import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { InputError, submissionSchema, routeError } from '../../../lib/input';
import { submitSurvey } from '../../../lib/projectOperations';
import { requestContext } from '../../../lib/studentUpdates';
import { studentPath } from '../../../lib/i18n';

export const POST: APIRoute = async ({ request, redirect }) => {
    try {
        const data = submissionSchema.parse(
            Object.fromEntries((await request.formData()).entries()),
        );
        const context = await requestContext(db, data.requestToken || '', {
            includePreferences: false,
        });
        if (
            context.request.scope !== 'project' ||
            context.request.projectId !== data.projectId ||
            context.request.participantId !== data.studentId
        )
            throw new InputError(
                'Esteka pertsonalak beste inkesta bati dagokio.',
                403,
            );
        await submitSurvey(db, data, context.request.id);
        return redirect(studentPath(data.lang, '/student/confirmation'));
    } catch (error) {
        return routeError(error);
    }
};
