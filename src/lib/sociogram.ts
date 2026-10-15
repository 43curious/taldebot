import { localizedSkillGroups } from './skills';
import type { GraphStudent } from './studentReport';
import type { Relationship } from './tracking';
import type { PreferenceKind } from './trackingTypes';

export const graphSkills = localizedSkillGroups('eu').flatMap((group) =>
    group.skills.map((skill) => ({ ...skill, category: group.key })),
);
export const teamPalette = [
    '#d97706',
    '#7c3aed',
    '#0891b2',
    '#db2777',
    '#65a30d',
    '#78716c',
    '#4f46e5',
    '#b45309',
];
export function graphSkillScore(student: GraphStudent, key: string) {
    const skill = graphSkills.find((skill) => skill.name === key);
    if (!skill) return null;
    const values: Partial<Record<string, number>> | undefined =
        student.assessment?.[skill.category];
    const value = values?.[skill.key];
    return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 10
        ? value
        : null;
}
// Counts are directed choices within visible nodes; absence and restrictions are not student votes.
export function incomingPreferences(
    students: GraphStudent[],
    links: Relationship[],
    kind: PreferenceKind,
) {
    const visible = new Set(students.map((student) => student.id));
    const respondents = new Set(
        students
            .filter((student) =>
                student.profile?.preferenceKinds?.includes(kind),
            )
            .map((student) => student.id),
    );
    const incoming = new Map(
        students.map((student) => [student.id, new Set<number>()]),
    );
    for (const edge of links)
        if (
            edge.kind === kind &&
            visible.has(edge.source) &&
            visible.has(edge.target) &&
            respondents.has(edge.source)
        )
            incoming.get(edge.target)!.add(edge.source);
    return {
        respondents: respondents.size,
        total: students.length,
        counts: new Map(
            [...incoming].map(([id, sources]) => [id, sources.size]),
        ),
    };
}
export interface GraphAssignment {
    projectName: string;
    confirmedAt: string;
    revision: number;
    teams: { teamNumber: number; studentIds: number[] }[];
}
