import { describe, expect, it } from 'vitest';
import { assessmentGroups, graphStudentName, projectAssessments } from '../studentReport';
import type { responses } from '../../../db/schema';

const assessment: Pick<typeof responses.$inferSelect, 'skillsNarrative' | 'skillsTechnical' | 'skillsManagement' | 'skillsSoft'> = {
    skillsNarrative: { creativity: 7, writing: 6, references: 5, communication: 8 },
    skillsTechnical: { camera: 6, sound: 8, editing: 7 },
    skillsManagement: { planning: 6, production: 7 },
    skillsSoft: { leadership: 7, listening: 9, proactivity: 6, teamwork: 8, motivation: 10, conflict: 5 },
};
const response = (id: number, projectId: number, studentId: number | null) => ({
    ...assessment, id, projectId, studentId, preferWith: [], preferAvoid: [], comfort: [], completedAt: '2026-10-10 10:00:00',
});

describe('student graph reports', () => {
    it('abbreviates the surname while retaining single names and Unicode initials', () => {
        expect(graphStudentName('  Iker   Etxeberria Aranburu  ')).toBe('Iker E.');
        expect(graphStudentName('Ane')).toBe('Ane');
        expect(graphStudentName('Uxue Álvarez')).toBe('Uxue Á.');
    });

    it('uses the latest response for each student within the selected project', () => {
        const latest = { ...response(2, 1, 20), skillsTechnical: { camera: 9, sound: 10, editing: 8 } };
        const records = [latest, response(1, 1, 20), response(3, 2, 20), response(4, 1, null)];
        const result = projectAssessments(records, 1);
        expect(result.size).toBe(1);
        expect(result.get(20)?.skillsTechnical.camera).toBe(9);
        expect(result.get(20)?.skillsSoft.listening).toBe(9);
    });

    it('shows every skill and treats invalid or absent scores as unanswered', () => {
        const groups = assessmentGroups({ ...assessment, skillsSoft: { ...assessment.skillsSoft, leadership: NaN, motivation: 11, conflict: 0 } });
        expect(groups.flatMap(group => group.skills)).toHaveLength(15);
        const soft = groups.at(-1)!.skills;
        expect(soft.find(skill => skill.key === 'listening')?.score).toBe(9);
        expect(soft.find(skill => skill.key === 'leadership')?.score).toBeNull();
        expect(soft.find(skill => skill.key === 'motivation')?.score).toBeNull();
        expect(soft.find(skill => skill.key === 'conflict')?.score).toBeNull();
        const unanswered = assessmentGroups({ ...assessment, skillsSoft: {} }).at(-1)!.skills;
        expect(unanswered.every(skill => skill.score === null)).toBe(true);
    });
});
