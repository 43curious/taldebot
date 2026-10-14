import { expect, it } from 'vitest';
import { selectClassScope } from '../classSelection';

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
