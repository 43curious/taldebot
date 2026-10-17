import { z } from 'zod';
import { positiveId } from './input';

const asked = z.preprocess(
    (value) => value === true || value === '1',
    z.boolean(),
);
export const teacherSurveyTarget = z
    .discriminatedUnion('kind', [
        z.object({
            kind: z.literal('project'),
            projectId: positiveId,
            participantId: positiveId,
        }),
        z.object({
            kind: z.literal('survey'),
            surveyId: positiveId,
            studentId: positiveId,
        }),
        z.object({
            kind: z.literal('period'),
            studentId: positiveId,
            academicPeriod: z.string().regex(/^\d{4}-\d{4}$/),
            assessmentAsked: asked,
            preferencesAsked: asked,
        }),
    ])
    .superRefine((target, context) => {
        if (
            target.kind === 'period' &&
            !target.assessmentAsked &&
            !target.preferencesAsked
        )
            context.addIssue({
                code: 'custom',
                message: 'Aukeratu gutxienez atal bat.',
            });
    });
export type TeacherSurveyTarget = z.infer<typeof teacherSurveyTarget>;
export function teacherSurveyHref(target: TeacherSurveyTarget) {
    return `/admin/survey-entry?${new URLSearchParams(Object.entries(target).map(([key, value]) => [key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value)]))}`;
}
export function teacherSurveyReturn(target: TeacherSurveyTarget) {
    return target.kind === 'project'
        ? `/admin/monitor/${target.projectId}`
        : target.kind === 'survey'
          ? `/admin/surveys/${target.surveyId}`
          : `/admin/students/${target.studentId}`;
}
