import { applyRestrictions } from './allocationRules';
import { randomAllocation } from './formationMethods';
import { townKey } from './studentLocations';
import type {
    Allocation,
    FormationInput,
    FormationSnapshot,
} from './trackingTypes';

// Pack confirmed towns into balanced teams, repair mandatory separations, then
// improve same-town pairing with valid swaps. This is a bounded, best-effort heuristic.
export function locationAllocation(
    inputs: FormationInput[],
    numTeams: number,
    rules: FormationSnapshot['restrictions'],
): Allocation[] {
    const locations = new Map(
        inputs.map((input) => [
            input.studentId,
            input.location?.source === 'teacher' && input.location.town
                ? townKey(input.location.town)
                : null,
        ]),
    );
    const clusters = new Map<string, number[]>();
    const unknown: number[] = [];
    for (const input of inputs) {
        const town = locations.get(input.studentId);
        if (!town) {
            unknown.push(input.studentId);
            continue;
        }
        const members = clusters.get(town) ?? [];
        members.push(input.studentId);
        clusters.set(town, members);
    }
    const capacities = Array.from(
        { length: numTeams },
        (_, i) =>
            Math.floor(inputs.length / numTeams) +
            Number(i < inputs.length % numTeams),
    );
    const proposal: Allocation[] = capacities.map((_, i) => ({
        teamNumber: i + 1,
        studentIds: [],
        justification: '',
    }));
    const ordered = [...clusters.values()].sort((a, b) => b.length - a.length);
    // Unknowns fill remaining spaces; they are never treated as one shared locality.
    for (const cluster of [
        ...ordered,
        randomAllocation(unknown, 1)[0].studentIds,
    ]) {
        const remaining = [...cluster];
        while (remaining.length) {
            const options = proposal
                .map((team, i) => ({
                    i,
                    free: capacities[i] - team.studentIds.length,
                    same: team.studentIds.filter(
                        (id) =>
                            locations.get(id) &&
                            locations.get(id) === locations.get(remaining[0]),
                    ).length,
                }))
                .filter((option) => option.free > 0);
            options.sort(
                (a, b) =>
                    b.same - a.same ||
                    Number(b.free >= remaining.length) -
                        Number(a.free >= remaining.length) ||
                    b.free - a.free,
            );
            const target = options[0];
            proposal[target.i].studentIds.push(
                ...remaining.splice(0, target.free),
            );
        }
    }
    const allocation = applyRestrictions(proposal, rules);
    const blocked = new Set(
        rules.flatMap((rule) => [
            `${rule.student1Id}:${rule.student2Id}`,
            `${rule.student2Id}:${rule.student1Id}`,
        ]),
    );
    for (let pass = 0; pass < 50; pass++) {
        let best:
            | {
                  a: number;
                  b: number;
                  first: number[];
                  second: number[];
                  gain: number;
              }
            | undefined;
        for (let a = 0; a < allocation.length; a++)
            for (let b = a + 1; b < allocation.length; b++) {
                const first = allocation[a].studentIds,
                    second = allocation[b].studentIds;
                const counts = (ids: number[]) => {
                    const result = new Map<string, number>();
                    for (const id of ids) {
                        const key = locations.get(id);
                        if (key) result.set(key, (result.get(key) ?? 0) + 1);
                    }
                    return result;
                };
                const firstCounts = counts(first),
                    secondCounts = counts(second);
                for (let i = 0; i < first.length; i++)
                    for (let j = 0; j < second.length; j++) {
                        if (
                            locations.get(first[i]) === locations.get(second[j])
                        )
                            continue;
                        const from = locations.get(first[i]),
                            to = locations.get(second[j]);
                        const gain =
                            (from
                                ? (secondCounts.get(from) ?? 0) -
                                  ((firstCounts.get(from) ?? 0) - 1)
                                : 0) +
                            (to
                                ? (firstCounts.get(to) ?? 0) -
                                  ((secondCounts.get(to) ?? 0) - 1)
                                : 0);
                        if (
                            gain <= (best?.gain ?? 0) ||
                            first.some(
                                (id, index) =>
                                    index !== i &&
                                    blocked.has(`${second[j]}:${id}`),
                            ) ||
                            second.some(
                                (id, index) =>
                                    index !== j &&
                                    blocked.has(`${first[i]}:${id}`),
                            )
                        )
                            continue;
                        const nextFirst = [...first],
                            nextSecond = [...second];
                        [nextFirst[i], nextSecond[j]] = [
                            nextSecond[j],
                            nextFirst[i],
                        ];
                        best = {
                            a,
                            b,
                            first: nextFirst,
                            second: nextSecond,
                            gain,
                        };
                    }
            }
        if (!best) break;
        allocation[best.a].studentIds = best.first;
        allocation[best.b].studentIds = best.second;
    }
    return allocation.map((team) => ({
        ...team,
        justification:
            'Ikasturtean herri berean bizi diren ikasleak elkartzea lehenetsi da; ez da distantziarik edo bidaia-denborarik kalkulatu. Tamainak eta derrigorrezko murrizketak lehenesten dira. Kokapen ezezagunak geratzen diren tokietan banatu dira.',
    }));
}
