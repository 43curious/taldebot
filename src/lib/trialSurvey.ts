import { InputError, submissionSchema } from './input';

// Fictional data only. This module never loads a database or issues invitations.
export const trialSurvey = {
    project: { id: 9000001, name: 'TaldeBOT · Proba' },
    allStudents: [
        'Ane Proba',
        'Iker Proba',
        'Leire Proba',
        'Miren Proba',
        'Unai Proba',
    ].map((name, index) => ({
        id: 9000001 + index,
        studentRecordId: 9000001 + index,
        name,
        hasCompleted: false,
        isExcluded: false,
    })),
};

export function validateTrialSurvey(input: Record<string, unknown>) {
    const data = submissionSchema.parse(input);
    const ids = new Set(trialSurvey.allStudents.map((student) => student.id));
    if (
        data.projectId !== trialSurvey.project.id ||
        !ids.has(data.studentId) ||
        [...data.comfort, ...data.preferWith, ...data.preferAvoid].some(
            (id) => !ids.has(id),
        )
    )
        throw new InputError('Probako ikasleak soilik erabil daitezke.', 400);
    if (input.terms !== 'on')
        throw new InputError('Onartu probako baldintzak jarraitzeko.', 400);
    return data;
}
