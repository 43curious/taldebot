import { inArray, or } from 'drizzle-orm';
import {
    assessments,
    preferenceSubmissions,
    preferenceChoices,
    studentRecords,
    enrollments,
    pairingRestrictions,
    confirmedAssignments,
    assignmentMembers,
} from '../../db/schema';
import type { DataSession } from './studentIdentity';
import type { AssessmentValues, PreferenceKind } from './trackingTypes';
import { academicPeriod } from './studentIdentity';
import {
    canReadStudent,
    isMaster,
    requireStudent,
    requireProject,
    type TeacherAccess,
} from './access';

export interface ProfileContext {
    projectId?: number;
    academicPeriod?: string;
    asOf?: string;
}
export interface ProfileRelationship {
    source: number;
    target: number;
    peerName: string;
    kind: PreferenceKind | 'restriction';
    submittedAt: string | null;
    sourceLabel: string;
    scope: 'period' | 'project';
    incoming: boolean;
    accessible: boolean;
    reviewAt?: string;
}
const timestamp = (value: string | null) =>
    value
        ? Date.parse(value.replace(' ', 'T') + (value.includes('T') ? '' : 'Z'))
        : -Infinity;
const latest = <T extends { id: number; submittedAt: string | null }>(
    rows: T[],
) =>
    rows
        .slice()
        .sort(
            (a, b) =>
                timestamp(b.submittedAt) - timestamp(a.submittedAt) ||
                b.id - a.id,
        )[0];
const activeAt = (withdrawnAt: string | null, asOf?: string) =>
    !withdrawnAt ||
    Boolean(
        asOf && timestamp(withdrawnAt) > Date.parse(`${asOf}T23:59:59.999Z`),
    );
const before = (date: string | null, asOf?: string) =>
    !asOf ||
    (date !== null && timestamp(date) <= Date.parse(`${asOf}T23:59:59.999Z`));
export const emptyAssessment = (): AssessmentValues => ({
    skillsNarrative: {},
    skillsTechnical: {},
    skillsManagement: {},
    skillsSoft: {},
});

