import { t, type Language } from './i18n';

export const skillScale = { min: 1, max: 10, defaultValue: 5 } as const;
export const skillGroups = [
    {
        key: 'skillsNarrative',
        prefix: 'narrative',
        keys: ['creativity', 'writing', 'references', 'communication'],
    },
    {
        key: 'skillsTechnical',
        prefix: 'technical',
        keys: ['camera', 'sound', 'editing'],
    },
    {
        key: 'skillsManagement',
        prefix: 'management',
        keys: ['planning', 'production'],
    },
    {
        key: 'skillsSoft',
        prefix: 'soft',
        keys: [
            'leadership',
            'listening',
            'proactivity',
            'teamwork',
            'motivation',
            'conflict',
        ],
    },
] as const;
export type SkillCategory = (typeof skillGroups)[number]['key'];
export type Skills = {
    [Group in (typeof skillGroups)[number] as Group['key']]: {
        [Key in Group['keys'][number]]: number;
    };
};

export function localizedSkillGroups(lang: Language) {
    const tr = t(lang);
    return skillGroups.map((group) => ({
        ...group,
        label:
            group.prefix === 'soft'
                ? tr.form.section4Title
                : tr.skillCategories[group.prefix],
        skills: group.keys.map((key) => {
            const name = `${group.prefix}_${key}` as keyof typeof tr.skills;
            return { key, name, ...tr.skills[name] };
        }),
    }));
}

export function scoredSkills(
    skills: Partial<{ [Key in keyof Skills]: Partial<Skills[Key]> }>,
    lang: Language = 'eu',
) {
    return localizedSkillGroups(lang).flatMap((group) => {
        const scores: Partial<Record<string, number>> | undefined =
            skills[group.key];
        return group.skills.map((skill) => ({
            ...skill,
            category: group.key,
            val: scores?.[skill.key],
        }));
    });
}
