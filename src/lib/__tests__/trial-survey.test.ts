import { expect, it } from 'vitest';
import { trialSurvey, validateTrialSurvey } from '../trialSurvey';
import { skillGroups } from '../skills';
const answers = () => ({
    projectId: String(trialSurvey.project.id),
    studentId: String(trialSurvey.allStudents[0].id),
    email: 'trial@example.com',
    terms: 'on',
    lang: 'eu',
    comfort: JSON.stringify([trialSurvey.allStudents[1].id]),
    preferWith: '[]',
    preferAvoid: '[]',
    ...Object.fromEntries(
        skillGroups.flatMap((group) =>
            group.keys.map((key) => [`${group.prefix}_${key}`, '5']),
        ),
    ),
});
it('validates fictional answers with the same skill and relationship rules in both languages', () => {
    for (const lang of ['eu', 'en']) {
        const result = validateTrialSurvey({ ...answers(), lang });
        expect(result.lang).toBe(lang);
        expect(result.technical_camera).toBe(5);
        expect(result.comfort).toEqual([trialSurvey.allStudents[1].id]);
    }
});
it('rejects real/outside identities, invalid skills, self choices and missing consent', () => {
    for (const patch of [
        { projectId: '1' },
        { studentId: '1' },
        { comfort: '[1]' },
        { technical_camera: '11' },
        { technical_camera: '4.5' },
        { comfort: JSON.stringify([trialSurvey.allStudents[0].id]) },
        { terms: undefined },
    ])
        expect(() => validateTrialSurvey({ ...answers(), ...patch })).toThrow();
});
