import type { APIRoute } from 'astro';
import { inArray, eq } from 'drizzle-orm';
import Papa from 'papaparse';
import { db } from '../../../lib/db';
import { surveyResponses, questionnaireVersions } from '../../../../db/schema';
import { requireSurvey } from '../../../lib/surveyCollections';
import { positiveId, routeError, InputError } from '../../../lib/input';
export const GET: APIRoute = async ({ url, locals }) => {
    try {
        const { survey, audience } = await requireSurvey(
            db,
            locals.teacherAccess,
            positiveId.parse(url.searchParams.get('surveyId')),
        );
        const responses = await db.query.surveyResponses.findMany({
            where: eq(surveyResponses.surveyId, survey.id),
        });
        if (!responses.length)
            throw new InputError(
                'Ez dago jasotako erantzunik esportatzeko.',
                409,
            );
        const versions = await db.query.questionnaireVersions.findMany({
            where: inArray(
                questionnaireVersions.id,
                responses.map((row) => row.versionId),
            ),
        });
        const rows = responses.flatMap((response) => {
            const version = versions.find(
                    (row) => row.id === response.versionId,
                ),
                person = audience.find(
                    (row) => row.studentId === response.studentId,
                );
            if (!version || !person)
                throw new InputError(
                    'Erantzunaren jatorria berrikusi behar da.',
                    409,
                );
            return version.questions.map((question) => {
                const answer = response.answers[question.key];
                const peers =
                    question.type === 'preference' && Array.isArray(answer)
                        ? answer
                        : question.type === 'collaboration' &&
                            answer &&
                            typeof answer === 'object' &&
                            !Array.isArray(answer)
                          ? Object.keys(answer).map(Number)
                          : [];
                return {
                    Ikaslea: person.studentName,
                    Inkesta: survey.name,
                    Klasea: person.snapshot.className,
                    Maila: person.snapshot.year,
                    Espezialitatea: person.snapshot.division ?? '',
                    Ikasturtea: survey.academicPeriod,
                    'Galdera-sorta': `questionnaire-${version.questionnaireId}/v${version.version}`,
                    'Jasotze-data': response.submittedAt,
                    'Galdera gakoa': question.key,
                    'Galdera mota': question.type,
                    'Galdera EU': question.label.eu,
                    'Galdera EN': question.label.en,
                    Eskala:
                        question.type === 'skill'
                            ? '1–10 (autoebaluazioa)'
                            : '',
                    'Erantzuna JSON': JSON.stringify(answer ?? null),
                    'Kideen izenak': peers
                        .map(
                            (id) =>
                                audience.find((p) => p.studentId === id)
                                    ?.studentName ?? 'Ikasle historikoa',
                        )
                        .join('; '),
                };
            });
        });
        const csv = Papa.unparse(rows, { escapeFormulae: true });
        return new Response('\uFEFF' + csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="inkesta-${survey.id}.csv"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        return routeError(error);
    }
};
