import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
    projects,
    students,
    teamDrafts,
    teams,
    confirmedAssignments,
    assignmentMembers,
    pairingRestrictions,
} from '../../db/schema';
import type { AppDatabase } from './db';
import {
    requireProject,
    canReadStudent,
    teachingAccess,
    type TeacherAccess,
} from './access';
import { knowledgeSourceLabel } from './knowledgeContext';
import { InputError } from './input';
import { loadStudentProfiles } from './studentProfiles';
import type { DataSession } from './studentIdentity';
import { academicPeriod } from './studentIdentity';
import { createTeams, type StudentData } from './teamMatcher';
import { createTeamsV1 } from './teamMatcherV1';
import { skillScale, type Skills } from './skills';
import type {
    AssessmentValues,
    Allocation,
    FormationSnapshot,
    HistoryMode,
} from './trackingTypes';

const baseline = (value: number | undefined) =>
    value ?? skillScale.defaultValue;
function algorithmSkills(values: AssessmentValues): Skills {
    return {
        skillsNarrative: {
            creativity: baseline(values.skillsNarrative.creativity),
            writing: baseline(values.skillsNarrative.writing),
            references: baseline(values.skillsNarrative.references),
            communication: baseline(values.skillsNarrative.communication),
        },
        skillsTechnical: {
            camera: baseline(values.skillsTechnical.camera),
            sound: baseline(values.skillsTechnical.sound),
            editing: baseline(values.skillsTechnical.editing),
        },
        skillsManagement: {
            planning: baseline(values.skillsManagement.planning),
            production: baseline(values.skillsManagement.production),
        },
        skillsSoft: {
            leadership: baseline(values.skillsSoft.leadership),
            listening: baseline(values.skillsSoft.listening),
            proactivity: baseline(values.skillsSoft.proactivity),
            teamwork: baseline(values.skillsSoft.teamwork),
            motivation: baseline(values.skillsSoft.motivation),
            conflict: baseline(values.skillsSoft.conflict),
        },
    };
}
const pairKey = (first: number, second: number) =>
    [first, second].sort((a, b) => a - b).join(':');

export async function confirmedPairHistory(
    db: DataSession,
    selectedIds: number[],
    excludingProjectId?: number,
) {
    const selected = new Set(selectedIds);
    const memberships = await db.query.assignmentMembers.findMany({
        where: inArray(assignmentMembers.studentId, selectedIds),
    });
    const assignments = await db.query.confirmedAssignments.findMany({
        where: inArray(confirmedAssignments.id, [
            ...new Set(memberships.map((row) => row.assignmentId)),
        ]),
    });
    const byPair = new Map<
        string,
        { student1Id: number; student2Id: number; projects: Set<string> }
    >();
    for (const assignment of assignments) {
        if (
            excludingProjectId !== undefined &&
            assignment.originProjectId === excludingProjectId
        )
            continue;
        for (const team of assignment.allocation) {
            const ids = team.studentIds.filter((id) => selected.has(id));
            for (let i = 0; i < ids.length; i++)
                for (let j = i + 1; j < ids.length; j++) {
                    const key = pairKey(ids[i], ids[j]);
                    const row = byPair.get(key) ?? {
                        student1Id: Math.min(ids[i], ids[j]),
                        student2Id: Math.max(ids[i], ids[j]),
                        projects: new Set(),
                    };
                    row.projects.add(`project:${assignment.originProjectId}`);
                    byPair.set(key, row);
                }
        }
    }
    return [...byPair.values()].map((row) => ({
        student1Id: row.student1Id,
        student2Id: row.student2Id,
        projects: row.projects.size,
    }));
}

