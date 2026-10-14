import { InputError } from './input';
import type { Allocation, FormationSnapshot } from './trackingTypes';

export function validateAllocation(
    allocation: Allocation[],
    studentIds: number[],
    restrictions: FormationSnapshot['restrictions'],
) {
    const ids = allocation.flatMap((team) => team.studentIds);
    const expected = new Set(studentIds);
    if (
        new Set(ids).size !== ids.length ||
        ids.length !== expected.size ||
        ids.some((id) => !expected.has(id)) ||
        new Set(allocation.map((team) => team.teamNumber)).size !==
            allocation.length ||
        allocation.some(
            (team) =>
                !Number.isSafeInteger(team.teamNumber) || team.teamNumber < 1,
        )
    )
        throw new InputError(
            'Ikasle bakoitza behin agertu behar da, proiektu honetako taldeetan.',
        );
    for (const rule of restrictions)
        if (
            allocation.some(
                (team) =>
                    team.studentIds.includes(rule.student1Id) &&
                    team.studentIds.includes(rule.student2Id),
            )
        )
            throw new InputError(
                'Esleipenak irakaslearen derrigorrezko murrizketa hausten du.',
                409,
            );
}

// Find a valid capacity-respecting allocation; never relax a mandatory rule.
export function applyRestrictions(
    proposal: Allocation[],
    rules: FormationSnapshot['restrictions'],
): Allocation[] {
    const ids = proposal.flatMap((team) => team.studentIds);
    if (!rules.length) return proposal;
    try {
        validateAllocation(proposal, ids, rules);
        return proposal;
    } catch (error) {
        if (!(error instanceof InputError)) throw error;
    }
    const blocked = new Map(ids.map((id) => [id, new Set<number>()]));
    for (const rule of rules) {
        blocked.get(rule.student1Id)?.add(rule.student2Id);
        blocked.get(rule.student2Id)?.add(rule.student1Id);
    }
    const preferredTeam = new Map(
        proposal.flatMap((team, index) =>
            team.studentIds.map((id) => [id, index] as const),
        ),
    );
    const order = ids
        .slice()
        .sort((a, b) => blocked.get(b)!.size - blocked.get(a)!.size);
    const teams = proposal.map(() => [] as number[]);
    let steps = 0;
    let limitReached = false;
    function place(index: number): boolean {
        if (index === order.length) return true;
        if (++steps > 100000) {
            limitReached = true;
            return false;
        }
        const id = order[index];
        const options = proposal
            .map((_, i) => i)
            .sort(
                (a, b) =>
                    Number(b === preferredTeam.get(id)) -
                    Number(a === preferredTeam.get(id)),
            );
        const emptySizes = new Set<number>();
        for (const team of options) {
            const capacity = proposal[team].studentIds.length;
            if (
                teams[team].length >= capacity ||
                teams[team].some((peer) => blocked.get(id)!.has(peer))
            )
                continue;
            if (!teams[team].length) {
                if (emptySizes.has(capacity)) continue;
                emptySizes.add(capacity);
            }
            teams[team].push(id);
            if (place(index + 1)) return true;
            teams[team].pop();
            if (limitReached) return false;
        }
        return false;
    }
    if (!place(0))
        throw new InputError(
            limitReached
                ? 'Bilaketak ezin izan du murrizketak betetzen dituen esleipenik aurkitu. Berrikusi talde kopurua edo murrizketak.'
                : 'Talde kopuru eta tamaina hauekin ezin dira derrigorrezko murrizketak bete. Irakaslearen erabakia behar da.',
            409,
        );
    return proposal.map((team, index) => ({
        ...team,
        studentIds: teams[index],
        justification:
            team.justification +
            '\nIrakaslearen derrigorrezko murrizketak betetzeko egokitua.',
    }));
}
