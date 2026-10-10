import Papa from 'papaparse';

interface RosterMember { name: string; email: string | null }

// Re-importing the same roster adds only new students; emails are compared without case.
export function prepareRosterImport(csv: string, existing: RosterMember[]) {
    const parsed = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: 'greedy' });
    if (parsed.errors.some(error => error.code !== 'UndetectableDelimiter')) {
        throw new Error('CSV datuak ez dira baliodunak. Egiaztatu komatxoak eta zutabeak.');
    }
    const first = parsed.data[0]?.map(cell => cell.trim().toLocaleLowerCase('eu'));
    const hasHeader = (first?.[0] === 'name' || first?.[0] === 'izena') &&
        (first?.[1] === 'email' || first?.[1] === 'emaila');
    const rows = hasHeader ? parsed.data.slice(1) : parsed.data;
    const identity = (member: RosterMember) => member.email
        ? `email:${member.email.trim().toLowerCase()}`
        : `name:${member.name.trim().toLocaleLowerCase('eu')}`;
    const seen = new Set(existing.map(identity));
    const members: RosterMember[] = [];
    let skipped = 0;
    for (const [rawName, rawEmail] of rows) {
        const name = rawName?.trim();
        const email = rawEmail?.trim() || null;
        if (!name) continue;
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`${name}: emaila ez da balioduna.`);
        const member = { name, email };
        const key = identity(member);
        if (seen.has(key)) { skipped++; continue; }
        seen.add(key);
        members.push(member);
    }
    if (!members.length && !skipped) throw new Error('Ez da izenik aurkitu.');
    return { members, skipped };
}

// Quote every cell and keep spreadsheet formulas from running in exported roster data.
export function rosterCsv(rows: (string | number | null)[][]) {
    return '\uFEFF' + rows.map(row => row.map(value => {
        let cell = String(value ?? '');
        if (/^[=+@\-\t\r\n]/.test(cell)) cell = `'${cell}`;
        return `"${cell.replace(/"/g, '""')}"`;
    }).join(',')).join('\r\n');
}
