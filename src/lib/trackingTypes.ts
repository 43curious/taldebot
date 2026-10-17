import type { Skills } from './skills';

export type EntryProvenance =
    | { kind: 'student' }
    | { kind: 'teacher'; teacherId: number; teacherName: string };

export type AssessmentValues = { [Key in keyof Skills]: Partial<Skills[Key]> };
export type PreferenceKind = 'comfort' | 'preferWith' | 'preferAvoid';
export type HistoryMode = 'variety' | 'balanced' | 'familiar';
export type FormationMethod = 'survey' | 'random' | 'manual' | 'location';
export interface ClassGroupAudience {
    groupId: number;
    groupName: string;
    moduleName: string;
    classId: number;
    className: string;
    year: number;
    capturedAt: string;
    studentIds: number[];
}
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
    preferenceSources?: Partial<
        Record<
            PreferenceKind,
            {
                submissionId: number;
                surveyId: number | null;
                date: string | null;
                questionnaireVersion: string;
            }
        >
    >;
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
    audience?: ClassGroupAudience | null;
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
