export interface DegreeOption { id: number; name: string }
export interface ClassOption {
    id: number;
    name: string;
    year: number;
    degreeId: number | null;
    studentCount: number;
}

// Resolve dependent selectors together so a class never leaks into another degree.
export function selectClassScope(degrees: DegreeOption[], classes: ClassOption[], params: URLSearchParams) {
    const requestedClass = classes.find(group => String(group.id) === params.get('class'));
    const requestedDegree = params.get('degree');
    const hasUnassigned = classes.some(group => group.degreeId === null);
    const preferredDegree = degrees.find(degree => classes.some(group => group.degreeId === degree.id && group.studentCount > 0))
        ?? degrees.find(degree => classes.some(group => group.degreeId === degree.id)) ?? degrees[0];
    const degree = degrees.some(degree => String(degree.id) === requestedDegree) || (requestedDegree === 'none' && hasUnassigned)
        ? requestedDegree!
        : !requestedDegree && requestedClass
            ? String(requestedClass.degreeId ?? 'none')
            : preferredDegree ? String(preferredDegree.id) : hasUnassigned ? 'none' : '';
    const options = classes.filter(group => String(group.degreeId ?? 'none') === degree)
        .sort((a, b) => a.year - b.year || a.name.localeCompare(b.name, 'eu'));
    const year = params.get('year');
    const candidates = year ? options.filter(group => String(group.year) === year) : options;
    const selectedClass = candidates.find(group => group.id === requestedClass?.id)
        ?? candidates.find(group => group.studentCount > 0) ?? candidates[0];
    return { degree, options, selectedClass, hasUnassigned };
}

export function classOptionLabel(group: Pick<ClassOption, 'name' | 'year'>) {
    return group.name === `${group.year}. maila` ? group.name : `${group.year}. maila · ${group.name}`;
}
