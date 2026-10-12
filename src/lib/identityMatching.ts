// Normalize the full name, including explicit surname-first imports. Callers
// must still reject multiple matching identities; never match on a first name.
export function studentNameKey(name: string) {
    const parts = name.split(',');
    const ordered =
        parts.length === 2 && parts.every((part) => part.trim())
            ? `${parts[1]} ${parts[0]}`
            : name;
    return ordered
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLocaleLowerCase('eu')
        .trim()
        .replace(/\s+/g, ' ');
}
