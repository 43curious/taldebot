import { and, asc, desc, eq, inArray, lte, max } from 'drizzle-orm';
import { confirmedAssignments, teamDrafts } from '../../db/schema';
import { canReadStudent, requireProject, type TeacherAccess } from './access';
import type { DataSession } from './studentIdentity';
import type { GraphTeamResult } from './sociogram';

// Read the latest saved result per algorithm without loading private formation inputs.
// Draft display never establishes confirmed assignment or collaboration history.
export async function graphTeamResults(
    store: Pick<DataSession, 'select' | 'query'>,
    access: TeacherAccess,
    projectId: number,
    visible: Set<number>,
    asOf?: string,
): Promise<GraphTeamResult[]> {
    requireProject(access, projectId);
    const cutoff = asOf ? `${asOf}T23:59:59.999Z` : undefined;
    const [confirmed, drafts] = await Promise.all([
        store.query.confirmedAssignments.findFirst({
            columns: {
                id: true,
                projectName: true,
                confirmedAt: true,
                revision: true,
                allocation: true,
            },
            where: and(
                eq(confirmedAssignments.projectId, projectId),
                cutoff
                    ? lte(confirmedAssignments.confirmedAt, cutoff)
                    : undefined,
            ),
            orderBy: desc(confirmedAssignments.revision),
        }),
        store
            .select({
                id: teamDrafts.id,
                projectName: teamDrafts.projectName,
                algorithmVersion: teamDrafts.algorithmVersion,
                createdAt: teamDrafts.createdAt,
                allocation: teamDrafts.allocation,
            })
            .from(teamDrafts)
            .where(
                inArray(
                    teamDrafts.id,
                    store
                        .select({ id: max(teamDrafts.id) })
                        .from(teamDrafts)
                        .where(
                            and(
                                eq(teamDrafts.projectId, projectId),
                                cutoff
                                    ? lte(teamDrafts.createdAt, cutoff)
                                    : undefined,
                            ),
                        )
                        .groupBy(teamDrafts.algorithmVersion),
                ),
            )
            .orderBy(asc(teamDrafts.algorithmVersion)),
    ]);
    const teams = (allocation: GraphTeamResult['teams']) =>
        allocation
            .map((team) => ({
                teamNumber: team.teamNumber,
                studentIds: team.studentIds.filter(
                    (id) => visible.has(id) && canReadStudent(access, id),
                ),
            }))
            .filter((team) => team.studentIds.length)
            .sort((a, b) => a.teamNumber - b.teamNumber);
    const results: GraphTeamResult[] = [];
    if (confirmed)
        results.push({
            id: `confirmed-${confirmed.id}`,
            kind: 'confirmed',
            projectName: confirmed.projectName,
            confirmedAt: confirmed.confirmedAt,
            revision: confirmed.revision,
            teams: teams(confirmed.allocation),
        });
    for (const draft of drafts)
        results.push({
            id: `draft-${draft.id}`,
            kind: 'draft',
            projectName: draft.projectName,
            algorithmVersion: draft.algorithmVersion,
            createdAt: draft.createdAt,
            teams: teams(draft.allocation),
        });
    return results.filter((result) => result.teams.length);
}