// One bulk read supplies the graph, individual reports and generation inputs.
export async function loadStudentProfiles(
    db: DataSession,
    access: TeacherAccess,
    studentIds: number[],
    context: ProfileContext = {},
) {
    for (const id of studentIds) requireStudent(access, id);
    if (context.projectId) requireProject(access, context.projectId);
    const period =
        context.academicPeriod ||
        academicPeriod(context.asOf ? new Date(context.asOf) : new Date());
    const [
        people,
        assessmentRows,
        submitted,
        enrollmentRows,
        rules,
        memberRows,
    ] = await Promise.all([
        db.query.studentRecords.findMany({
            where: inArray(studentRecords.id, studentIds),
        }),
        db.query.assessments.findMany({
            where: inArray(assessments.studentId, studentIds),
        }),
        db.query.preferenceSubmissions.findMany({
            where: or(
                inArray(preferenceSubmissions.studentId, studentIds),
                inArray(
                    preferenceSubmissions.id,
                    db
                        .select({ id: preferenceChoices.submissionId })
                        .from(preferenceChoices)
                        .where(
                            inArray(
                                preferenceChoices.targetStudentId,
                                studentIds,
                            ),
                        ),
                ),
            ),
        }),
        db.query.enrollments.findMany({
            where: inArray(enrollments.studentId, studentIds),
        }),
        db.query.pairingRestrictions.findMany({
            where: or(
                inArray(pairingRestrictions.student1Id, studentIds),
                inArray(pairingRestrictions.student2Id, studentIds),
            ),
        }),
        db.query.assignmentMembers.findMany({
            where: inArray(assignmentMembers.studentId, studentIds),
        }),
    ]);
    const visibleSubmissions = submitted.filter((row) =>
        canReadStudent(access, row.studentId),
    );
    const submissions = visibleSubmissions.filter(
        (row) =>
            row.complete &&
            canReadStudent(access, row.studentId) &&
            activeAt(row.withdrawnAt, context.asOf) &&
            before(row.submittedAt, context.asOf),
    );
    const choices = await db.query.preferenceChoices.findMany({
        where: inArray(
            preferenceChoices.submissionId,
            visibleSubmissions.map((row) => row.id),
        ),
    });
    const assignmentRows = await db.query.confirmedAssignments.findMany({
        where: inArray(confirmedAssignments.id, [
            ...new Set(memberRows.map((row) => row.assignmentId)),
        ]),
    });
    const applicable = new Map<
        number,
        typeof preferenceSubmissions.$inferSelect
    >();
    for (const id of new Set(submissions.map((row) => row.studentId))) {
        const project = context.projectId
            ? latest(
                  submissions.filter(
                      (row) =>
                          row.studentId === id &&
                          row.scope === 'project' &&
                          row.projectId === context.projectId,
                  ),
              )
            : undefined;
        const general = latest(
            submissions.filter(
                (row) =>
                    row.studentId === id &&
                    row.scope === 'period' &&
                    row.academicPeriod === period,
            ),
        );
        const selected = project ?? general;
        if (selected) applicable.set(id, selected);
    }
    const peerIds = new Set(choices.map((row) => row.targetStudentId));
    for (const row of submissions) peerIds.add(row.studentId);
    for (const row of rules) {
        peerIds.add(row.student1Id);
        peerIds.add(row.student2Id);
    }
    for (const row of assignmentRows)
        for (const team of row.allocation)
            for (const id of team.studentIds) peerIds.add(id);
    const peers = await db.query.studentRecords.findMany({
        where: inArray(
            studentRecords.id,
            [...peerIds].filter((id) => canReadStudent(access, id)),
        ),
    });
    const names = new Map(peers.map((person) => [person.id, person.name]));
    const submissionById = new Map(submissions.map((row) => [row.id, row]));
    const activeRules = rules.filter(
        (row) =>
            activeAt(row.withdrawnAt, context.asOf) &&
            before(row.createdAt, context.asOf) &&
            (row.scope === 'period'
                ? row.academicPeriod === period
                : Boolean(
                      context.projectId && row.projectId === context.projectId,
                  )),
    );
    return new Map(
        people.map((person) => {
            const history = assessmentRows
                .filter(
                    (row) =>
                        row.studentId === person.id &&
                        before(row.submittedAt, context.asOf),
                )
                .sort(
                    (a, b) =>
                        timestamp(b.submittedAt) - timestamp(a.submittedAt) ||
                        b.id - a.id,
                );
            const available = history.filter(
                (row) =>
                    activeAt(row.withdrawnAt, context.asOf) &&
                    row.questionnaireVersion === 'skills-v1',
            );
            const local = context.projectId
                ? latest(
                      available.filter(
                          (row) => row.projectId === context.projectId,
                      ),
                  )
                : undefined;
            const assessment = local ?? latest(available);
            const values: AssessmentValues = assessment
                ? structuredClone(assessment.data)
                : emptyAssessment();
            // Motivation answers are meaningful only in the selected source project.
            if (
                !context.projectId ||
                assessment?.projectId !== context.projectId
            )
                delete values.skillsSoft.motivation;
            const preference = applicable.get(person.id);
            const relationships: ProfileRelationship[] = [];
            for (const choice of choices) {
                const source = submissionById.get(choice.submissionId);
                if (!source) continue;
                if (applicable.get(source.studentId)?.id !== source.id)
                    continue;
                if (
                    source.studentId !== person.id &&
                    choice.targetStudentId !== person.id
                )
                    continue;
                const incoming = source.studentId !== person.id;
                const peerId = incoming
                    ? source.studentId
                    : choice.targetStudentId;
                relationships.push({
                    source: source.studentId,
                    target: choice.targetStudentId,
                    peerName: names.get(peerId) ?? 'Beste klase bateko ikaslea',
                    accessible: names.has(peerId),
                    incoming,
                    kind: choice.kind,
                    submittedAt: source.submittedAt,
                    sourceLabel:
                        source.scope === 'project'
                            ? source.projectName || 'Proiektua'
                            : source.academicPeriod,
                    scope: source.scope,
                });
            }
            const restrictions = activeRules
                .filter(
                    (row) =>
                        row.student1Id === person.id ||
                        row.student2Id === person.id,
                )
                .map((row) => ({
                    ...row,
                    reason:
                        isMaster(access) || row.createdBy === access.actor.id
                            ? row.reason
                            : null,
                }));
            for (const rule of restrictions) {
                const target =
                    rule.student1Id === person.id
                        ? rule.student2Id
                        : rule.student1Id;
                relationships.push({
                    source: person.id,
                    target,
                    peerName: names.get(target) ?? 'Beste klase bateko ikaslea',
                    accessible: names.has(target),
                    incoming: false,
                    kind: 'restriction',
                    submittedAt: rule.createdAt,
                    sourceLabel: 'Irakaslearen derrigorrezko murrizketa',
                    scope: rule.scope,
                    reviewAt: rule.reviewAt,
                });
            }
            const assignmentHistory = assignmentRows
                .filter(
                    (row) =>
                        before(row.confirmedAt, context.asOf) &&
                        row.allocation.some((team) =>
                            team.studentIds.includes(person.id),
                        ),
                )
                .map((row) => {
                    const team = row.allocation.find((team) =>
                        team.studentIds.includes(person.id),
                    )!;
                    return {
                        id: row.id,
                        projectId: row.projectId,
                        projectName: row.projectName,
                        revision: row.revision,
                        confirmedAt: row.confirmedAt,
                        endedAt: row.supersededAt,
                        teamNumber: team.teamNumber,
                        peers: team.studentIds
                            .filter((id) => id !== person.id)
                            .map((id) => ({
                                id: names.has(id) ? id : null,
                                name:
                                    names.get(id) ??
                                    'Beste klase bateko ikaslea',
                            })),
                    };
                })
                .sort(
                    (a, b) =>
                        timestamp(b.confirmedAt) - timestamp(a.confirmedAt),
                );
            const preferenceHistory = visibleSubmissions
                .filter(
                    (row) =>
                        row.studentId === person.id &&
                        before(row.submittedAt, context.asOf),
                )
                .map((row) => ({
                    ...row,
                    choices: choices
                        .filter((choice) => choice.submissionId === row.id)
                        .map((choice) => ({
                            kind: choice.kind,
                            targetStudentId: names.has(choice.targetStudentId)
                                ? choice.targetStudentId
                                : null,
                            name:
                                names.get(choice.targetStudentId) ??
                                'Beste klase bateko ikaslea',
                        })),
                }));
            return [
                person.id,
                {
                    person,
                    period,
                    assessment,
                    values,
                    assessmentHistory: history,
                    preference,
                    preferenceHistory,
                    relationships,
                    restrictions,
                    enrollments: enrollmentRows
                        .filter((row) => row.studentId === person.id)
                        .map(({ rosterSnapshot: _private, ...row }) => row),
                    assignments: assignmentHistory,
                    needsReview:
                        !preference ||
                        preference.academicPeriod !== period ||
                        Boolean(
                            context.projectId && preference.scope !== 'project',
                        ),
                },
            ];
        }),
    );
}
export type StudentProfile =
    ReturnType<typeof loadStudentProfiles> extends Promise<
        Map<number, infer Profile>
    >
        ? Profile
        : never;