export async function formationInputs(
    db: DataSession,
    access: TeacherAccess,
    projectId: number,
    historyMode?: HistoryMode,
) {
    requireProject(access, projectId);
    const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
    });
    if (!project || project.archivedAt)
        throw new InputError('Proiektua ez dago erabilgarri.', 404);
    const participants = await db.query.students.findMany({
        where: eq(students.projectId, projectId),
    });
    if (
        participants.some(
            (row) =>
                row.studentRecordId === null ||
                !canReadStudent(access, row.studentRecordId),
        )
    )
        throw new InputError(
            'Parte-hartzaileen identitateak edo baimenak berrikusi behar dira.',
            403,
        );
    const ids = participants.map((row) => row.studentRecordId!);
    if (new Set(ids).size !== ids.length)
        throw new InputError(
            'Proiektuan identitate bikoiztuak daude. Berrikusi loturak.',
            409,
        );
    const profiles = await loadStudentProfiles(db, access, ids, {
        projectId,
        academicPeriod: project.academicPeriod || academicPeriod(),
    });
    if (
        participants.some(
            (row) =>
                !row.isExcluded &&
                profiles.get(row.studentRecordId!)?.person.needsReview,
        )
    )
        throw new InputError(
            'Ebatzi identitateen berrikuspena taldeak sortu aurretik.',
            409,
        );
    const activeIds = participants
        .filter((row) => !row.isExcluded)
        .map((row) => row.studentRecordId!);
    const active = new Set(activeIds);
    const [history, restrictionRows] = await Promise.all([
        confirmedPairHistory(db, activeIds, projectId),
        db.query.pairingRestrictions.findMany({
            where: isNull(pairingRestrictions.withdrawnAt),
        }),
    ]);
    const restrictions = restrictionRows.filter(
        (rule) =>
            active.has(rule.student1Id) &&
            active.has(rule.student2Id) &&
            (rule.scope === 'project'
                ? rule.projectId === projectId
                : rule.academicPeriod ===
                  (project.academicPeriod || academicPeriod())),
    );
    const snapshot: FormationSnapshot = {
        capturedAt: new Date().toISOString(),
        configuration: {
            projectType: project.projectType,
            numTeams: project.numTeams,
            targetTeamSize: project.targetTeamSize,
            fallbackSkillValue: skillScale.defaultValue,
            policyVersion: 'ongoing-tracking-v1',
        },
        projectName: project.name,
        academicPeriod: project.academicPeriod || academicPeriod(),
        historyMode: historyMode || project.historyMode,
        inputs: participants.map((participant) => {
            const profile = profiles.get(participant.studentRecordId!)!;
            const preferences = {
                comfort: [] as number[],
                preferWith: [] as number[],
                preferAvoid: [] as number[],
            };
            for (const link of profile.relationships)
                if (
                    !link.incoming &&
                    link.kind !== 'restriction' &&
                    active.has(link.target)
                )
                    preferences[link.kind].push(link.target);
            return {
                studentId: profile.person.id,
                participantId: participant.id,
                name: participant.name,
                assessmentId: profile.assessment?.id ?? null,
                assessmentDate: profile.assessment?.submittedAt ?? null,
                assessmentSource: profile.assessment
                    ? knowledgeSourceLabel(profile.assessment)
                    : null,
                preferenceDate: profile.preference?.submittedAt ?? null,
                preferenceSubmissionId: profile.preference?.id ?? null,
                assessment: profile.values,
                preferences,
                excluded: Boolean(participant.isExcluded),
                needsReview:
                    profile.needsReview ||
                    !profile.assessment ||
                    profile.assessment.academicPeriod !==
                        (project.academicPeriod || academicPeriod()),
            };
        }),
        history,
        restrictions: restrictions.map((row) => ({
            id: row.id,
            student1Id: row.student1Id,
            student2Id: row.student2Id,
            reviewAt: row.reviewAt,
        })),
    };
    return { project, participants, snapshot };
}

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
            'Irakaslearen derrigorrezko murrizketak betetzeko egokitua. Gaitasunen oreka eta ikasleen hobespenak bigarren mailako irizpideak dira.',
    }));
}

