import { randomInt } from 'node:crypto';
import { InputError } from './input';
import type { Allocation, FormationSnapshot } from './trackingTypes';

export function formationMethodLabel(snapshot?: FormationSnapshot | null) {
    return snapshot?.method === 'location'
        ? 'Ikasturteko herriaren arabera'
        : snapshot?.method === 'random'
          ? 'Ausaz'
          : snapshot?.method === 'manual'
            ? 'Irakasleak eskuz'
            : 'Gaitasunak eta hobespenak';
}

// Fisher–Yates uses only chance; assessments, preferences and history are ignored.
export function randomAllocation(
    ids: number[],
    numTeams: number,
): Allocation[] {
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const other = randomInt(i + 1);
        [shuffled[i], shuffled[other]] = [shuffled[other], shuffled[i]];
    }
    return Array.from({ length: numTeams }, (_, index) => ({
        teamNumber: index + 1,
        studentIds: shuffled.filter(
            (_, position) => position % numTeams === index,
        ),
        justification:
            'Ausazko esleipena. Talde tamainak eta irakaslearen derrigorrezko murrizketak soilik hartzen dira kontuan.',
    }));
}

export function validateTeamSizes(
    allocation: Allocation[],
    total: number,
    numTeams: number,
) {
    if (!Number.isSafeInteger(numTeams) || numTeams < 1 || numTeams > total)
        throw new InputError(
            'Talde kopurua 1 eta ikasle aktiboen kopuruaren artekoa izan behar da.',
        );
    const min = Math.floor(total / numTeams),
        max = Math.ceil(total / numTeams);
    if (
        allocation.length !== numTeams ||
        allocation.some(
            (team) =>
                team.teamNumber > numTeams ||
                team.studentIds.length < min ||
                team.studentIds.length > max,
        )
    )
        throw new InputError(
            `Osatu ${numTeams} talde, bakoitzean ${min === max ? min : `${min}–${max}`} kide jarrita.`,
        );
}
