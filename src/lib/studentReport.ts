import type { responses } from '../../db/schema';
import { localizedSkillGroups, skillScale, type SkillCategory } from './skills';
import type { TrackedStudent } from './tracking';

type SurveyResponse = typeof responses.$inferSelect;
export type SelfAssessment = {
    [Key in SkillCategory]: Partial<SurveyResponse[Key]>;
};
export interface GraphStudent extends TrackedStudent {
    tutor?: string | null;
    division?: string | null;
    hasSurvey?: boolean;
    assessment?: SelfAssessment;
}

export function graphStudentName(name: string): string {
    const [first = '', surname] = name.trim().split(/\s+/);
    return surname ? `${first} ${Array.from(surname)[0]}.` : first;
}

// Never mix projects or turn a missing answer into a zero; latest submitted row wins.
export function projectAssessments(
    records: SurveyResponse[],
    projectId: number,
): Map<number, SelfAssessment> {
    const latest = new Map<number, SurveyResponse>();
    for (const response of records) {
        if (response.projectId !== projectId || response.studentId === null)
            continue;
        const previous = latest.get(response.studentId);
        if (!previous || response.id > previous.id)
            latest.set(response.studentId, response);
    }
    return new Map(
        [...latest].map(([id, response]) => [
            id,
            {
                skillsNarrative: response.skillsNarrative,
                skillsTechnical: response.skillsTechnical,
                skillsManagement: response.skillsManagement,
                skillsSoft: response.skillsSoft,
            },
        ]),
    );
}

export function assessmentGroups(assessment: SelfAssessment) {
    return localizedSkillGroups('eu').map((group) => {
        const scores: Partial<Record<string, number>> = assessment[group.key];
        return {
            label: group.label,
            skills: group.skills.map(({ key, label }) => {
                const value = scores?.[key];
                const score =
                    typeof value === 'number' &&
                    Number.isFinite(value) &&
                    value >= skillScale.min &&
                    value <= skillScale.max
                        ? value
                        : null;
                return { key, label, score };
            }),
        };
    });
}
