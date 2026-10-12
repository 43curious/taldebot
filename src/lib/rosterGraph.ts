import { studentNameKey } from './identityMatching';

interface Identity {
    id: number;
    name: string;
    email: string | null;
}

// Project participants are snapshots. Link only identities that resolve uniquely.
export function rosterMatcher(members: Identity[], allMembers: Identity[]) {
    const globalNames = new Map<string, number>();
    for (const member of allMembers) {
        const name = studentNameKey(member.name);
        globalNames.set(name, (globalNames.get(name) ?? 0) + 1);
    }
    return (participants: Identity[]) => {
        const candidates: [number, number][] = [];
        for (const participant of participants) {
            const email = participant.email?.trim().toLowerCase();
            const emailMatches = email
                ? members.filter(
                      (member) => member.email?.trim().toLowerCase() === email,
                  )
                : [];
            if (emailMatches.length === 1) {
                candidates.push([participant.id, emailMatches[0].id]);
                continue;
            }
            if (emailMatches.length > 1) continue;
            const name = studentNameKey(participant.name);
            if (globalNames.get(name) !== 1) continue;
            const member = members.find(
                (member) =>
                    studentNameKey(member.name) === name &&
                    (!email || !member.email?.trim()),
            );
            if (member) candidates.push([participant.id, member.id]);
        }
        const counts = new Map<number, number>();
        for (const [, memberId] of candidates)
            counts.set(memberId, (counts.get(memberId) ?? 0) + 1);
        return new Map(
            candidates.filter(([, memberId]) => counts.get(memberId) === 1),
        );
    };
}

export function matchRosterStudents(
    members: Identity[],
    allMembers: Identity[],
    participants: Identity[],
) {
    return rosterMatcher(members, allMembers)(participants);
}