async function persistDraft(
    db: AppDatabase,
    access: TeacherAccess,
    projectId: number,
    version: 'v1' | 'v2',
    allocation: Allocation[],
    snapshot: FormationSnapshot,
    source: 'generated' | 'manual-adjustment',
    numTeams?: number,
) {
    return db.transaction(async (tx) => {
        const [draft] = await tx
            .insert(teamDrafts)
            .values({
                projectId,
                projectName: snapshot.projectName,
                algorithmVersion: version,
                allocation,
                inputSnapshot: snapshot,
                source,
                createdBy: access.actor.id,
                createdAt: new Date().toISOString(),
            })
            .returning();
        await tx
            .delete(teams)
            .where(
                and(
                    eq(teams.projectId, projectId),
                    eq(teams.algorithmVersion, version),
                ),
            );
        const participantIds = new Map(
            snapshot.inputs.map((input) => [
                input.studentId,
                input.participantId,
            ]),
        );
        if (allocation.length)
            await tx.insert(teams).values(
                allocation.map((team) => ({
                    projectId,
                    algorithmVersion: version,
                    draftId: draft.id,
                    teamNumber: team.teamNumber,
                    memberIds: team.studentIds.map((id) =>
                        participantIds.get(id)!,
                    ),
                    justification: team.justification,
                })),
            );
        await tx
            .update(projects)
            .set({
                historyMode: snapshot.historyMode,
                ...(numTeams === undefined ? {} : { numTeams }),
            })
            .where(eq(projects.id, projectId));
        return draft;
    });
}
export async function generateDraft(
    db: AppDatabase,
    access: TeacherAccess,
    projectId: number,
    version: 'v1' | 'v2',
    options: { historyMode?: HistoryMode; numTeams?: number } = {},
) {
    const { project, snapshot } = await formationInputs(
        db,
        access,
        projectId,
        options.historyMode,
    );
    const active = snapshot.inputs.filter((input) => !input.excluded);
    if (!active.length)
        throw new InputError('Proiektuan ez dago ikasle aktiborik.');
    const numTeams =
        options.numTeams ??
        project.numTeams ??
        Math.max(1, Math.round(active.length / (project.targetTeamSize || 4)));
    if (!Number.isInteger(numTeams) || numTeams < 1 || numTeams > active.length)
        throw new InputError(
            'Talde kopurua 1 eta ikasle aktiboen kopuruaren artekoa izan behar da.',
        );
    snapshot.configuration.numTeams = numTeams;
    const data: StudentData[] = active.map((input) => ({
        id: input.studentId,
        name: input.name,
        skills: algorithmSkills(input.assessment),
        ...input.preferences,
        isExcluded: false,
    }));
    const weight =
        snapshot.historyMode === 'variety'
            ? 1
            : snapshot.historyMode === 'familiar'
              ? -1
              : 0.5;
    const generated =
        version === 'v1'
            ? createTeamsV1(
                  data,
                  numTeams,
                  project.projectType,
                  snapshot.history,
                  weight,
              )
            : createTeams(
                  data,
                  numTeams,
                  project.projectType,
                  snapshot.history,
                  weight,
              );
    const proposal = generated.map((team) => ({
        teamNumber: team.teamNumber,
        studentIds: team.memberIds,
        justification:
            team.justification +
            '\nAlgoritmoak erantzun ezezagunetan 5eko balioa erabiltzen du; ez da ikaslearen autoebaluazioan edo historian gordetzen.',
    }));
    const allocation = applyRestrictions(proposal, snapshot.restrictions);
    validateAllocation(
        allocation,
        active.map((input) => input.studentId),
        snapshot.restrictions,
    );
    return persistDraft(
        db,
        access,
        projectId,
        version,
        allocation,
        snapshot,
        'generated',
        numTeams,
    );
}
export async function adjustDraft(
    db: AppDatabase,
    access: TeacherAccess,
    projectId: number,
    draftId: number,
    allocation: Allocation[],
) {
    const { snapshot } = await formationInputs(db, access, projectId);
    const original = await db.query.teamDrafts.findFirst({
        where: eq(teamDrafts.id, draftId),
    });
    if (!original || original.projectId !== projectId)
        throw new InputError('Zirriborroa ez da existitzen.', 404);
    const current = await db.query.teams.findFirst({
        where: and(
            eq(teams.projectId, projectId),
            eq(teams.algorithmVersion, original.algorithmVersion),
        ),
    });
    if (current?.draftId !== draftId)
        throw new InputError(
            'Zirriborroa aldatu da. Kargatu orria berriro.',
            409,
        );
    const actualIds = snapshot.inputs
        .filter((input) => !input.excluded)
        .map((input) => input.studentId);
    validateAllocation(allocation, actualIds, snapshot.restrictions);
    if (
        original.inputSnapshot &&
        (original.inputSnapshot.inputs.filter((input) => !input.excluded)
            .length !== actualIds.length ||
            original.inputSnapshot.inputs
                .filter((input) => !input.excluded)
                .some((input) => !actualIds.includes(input.studentId)))
    )
        throw new InputError(
            'Parte-hartzaileak aldatu dira. Sortu zirriborro berria.',
            409,
        );
    const inputs = original.inputSnapshot
        ? { ...original.inputSnapshot, restrictions: snapshot.restrictions }
        : snapshot;
    return persistDraft(
        db,
        access,
        projectId,
        original.algorithmVersion,
        allocation.map((team) => ({
            ...team,
            justification: 'Irakasleak eskuz egokitutako esleipena.',
        })),
        inputs,
        'manual-adjustment',
    );
}
export async function confirmDraft(
    db: AppDatabase,
    access: TeacherAccess,
    projectId: number,
    draftId: number,
) {
    return db.transaction(async (tx) => {
        const { snapshot } = await formationInputs(
            tx,
            await teachingAccess(tx, access.actor),
            projectId,
        );
        const draft = await tx.query.teamDrafts.findFirst({
            where: eq(teamDrafts.id, draftId),
        });
        if (!draft || draft.projectId !== projectId || !draft.inputSnapshot)
            throw new InputError(
                'Zirriborroaren sarrerak erregistratu behar dira. Berriro sortu edo egokitu lehenago.',
                409,
            );
        const current = await tx.query.teams.findFirst({
            where: and(
                eq(teams.projectId, projectId),
                eq(teams.algorithmVersion, draft.algorithmVersion),
            ),
        });
        if (current?.draftId !== draft.id)
            throw new InputError(
                'Zirriborroa aldatu da. Kargatu orria berriro.',
                409,
            );
        validateAllocation(
            draft.allocation,
            snapshot.inputs
                .filter((input) => !input.excluded)
                .map((input) => input.studentId),
            snapshot.restrictions,
        );
        const previous = await tx.query.confirmedAssignments.findFirst({
            where: eq(confirmedAssignments.projectId, projectId),
            orderBy: (row, { desc }) => [desc(row.revision)],
        });
        if (previous?.draftId === draft.id) return previous;
        if (
            previous &&
            JSON.stringify(
                previous.allocation
                    .map((team) => [
                        team.teamNumber,
                        [...team.studentIds].sort((a, b) => a - b),
                    ])
                    .sort(),
            ) ===
                JSON.stringify(
                    draft.allocation
                        .map((team) => [
                            team.teamNumber,
                            [...team.studentIds].sort((a, b) => a - b),
                        ])
                        .sort(),
                ) &&
            previous.algorithmVersion === draft.algorithmVersion
        )
            return previous;
        const date = new Date().toISOString();
        if (previous)
            await tx
                .update(confirmedAssignments)
                .set({ supersededAt: date })
                .where(eq(confirmedAssignments.id, previous.id));
        const [assignment] = await tx
            .insert(confirmedAssignments)
            .values({
                originProjectId: projectId,
                projectId,
                projectName: snapshot.projectName,
                revision: (previous?.revision ?? 0) + 1,
                draftId,
                algorithmVersion: draft.algorithmVersion,
                allocation: draft.allocation,
                inputSnapshot: {
                    ...draft.inputSnapshot,
                    confirmationRestrictions: snapshot.restrictions,
                },
                confirmedBy: access.actor.id,
                confirmedAt: date,
            })
            .returning();
        await tx.insert(assignmentMembers).values(
            draft.allocation.flatMap((team) =>
                team.studentIds.map((studentId) => ({
                    assignmentId: assignment.id,
                    studentId,
                    teamNumber: team.teamNumber,
                })),
            ),
        );
        return assignment;
    });
}
