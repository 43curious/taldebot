import { describe, expect, it } from 'vitest';
import { classRelationships, studentStatus, trackingSummary, type TrackedStudent } from '../tracking';
import { prepareRosterImport, rosterCsv } from '../roster';

const students: TrackedStudent[] = [
    { id: 1, name: 'Ane', email: 'ane@example.com', hasCompleted: true, isExcluded: false },
    { id: 2, name: 'Iker', email: null, hasCompleted: false, isExcluded: false },
    { id: 3, name: 'Leire', email: null, hasCompleted: true, isExcluded: true },
];

describe('teacher tracking', () => {
    it('keeps completed absent students out of completion and graph connections', () => {
        expect(studentStatus(students[2])).toBe('excluded');
        expect(trackingSummary(students)).toEqual({ active: 2, completed: 1, pending: 1, excluded: 1, percentage: 50 });
        expect(classRelationships(students, [
            { studentId: 1, comfort: [2, 2, 1, 3, 99], preferWith: [], preferAvoid: [] },
            { studentId: 2, comfort: [], preferWith: [], preferAvoid: [1] },
            { studentId: 3, comfort: [1], preferWith: [], preferAvoid: [] },
        ])).toEqual([{ source: 1, target: 2, kind: 'comfort' }, { source: 2, target: 1, kind: 'preferAvoid' }]);
    });
    it('shows zero completion when no active students remain', () => {
        expect(trackingSummary([students[2]]).percentage).toBe(0);
        expect(trackingSummary([]).pending).toBe(0);
    });
});

describe('roster imports and exports', () => {
    it('supports spreadsheet CSV and skips existing and repeated students', () => {
        expect(prepareRosterImport('izena,email\nAne,ANE@example.com\n"Etxeberria, Iker",iker@example.com\nIker,iker@example.com\nLeire,\nLeire,', [students[0]]))
            .toEqual({ members: [{ name: 'Etxeberria, Iker', email: 'iker@example.com' }, { name: 'Leire', email: null }], skipped: 3 });
    });
    it('rejects invalid rows before adding any students', () => {
        expect(() => prepareRosterImport('Ane,ane@example.com\nIker,not-an-email', [])).toThrow('Iker: emaila ez da balioduna.');
        expect(() => prepareRosterImport('"Ane,ane@example.com', [])).toThrow('CSV datuak');
    });
    it('accepts a names-only list when email addresses are unavailable', () => {
        expect(prepareRosterImport('Ane\nLeire\n', []))
            .toEqual({ members: [{ name: 'Ane', email: null }, { name: 'Leire', email: null }], skipped: 0 });
    });
    it('exports quoted cells and neutralizes spreadsheet formulas', () => {
        expect(rosterCsv([['=1+1', 'Ane "A"', null]])).toBe('\uFEFF"\'=1+1","Ane ""A""",""');
    });
});
