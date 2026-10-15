import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { questionnaireVersions } from '../../../../db/schema';
import { positiveId, routeError, InputError } from '../../../lib/input';
import {
    requireQuestionnaire,
    validateSurveyAnswers,
} from '../../../lib/surveyCollections';
import { trialSurvey } from '../../../lib/trialSurvey';
const schema = z.object({
    versionId: positiveId,
    studentId: positiveId,
    answers: z.unknown(),
    consent: z.literal(true),
});
export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const data = schema.parse(await request.json());
        const version = await db.query.questionnaireVersions.findFirst({
            where: eq(questionnaireVersions.id, data.versionId),
        });
        if (!version)
            throw new InputError('Galdera-sorta ez da existitzen.', 404);
        await requireQuestionnaire(
            db,
            locals.teacherAccess,
            version.questionnaireId,
        );
        const ids = trialSurvey.allStudents.map((s) => s.id);
        if (!ids.includes(data.studentId))
            throw new InputError('Probako ikasleak soilik erabil daitezke.');
        validateSurveyAnswers(
            version.questions,
            data.answers,
            data.studentId,
            ids,
        );
        return Response.json({ success: true });
    } catch (error) {
        return routeError(error);
    }
};
