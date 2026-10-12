export interface TrackedStudent {
    id: number;
    name: string;
    email: string | null;
    hasCompleted: boolean | null;
    isExcluded: boolean | null;
}

export type TrackingStatus = 'pending' | 'completed' | 'excluded';

// Attendance takes precedence over survey completion in every tracking view.
export function studentStatus(student: TrackedStudent): TrackingStatus {
    return student.isExcluded
        ? 'excluded'
        : student.hasCompleted
          ? 'completed'
          : 'pending';
}

export function trackingSummary(students: TrackedStudent[]) {
    const active = students.filter((student) => !student.isExcluded);
    const completed = active.filter((student) => student.hasCompleted).length;
    return {
        active: active.length,
        completed,
        pending: active.length - completed,
        excluded: students.length - active.length,
        percentage: active.length
            ? Math.round((completed / active.length) * 100)
            : 0,
    };
}

export type RelationshipKind =
    'comfort' | 'preferWith' | 'preferAvoid' | 'restriction';
export interface Relationship {
    source: number;
    target: number;
    kind: RelationshipKind;
    peerName?: string;
    accessible?: boolean;
    submittedAt?: string | null;
    sourceLabel?: string;
}
interface PreferenceResponse {
    studentId: number | null;
    comfort: number[];
    preferWith: number[];
    preferAvoid: number[];
}

// Ignore stale references and absent students; retain direction and preference type.
export function classRelationships(
    students: TrackedStudent[],
    responses: PreferenceResponse[],
): Relationship[] {
    const activeIds = new Set(
        students
            .filter((student) => !student.isExcluded)
            .map((student) => student.id),
    );
    const relationships: Relationship[] = [];
    for (const response of responses) {
        if (response.studentId === null || !activeIds.has(response.studentId))
            continue;
        for (const kind of ['comfort', 'preferWith', 'preferAvoid'] as const) {
            for (const target of new Set(response[kind])) {
                if (target !== response.studentId && activeIds.has(target)) {
                    relationships.push({
                        source: response.studentId,
                        target,
                        kind,
                    });
                }
            }
        }
    }
    return relationships;
}
