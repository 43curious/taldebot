import { expect, it } from 'vitest';
import { selectClassScope } from '../classSelection';
import { matchRosterStudents } from '../rosterGraph';

const degrees = [{ id: 1, name: 'Media' }, { id: 2, name: 'Engineering' }];
const classes = [
    { id: 1, name: '1. maila', year: 1, degreeId: 1, studentCount: 20 },
    { id: 2, name: '2. maila', year: 2, degreeId: 1, studentCount: 20 },
    { id: 3, name: 'Lab', year: 1, degreeId: 2, studentCount: 10 },
];

it('defaults to one class and resets an incompatible class when the degree changes', () => {
    expect(selectClassScope(degrees, classes, new URLSearchParams()).selectedClass?.id).toBe(1);
    const changed = selectClassScope(degrees, classes, new URLSearchParams('degree=2&class=2'));
    expect(changed.options.map(group => group.id)).toEqual([3]);
    expect(changed.selectedClass?.id).toBe(3);
    expect(selectClassScope(degrees, classes, new URLSearchParams('class=3')).degree).toBe('2');
});

it('retains a selected degree with no classes and supports unassigned classes', () => {
    expect(selectClassScope(degrees, classes.slice(0, 2), new URLSearchParams('degree=2')).selectedClass).toBeUndefined();
    expect(selectClassScope([], [{ ...classes[0], degreeId: null }], new URLSearchParams()).degree).toBe('none');
});

it('links project snapshots by email or a unique name while excluding ambiguous identities', () => {
    const roster = [
        { id: 1, name: 'Ane', email: 'ane@example.com' },
        { id: 2, name: 'Iker', email: null },
        { id: 3, name: 'Jon', email: null },
    ];
    const all = [...roster, { id: 4, name: 'Jon', email: null }];
    expect([...matchRosterStudents(roster, all, [
        { id: 10, name: 'Ane Updated', email: 'ANE@example.com' },
        { id: 11, name: 'Iker', email: null },
        { id: 12, name: 'Jon', email: null },
        { id: 13, name: 'Ane', email: 'other@example.com' },
        { id: 14, name: 'Leire', email: null },
    ])]).toEqual([[10, 1], [11, 2]]);
});

it('skips duplicate project identities instead of collapsing different nodes', () => {
    const roster = [{ id: 1, name: 'Ane', email: 'ane@example.com' }];
    expect(matchRosterStudents(roster, roster, [
        { id: 10, name: 'Ane', email: 'ane@example.com' },
        { id: 11, name: 'Ane', email: 'ane@example.com' },
    ]).size).toBe(0);
});
