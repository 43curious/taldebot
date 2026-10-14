import type { Skills } from './skills';

export type AssessmentValues = { [Key in keyof Skills]: Partial<Skills[Key]> };
export type PreferenceKind = 'comfort' | 'preferWith' | 'preferAvoid';
export type HistoryMode = 'variety' | 'balanced' | 'familiar';
export type FormationMethod = 'survey' | 'random' | 'manual' | 'location';
export interface Allocation {
    teamNumber: number;
    studentIds: number[];
    justification: string;
}
export interface FormationInput {
    studentId: number;
    participantId: number;
    name: string;
    assessmentId: number | null;
    assessmentDate: string | null;
    assessmentSource: string | null;
    preferenceDate: string | null;
    preferenceSubmissionId: number | null;
    assessment: AssessmentValues;
    preferences: Record<PreferenceKind, number[]>;
    excluded: boolean;
    needsReview: boolean;
    location?: {
        town: string | null;
        source: 'unknown' | 'roster' | 'teacher';
        updatedAt: string | null;
    };
}
export interface FormationSnapshot {
    // Absent on older snapshots, whose method was survey-informed.
    method?: FormationMethod;
    locationPolicy?: 'same-term-time-town-v1';
    capturedAt: string;
    configuration: {
        projectType: string;
        numTeams: number | null;
        targetTeamSize: number | null;
        fallbackSkillValue: number;
        policyVersion: string;
    };
    projectName: string;
    academicPeriod: string;
    historyMode: HistoryMode;
    inputs: FormationInput[];
    history: { student1Id: number; student2Id: number; projects: number }[];
    confirmationRestrictions?: {
        id: number;
        student1Id: number;
        student2Id: number;
        reviewAt: string;
    }[];
    restrictions: {
        id: number;
        student1Id: number;
        student2Id: number;
        reviewAt: string;
    }[];
}
