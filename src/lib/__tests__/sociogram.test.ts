import { expect, it } from 'vitest';
import { graphSkillScore, incomingPreferences } from '../sociogram';
import type { GraphStudent } from '../studentReport';
const student = (id: number, answered: boolean): GraphStudent => ({
    id,
    name: `Student ${id}`,
    email: null,
    hasCompleted: null,
    isExcluded: false,
    profile: {
        label: 'Survey',
        assessmentAt: null,
        assessmentSource: null,
        preferenceAt: null,
        needsReview: false,
        href: '/',
        motivationInContext: false,
        relationships: [],
        assignments: [],
        preferenceKinds: answered ? ['preferWith'] : [],
    },
});
it('uses only valid mapped self-assessments, preserving unasked and invalid values as unknown', () => {
    const s = student(1, true);
    s.assessment = {
        skillsNarrative: { writing: 7 },
        skillsTechnical: { camera: 11 },
        skillsManagement: {},
        skillsSoft: {},
    };
    expect(graphSkillScore(s, 'narrative_writing')).toBe(7);
    expect(graphSkillScore(s, 'technical_camera')).toBeNull();
    expect(graphSkillScore(s, 'soft_teamwork')).toBeNull();
    expect(graphSkillScore(s, 'unknown')).toBeNull();
});
it('counts unique directed choices within the visible class and reports actual question coverage', () => {
    const people = [student(1, true), student(2, true), student(3, false)];
    const summary = incomingPreferences(
        people,
        [
            { source: 1, target: 2, kind: 'preferWith' },
            { source: 1, target: 2, kind: 'preferWith' },
            { source: 3, target: 2, kind: 'preferWith' },
            { source: 99, target: 2, kind: 'preferWith' },
            { source: 2, target: 1, kind: 'restriction' },
            { source: 2, target: 99, kind: 'preferWith' },
        ],
        'preferWith',
    );
    expect(summary.respondents).toBe(2);
    expect(summary.total).toBe(3);
    expect(summary.counts.get(2)).toBe(1);
    expect(summary.counts.get(1)).toBe(0);
    expect(incomingPreferences(people, [], 'preferAvoid').respondents).toBe(0);
});
