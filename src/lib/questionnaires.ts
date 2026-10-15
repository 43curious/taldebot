import { z } from 'zod';
import { localizedSkillGroups } from './skills';
import { t, type Language } from './i18n';
import type { PreferenceKind } from './trackingTypes';

const wording = z.object({
    eu: z.string().trim().min(1).max(500),
    en: z.string().trim().min(1).max(500),
});
const explanation = z.object({
    eu: z.string().max(3000),
    en: z.string().max(3000),
});
const skillNames = localizedSkillGroups('eu').flatMap((group) =>
    group.skills.map((skill) => skill.name),
);
export const questionSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('skill'),
        key: z
            .string()
            .refine((key) =>
                skillNames.includes(key as (typeof skillNames)[number]),
            ),
        label: wording,
        explanation,
    }),
    z.object({
        type: z.literal('preference'),
        key: z.enum(['comfort', 'preferWith', 'preferAvoid']),
        label: wording,
        explanation,
    }),
    z.object({
        type: z.literal('collaboration'),
        key: z.literal('collaboration'),
        label: wording,
        explanation,
    }),
]);
export const questionnaireSchema = z.object({
    name: z.string().trim().min(1).max(120),
    questions: z
        .array(questionSchema)
        .min(1)
        .max(19)
        .refine(
            (questions) =>
                new Set(questions.map((q) => q.key)).size === questions.length,
            'Galderak ezin dira bikoiztu.',
        ),
});
export type Question = z.infer<typeof questionSchema>;
export type QuestionAnswers = Record<
    string,
    number | null | number[] | Record<string, 'worked' | 'never'>
>;
export type SurveyAudienceSnapshot = {
    className: string;
    year: number;
    division: string | null;
    groupIds: number[];
    groupNames: string[];
};
export function standardQuestions(): Question[] {
    const eu = localizedSkillGroups('eu'),
        en = localizedSkillGroups('en');
    return [
        ...eu.flatMap((group, index) =>
            group.skills.map((skill, skillIndex): Question => ({
                type: 'skill',
                key: skill.name,
                label: {
                    eu: skill.label,
                    en: en[index].skills[skillIndex].label,
                },
                explanation: {
                    eu: skill.description,
                    en: en[index].skills[skillIndex].description,
                },
            })),
        ),
        ...(['comfort', 'preferWith', 'preferAvoid'] as PreferenceKind[]).map(
            (key): Question => ({
                type: 'preference',
                key,
                label: {
                    eu: t('eu').groupDynamics[key].label,
                    en: t('en').groupDynamics[key].label,
                },
                explanation: {
                    eu: t('eu').groupDynamics[key].placeholder,
                    en: t('en').groupDynamics[key].placeholder,
                },
            }),
        ),
        {
            type: 'collaboration',
            key: 'collaboration',
            label: { eu: 'Benetako elkarlana', en: 'Actual collaboration' },
            explanation: {
                eu: 'Adierazi kide bakoitzarekin benetan lan egin duzun edo inoiz ez duzun lan egin. Utzi erantzun gabe ziur ez bazaude. Talde berean esleituta egotea ez da berez elkarlana.',
                en: 'For each peer, report whether you have actually worked together or have never worked together. Leave unanswered if unsure. Being assigned to the same team is separate evidence.',
            },
        },
    ];
}
export const surveyCopy = (lang: Language) =>
    lang === 'en'
        ? {
              title: 'Survey',
              privacy:
                  'Your currently responsible teachers and master administrators can see these answers.',
              consent:
                  'I agree to use these answers for student follow-up and team formation.',
              send: 'Submit answers',
              sending: 'Submitting…',
              error: 'Unable to save. Check your answers and try again.',
              done: 'Answers submitted',
              doneNote:
                  'Thank you. Your answers were saved with the questionnaire version you answered.',
              unknown: 'I cannot assess this yet',
              max: 'Maximum',
              unasked: 'Unanswered',
              worked: 'We have worked together',
              never: 'We have never worked together',
              scale: 'Self-assessment · 1–10 · Not an academic grade.',
          }
        : {
              title: 'Inkesta',
              privacy:
                  'Zure egungo irakasle arduradunek eta master administratzaileek ikus ditzakete erantzun hauek.',
              consent:
                  'Erantzunak jarraipenerako eta taldeak osatzeko erabiltzea onartzen dut.',
              send: 'Erantzunak bidali',
              sending: 'Bidaltzen…',
              error: 'Ezin izan da gorde. Egiaztatu erantzunak eta saiatu berriro.',
              done: 'Erantzunak bidali dira',
              doneNote:
                  'Eskerrik asko. Erantzunak bete duzun galdera-sortaren bertsioarekin gorde dira.',
              unknown: 'Oraindik ezin dut baloratu',
              max: 'Gehienez',
              unasked: 'Erantzunik gabe',
              worked: 'Elkarrekin lan egin dugu',
              never: 'Inoiz ez dugu elkarrekin lan egin',
              scale: 'Autoebaluazioa · 1–10 · Ez da nota akademikoa.',
          };
