import type { EntryProvenance } from './trackingTypes';

export function entryLabel(
    entry: EntryProvenance | null | undefined,
    lang: 'eu' | 'en' = 'eu',
) {
    if (entry?.kind === 'teacher')
        return lang === 'en'
            ? `Entered by ${entry.teacherName} on the student's behalf`
            : `Ikaslearen partez sartua · ${entry.teacherName}`;
    if (entry?.kind === 'student')
        return lang === 'en' ? 'Student response' : 'Ikaslearen erantzuna';
    return lang === 'en' ? 'Authorship unverified' : 'Egiletza egiaztatu gabe';
}
