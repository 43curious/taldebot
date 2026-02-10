import { describe, it, expect } from 'vitest';
import { createTeams, type StudentData } from '../teamMatcher';

// Helper to create a student with default values
function makeStudent(overrides: Partial<StudentData> & { id: number; name: string }): StudentData {
    return {
        id: overrides.id,
        name: overrides.name,
        skills: overrides.skills || {
            skillsNarrative: { creativity: 5, writing: 5, references: 5, communication: 5 },
            skillsTechnical: { camera: 5, sound: 5, editing: 5 },
            skillsManagement: { planning: 5, production: 5 },
            skillsSoft: { leadership: 5, listening: 5, proactivity: 5, teamwork: 5, motivation: 5, conflict: 5 },
        },
        preferWith: overrides.preferWith || [],
        preferAvoid: overrides.preferAvoid || [],
        comfort: overrides.comfort || [],
        isExcluded: overrides.isExcluded || false,
    };
}

describe('teamMatcher', () => {
    describe('Anchor Person', () => {
        it('should place students with their anchor person in the same team', () => {
            const students: StudentData[] = [
                makeStudent({ id: 1, name: 'Alice', comfort: [2] }), // Alice's anchor is Bob
                makeStudent({ id: 2, name: 'Bob', comfort: [1] }),   // Bob's anchor is Alice
                makeStudent({ id: 3, name: 'Carol', comfort: [4] }),
                makeStudent({ id: 4, name: 'Dave', comfort: [3] }),
            ];

            const teams = createTeams(students, 2, 'balanced', []);

            // Alice and Bob should be in the same team (mutual anchors)
            const aliceTeam = teams.find(t => t.memberIds.includes(1));
            const bobTeam = teams.find(t => t.memberIds.includes(2));
            expect(aliceTeam?.teamNumber).toBe(bobTeam?.teamNumber);
        });
    });

    describe('Avoid Preferences (Soft Constraint)', () => {
        it('should avoid placing students together when one wants to avoid the other', () => {
            const students: StudentData[] = [
                makeStudent({ id: 1, name: 'Alice', preferAvoid: [2] }), // Alice wants to avoid Bob
                makeStudent({ id: 2, name: 'Bob' }),
                makeStudent({ id: 3, name: 'Carol' }),
                makeStudent({ id: 4, name: 'Dave' }),
            ];

            const teams = createTeams(students, 2, 'balanced', []);

            // Alice and Bob should be in different teams
            const aliceTeam = teams.find(t => t.memberIds.includes(1));
            const bobTeam = teams.find(t => t.memberIds.includes(2));
            expect(aliceTeam?.teamNumber).not.toBe(bobTeam?.teamNumber);
        });

        it('should still place avoided students together if no other option', () => {
            // With only 2 students and 1 team, they must be together
            const students: StudentData[] = [
                makeStudent({ id: 1, name: 'Alice', preferAvoid: [2] }),
                makeStudent({ id: 2, name: 'Bob', preferAvoid: [1] }),
            ];

            const teams = createTeams(students, 1, 'balanced', []);

            // Both should be in the same team (only option)
            expect(teams[0].memberIds).toContain(1);
            expect(teams[0].memberIds).toContain(2);
        });
    });

    describe('Renegade Distribution', () => {
        it('should distribute frequently-avoided students across teams', () => {
            // Student 7 is avoided by 4 people (above threshold of 3)
            // Student 8 is avoided by 4 people (above threshold of 3)
            const students: StudentData[] = [
                makeStudent({ id: 1, name: 'Alice', preferAvoid: [7, 8] }),
                makeStudent({ id: 2, name: 'Bob', preferAvoid: [7, 8] }),
                makeStudent({ id: 3, name: 'Carol', preferAvoid: [7, 8] }),
                makeStudent({ id: 4, name: 'Dave', preferAvoid: [7, 8] }),
                makeStudent({ id: 5, name: 'Eve' }),
                makeStudent({ id: 6, name: 'Frank' }),
                makeStudent({ id: 7, name: 'Renegade1' }), // Avoided by 4
                makeStudent({ id: 8, name: 'Renegade2' }), // Avoided by 4
            ];

            const teams = createTeams(students, 4, 'balanced', []);

            // Renegade1 and Renegade2 should be in different teams
            const renegade1Team = teams.find(t => t.memberIds.includes(7));
            const renegade2Team = teams.find(t => t.memberIds.includes(8));
            expect(renegade1Team?.teamNumber).not.toBe(renegade2Team?.teamNumber);
        });
    });

    describe('PreferWith Bonus', () => {
        it('should favor placing students who prefer each other together', () => {
            const students: StudentData[] = [
                makeStudent({ id: 1, name: 'Alice', preferWith: [2] }),
                makeStudent({ id: 2, name: 'Bob', preferWith: [1] }),
                makeStudent({ id: 3, name: 'Carol', preferWith: [4] }),
                makeStudent({ id: 4, name: 'Dave', preferWith: [3] }),
            ];

            const teams = createTeams(students, 2, 'balanced', []);

            // Alice and Bob should be together
            const aliceTeam = teams.find(t => t.memberIds.includes(1));
            const bobTeam = teams.find(t => t.memberIds.includes(2));
            expect(aliceTeam?.teamNumber).toBe(bobTeam?.teamNumber);
        });
    });

    describe('History Penalty', () => {
        it('should avoid placing students who worked together before', () => {
            const students: StudentData[] = [
                makeStudent({ id: 1, name: 'Alice' }),
                makeStudent({ id: 2, name: 'Bob' }),
                makeStudent({ id: 3, name: 'Carol' }),
                makeStudent({ id: 4, name: 'Dave' }),
            ];

            const history = [{ student1Id: 1, student2Id: 2 }]; // Alice and Bob worked before

            const teams = createTeams(students, 2, 'balanced', history);

            // Alice and Bob should be in different teams
            const aliceTeam = teams.find(t => t.memberIds.includes(1));
            const bobTeam = teams.find(t => t.memberIds.includes(2));
            expect(aliceTeam?.teamNumber).not.toBe(bobTeam?.teamNumber);
        });
    });

    describe('Excluded Student Distribution', () => {
        it('should distribute excluded students across teams', () => {
            const students: StudentData[] = [
                makeStudent({ id: 1, name: 'Alice' }),
                makeStudent({ id: 2, name: 'Bob' }),
                makeStudent({ id: 3, name: 'Carol' }),
                makeStudent({ id: 4, name: 'Dave' }),
                makeStudent({ id: 5, name: 'Eve' }),
                makeStudent({ id: 6, name: 'Frank' }),
                makeStudent({ id: 7, name: 'Excluded1', isExcluded: true }),
                makeStudent({ id: 8, name: 'Excluded2', isExcluded: true }),
            ];

            const teams = createTeams(students, 4, 'balanced', []);

            // Excluded students should be in different teams
            const excluded1Team = teams.find(t => t.memberIds.includes(7));
            const excluded2Team = teams.find(t => t.memberIds.includes(8));
            expect(excluded1Team?.teamNumber).not.toBe(excluded2Team?.teamNumber);
        });
    });
});
