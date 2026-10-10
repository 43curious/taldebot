import type { responses } from '../../db/schema';
import type { TrackedStudent } from './tracking';

type SurveyResponse = typeof responses.$inferSelect;
type SkillCategory = 'skillsNarrative' | 'skillsTechnical' | 'skillsManagement' | 'skillsSoft';
export type SelfAssessment = { [Key in SkillCategory]: Partial<SurveyResponse[Key]> };
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
export function projectAssessments(records: SurveyResponse[], projectId: number): Map<number, SelfAssessment> {
    const latest = new Map<number, SurveyResponse>();
    for (const response of records) {
        if (response.projectId !== projectId || response.studentId === null) continue;
        const previous = latest.get(response.studentId);
        if (!previous || response.id > previous.id) latest.set(response.studentId, response);
    }
    return new Map([...latest].map(([id, response]) => [id, {
        skillsNarrative: response.skillsNarrative,
        skillsTechnical: response.skillsTechnical,
        skillsManagement: response.skillsManagement,
        skillsSoft: response.skillsSoft,
    }]));
}

const groups = [
    { key: 'skillsNarrative', label: 'Narratiba', skills: [['creativity', 'Sormena'], ['writing', 'Idazketa'], ['references', 'Erreferentziak'], ['communication', 'Ahozko komunikazioa']] },
    { key: 'skillsTechnical', label: 'Teknika', skills: [['camera', 'Irudia eta kamera'], ['sound', 'Soinua'], ['editing', 'Edizioa']] },
    { key: 'skillsManagement', label: 'Kudeaketa', skills: [['planning', 'Plangintza eta antolaketa'], ['production', 'Ekoizpena']] },
    { key: 'skillsSoft', label: 'Gaitasun pertsonalak', skills: [['leadership', 'Lidergoa'], ['listening', 'Entzume aktiboa'], ['proactivity', 'Proaktibitatea'], ['teamwork', 'Talde-lana'], ['motivation', 'Motibazioa'], ['conflict', 'Gatazken konponbidea']] },
] as const;

export function assessmentGroups(assessment: SelfAssessment) {
    return groups.map(group => {
        const scores: Partial<Record<string, number>> = assessment[group.key];
        return { label: group.label, skills: group.skills.map(([key, label]) => {
            const value = scores?.[key];
            const score = typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 10 ? value : null;
            return { key, label, score };
        }) };
    });
}
