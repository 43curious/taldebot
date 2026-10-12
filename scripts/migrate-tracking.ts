import { drizzle } from 'drizzle-orm/libsql';
import type { Client } from '@libsql/client';
import { eq, isNull, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { AssessmentValues, Allocation } from '../src/lib/trackingTypes';
import { skillGroups, skillScale } from '../src/lib/skills';

const normalized = (value: string | null) =>
    (value || '').trim().toLocaleLowerCase('eu');
const emptyAssessment = (): AssessmentValues => ({
    skillsNarrative: {},
    skillsTechnical: {},
    skillsManagement: {},
    skillsSoft: {},
});
function parsed(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

// Reruns import only previously unmapped legacy rows. Source IDs/values remain intact.
export async function backfillTracking(client: Client) {
    const db = drizzle(client, { schema });
    await db.transaction(async (tx) => {
        const roster = await tx.query.classMembers.findMany();
        const participants = await tx.query.students.findMany();
        const projects = await tx.query.projects.findMany();
        const users = await tx.query.users.findMany();
        const classRows = await tx.query.classes.findMany();
        const degrees = await tx.query.degrees.findMany();
        const people = await tx.query.studentRecords.findMany();
        const aliases = await tx.query.studentEmails.findMany();
        const projectById = new Map(projects.map((row) => [row.id, row]));
        const participantById = new Map(
            participants.map((row) => [row.id, row]),
        );
        const personById = new Map(people.map((row) => [row.id, row]));
        const peopleByEmail = new Map<string, Set<number>>();
        const names = new Map<string, Set<number>>();
        for (const person of people) {
            const ids = names.get(normalized(person.name)) ?? new Set();
            ids.add(person.id);
            names.set(normalized(person.name), ids);
        }
        for (const alias of aliases) {
            const ids = peopleByEmail.get(normalized(alias.email)) ?? new Set();
            ids.add(alias.studentId);
            peopleByEmail.set(normalized(alias.email), ids);
        }
        async function createPerson(
            name: string,
            email: string | null,
            owner: number | null,
            needsReview: boolean,
        ) {
            const [person] = await tx
                .insert(schema.studentRecords)
                .values({ name, email, createdBy: owner, needsReview })
                .returning();
            personById.set(person.id, person);
            const ids = names.get(normalized(name)) ?? new Set();
            ids.add(person.id);
            names.set(normalized(name), ids);
            if (email) {
                await tx
                    .insert(schema.studentEmails)
                    .values({
                        studentId: person.id,
                        email: normalized(email),
                        source: 'legacy',
                    })
                    .onConflictDoNothing();
                const ids = peopleByEmail.get(normalized(email)) ?? new Set();
                ids.add(person.id);
                peopleByEmail.set(normalized(email), ids);
            }
            return person.id;
        }
        async function review(
            sourceType: 'roster' | 'participant' | 'response',
            sourceId: number,
            provisionalStudentId: number | null,
            reason: string,
            candidates: number[],
            rawSource?: Record<string, unknown>,
        ) {
            await tx
                .insert(schema.identityReviews)
                .values({
                    sourceType,
                    sourceId,
                    provisionalStudentId,
                    reason,
                    candidates,
                    rawSource,
                })
                .onConflictDoNothing();
        }
        for (const project of projects) {
            if (project.ownerId !== null || !project.adminEmail) continue;
            const candidates = users.filter(
                (user) =>
                    normalized(user.email) === normalized(project.adminEmail),
            );
            if (candidates.length === 1) {
                await tx
                    .update(schema.projects)
                    .set({ ownerId: candidates[0].id })
                    .where(eq(schema.projects.id, project.id));
                project.ownerId = candidates[0].id;
            }
        }
        // A shared email is reusable only when the roster gives one consistent name,
        // with no duplicate entry in a class. Otherwise preserve distinct people.
        for (const member of roster) {
            if (member.studentRecordId !== null) continue;
            const sameEmail = member.email
                ? roster.filter(
                      (row) =>
                          normalized(row.email) === normalized(member.email),
                  )
                : [];
            const ambiguous =
                sameEmail.length > 1 &&
                (new Set(sameEmail.map((row) => normalized(row.name))).size !==
                    1 ||
                    new Set(sameEmail.map((row) => row.classId)).size !==
                        sameEmail.length);
            const ids = peopleByEmail.get(normalized(member.email));
            const personId =
                !ambiguous && ids?.size === 1
                    ? [...ids][0]
                    : await createPerson(
                          member.name,
                          member.email,
                          null,
                          ambiguous,
                      );
            member.studentRecordId = personId;
            await tx
                .update(schema.classMembers)
                .set({ studentRecordId: personId })
                .where(eq(schema.classMembers.id, member.id));
            const group = classRows.find((row) => row.id === member.classId)!;
            await tx
                .insert(schema.enrollments)
                .values({
                    studentId: personId,
                    classId: group.id,
                    className: group.name,
                    degreeName:
                        degrees.find((row) => row.id === group.degreeId)
                            ?.name ?? null,
                    year: group.year,
                    academicPeriod: 'legacy',
                    startedAt: member.createdAt,
                    source: 'legacy-roster',
                    rosterSnapshot: { ...member },
                });
            if (ambiguous)
                await review(
                    'roster',
                    member.id,
                    personId,
                    'Email partekatua edo zerrendako identitate anbiguoa',
                    [...(ids ?? [])],
                    { ...member },
                );
        }
        // Resolve names against the entire roster, including other classes.
        const rosterNames = new Map<string, Set<number>>();
        for (const member of roster) {
            const ids = rosterNames.get(normalized(member.name)) ?? new Set();
            ids.add(member.studentRecordId!);
            rosterNames.set(normalized(member.name), ids);
        }
        for (const participant of participants) {
            if (participant.studentRecordId !== null) continue;
            const emails = peopleByEmail.get(normalized(participant.email));
            const nameIds = rosterNames.get(normalized(participant.name));
            let resolved: number | undefined;
            if (participant.email && emails?.size === 1)
                resolved = [...emails][0];
            else if (
                (!participant.email || !emails?.size) &&
                nameIds?.size === 1
            ) {
                const person = personById.get([...nameIds][0])!;
                if (!participant.email || !person.email) resolved = person.id;
            }
            // Duplicate snapshots in a project must not collapse two participants.
            if (
                resolved &&
                participants.some(
                    (row) =>
                        row.id !== participant.id &&
                        row.projectId === participant.projectId &&
                        row.studentRecordId === resolved,
                )
            )
                resolved = undefined;
            const candidates = [
                ...new Set([...(emails ?? []), ...(nameIds ?? [])]),
            ];
            const ambiguous =
                resolved === undefined &&
                (candidates.length > 0 || !participant.email);
            const personId =
                resolved ??
                (await createPerson(
                    participant.name,
                    participant.email,
                    projectById.get(participant.projectId ?? 0)?.ownerId ??
                        null,
                    ambiguous,
                ));
            participant.studentRecordId = personId;
            await tx
                .update(schema.students)
                .set({ studentRecordId: personId })
                .where(eq(schema.students.id, participant.id));
            if (ambiguous)
                await review(
                    'participant',
                    participant.id,
                    personId,
                    'Inkestako identitatea ezin da ziurtasunez lotu',
                    candidates,
                );
        }
        // Preserve raw values and dates; invalid scores remain unknown in the profile.
        const rawResponses = await tx.all<Record<string, unknown>>(
            sql`SELECT * FROM responses`,
        );
        const importedAssessments = new Set(
            (await tx.query.assessments.findMany()).map(
                (row) => row.legacyResponseId,
            ),
        );
        const importedPreferences = new Set(
            (await tx.query.preferenceSubmissions.findMany()).map(
                (row) => row.legacyResponseId,
            ),
        );
        const columns = {
            skillsNarrative: 'skills_narrative',
            skillsTechnical: 'skills_technical',
            skillsManagement: 'skills_management',
            skillsSoft: 'skills_soft',
        } as const;
        for (const row of rawResponses) {
            const responseId = Number(row.id);
            const participant = participantById.get(Number(row.student_id));
            const project = projectById.get(Number(row.project_id));
            if (
                !participant?.studentRecordId ||
                participant.projectId !== Number(row.project_id)
            ) {
                await review(
                    'response',
                    responseId,
                    null,
                    'Erantzunak ez du proiektu bereko parte-hartzaile baliodunik',
                    [],
                    row,
                );
                continue;
            }
            const submittedAt =
                typeof row.completed_at === 'string' &&
                !Number.isNaN(Date.parse(row.completed_at))
                    ? row.completed_at
                    : null;
            const data = emptyAssessment();
            for (const group of skillGroups) {
                const original = parsed(row[columns[group.key]]);
                const scores: Record<string, number> = {};
                if (
                    original &&
                    typeof original === 'object' &&
                    !Array.isArray(original)
                ) {
                    for (const key of group.keys) {
                        const value = (original as Record<string, unknown>)[
                            key
                        ];
                        if (
                            typeof value === 'number' &&
                            Number.isInteger(value) &&
                            value >= skillScale.min &&
                            value <= skillScale.max
                        )
                            scores[key] = value;
                    }
                }
                data[group.key] = scores;
            }
            if (!importedAssessments.has(responseId))
                await tx
                    .insert(schema.assessments)
                    .values({
                        studentId: participant.studentRecordId,
                        data,
                        source: 'legacy-survey',
                        projectId: participant.projectId,
                        projectName: project?.name ?? 'Aurretiko proiektua',
                        academicPeriod: project?.academicPeriod ?? 'legacy',
                        legacyResponseId: responseId,
                        legacyParticipantId: participant.id,
                        submittedAt,
                        rawLegacyData: row,
                    });
            if (!importedPreferences.has(responseId)) {
                const unresolved: number[] = [];
                const choices: {
                    targetStudentId: number;
                    kind: 'comfort' | 'preferWith' | 'preferAvoid';
                }[] = [];
                for (const [kind, column] of [
                    ['comfort', 'comfort'],
                    ['preferWith', 'prefer_with'],
                    ['preferAvoid', 'prefer_avoid'],
                ] as const) {
                    const ids = parsed(row[column]);
                    if (!Array.isArray(ids)) continue;
                    for (const id of new Set(ids)) {
                        if (typeof id !== 'number' || !Number.isSafeInteger(id))
                            continue;
                        const target = participantById.get(id);
                        if (
                            !target?.studentRecordId ||
                            target.projectId !== participant.projectId
                        ) {
                            unresolved.push(id);
                            continue;
                        }
                        if (
                            target.studentRecordId !==
                            participant.studentRecordId
                        )
                            choices.push({
                                targetStudentId: target.studentRecordId,
                                kind,
                            });
                    }
                }
                const [submission] = await tx
                    .insert(schema.preferenceSubmissions)
                    .values({
                        studentId: participant.studentRecordId,
                        scope: 'project',
                        academicPeriod: project?.academicPeriod ?? 'legacy',
                        projectId: participant.projectId,
                        projectName: project?.name ?? 'Aurretiko proiektua',
                        source: 'legacy-survey',
                        legacyResponseId: responseId,
                        legacyParticipantId: participant.id,
                        submittedAt,
                        rawLegacyData: row,
                        unresolvedTargets: unresolved,
                        complete:
                            !unresolved.length &&
                            ['comfort', 'prefer_with', 'prefer_avoid'].every(
                                (key) => Array.isArray(parsed(row[key])),
                            ),
                    })
                    .returning();
                if (choices.length)
                    await tx
                        .insert(schema.preferenceChoices)
                        .values(
                            choices.map((choice) => ({
                                ...choice,
                                submissionId: submission.id,
                            })),
                        )
                        .onConflictDoNothing();
            }
        }
        const legacyTeams = await tx.query.teams.findMany({
            where: isNull(schema.teams.draftId),
        });
        const grouped = new Map<string, typeof legacyTeams>();
        for (const team of legacyTeams) {
            const key = `${team.projectId}:${team.algorithmVersion}`;
            const rows = grouped.get(key) ?? [];
            rows.push(team);
            grouped.set(key, rows);
        }
        for (const rows of grouped.values()) {
            const project = projectById.get(rows[0].projectId ?? 0);
            const allocation: Allocation[] = rows.map((team) => ({
                teamNumber: team.teamNumber,
                justification: team.justification,
                studentIds: team.memberIds.flatMap((id) => {
                    const participant = participantById.get(id);
                    return participant?.studentRecordId &&
                        participant.projectId === team.projectId
                        ? [participant.studentRecordId]
                        : [];
                }),
            }));
            const [draft] = await tx
                .insert(schema.teamDrafts)
                .values({
                    projectId: project?.id ?? null,
                    projectName: project?.name ?? 'Aurretiko proiektua',
                    algorithmVersion:
                        rows[0].algorithmVersion === 'v1' ? 'v1' : 'v2',
                    allocation,
                    inputSnapshot: null,
                    source: 'legacy-draft',
                    createdAt: rows[0].createdAt ?? new Date().toISOString(),
                })
                .returning();
            for (const team of rows)
                await tx
                    .update(schema.teams)
                    .set({ draftId: draft.id })
                    .where(eq(schema.teams.id, team.id));
        }
        const imported = await tx.query.assessments.findMany();
        const unlinked = await tx.query.identityReviews.findMany({
            where: eq(schema.identityReviews.sourceType, 'response'),
        });
        const retained = new Set([
            ...imported.map((row) => row.legacyResponseId),
            ...unlinked.map((row) => row.sourceId),
        ]);
        if (rawResponses.some((row) => !retained.has(Number(row.id))))
            throw new Error(
                'Tracking migration did not preserve every source response',
            );
        if ((await tx.all(sql`PRAGMA foreign_key_check`)).length)
            throw new Error('Tracking migration would break references');
    });
}
