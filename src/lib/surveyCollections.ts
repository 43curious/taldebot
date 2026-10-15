import { createHash, randomBytes } from 'node:crypto';
import {
    and,
    eq,
    inArray,
    isNull,
    notExists,
    notInArray,
    or,
} from 'drizzle-orm';
import { z } from 'zod';
import {
    questionnaires,
    questionnaireVersions,
    surveyCollections,
    surveyParticipants,
    surveyResponses,
    collaborationReports,
    classMembers,
    classes,
    classGroups,
    classGroupMembers,
    studentRecords,
    students,
    projects,
    updateRequests,
    users,
} from '../../db/schema';
import {
    requireClass,
    requireProject,
    requireStudent,
    teachingAccess,
    isMaster,
    type TeacherAccess,
} from './access';
import type { AppDatabase } from './db';
import type { DataSession } from './studentIdentity';
import { academicPeriod } from './studentIdentity';
import { InputError, positiveId } from './input';
import {
    questionnaireSchema,
    type Question,
    type QuestionAnswers,
} from './questionnaires';
import { emptyAssessment } from './studentProfiles';
import { consumeRequest, saveKnowledge } from './studentUpdates';
import type { PreferenceKind } from './trackingTypes';
import { isArchivedProject } from './projectLifecycle';

export async function requireQuestionnaire(
    store: DataSession,
    access: TeacherAccess,
    id: number,
) {
    const definition = await store.query.questionnaires.findFirst({
        where: eq(questionnaires.id, id),
    });
    if (!definition)
        throw new InputError('Galdera-sorta ez da existitzen.', 404);
    if (!isMaster(access) && definition.createdBy !== access.actor.id)
        throw new InputError('Ez duzu galdera-sorta honetarako baimenik.', 403);
    return definition;
}
// Once referenced by a launched collection, a version is immutable even before its first answer.
export async function saveQuestionnaire(
    db: AppDatabase,
    access: TeacherAccess,
    data: z.input<typeof questionnaireSchema>,
    id?: number,
) {
    const input = questionnaireSchema.parse(data);
    return db.transaction(async (tx) => {
        const current = await teachingAccess(tx, access.actor);
        const now = new Date().toISOString();
        const definition = id
            ? await requireQuestionnaire(tx, current, id)
            : (
                  await tx
                      .insert(questionnaires)
                      .values({
                          name: input.name,
                          createdBy: current.actor.id,
                          createdAt: now,
                      })
                      .returning()
              )[0];
        const latest = await tx.query.questionnaireVersions.findFirst({
            where: eq(questionnaireVersions.questionnaireId, definition.id),
            orderBy: (row, { desc }) => [desc(row.version)],
        });
        const used =
            latest &&
            (await tx.query.surveyCollections.findFirst({
                where: eq(surveyCollections.versionId, latest.id),
            }));
        await tx
            .update(questionnaires)
            .set({ name: input.name })
            .where(eq(questionnaires.id, definition.id));
        const version =
            latest && !used
                ? (
                      await tx
                          .update(questionnaireVersions)
                          .set({ questions: input.questions })
                          .where(eq(questionnaireVersions.id, latest.id))
                          .returning()
                  )[0]
                : (
                      await tx
                          .insert(questionnaireVersions)
                          .values({
                              questionnaireId: definition.id,
                              version: (latest?.version ?? 0) + 1,
                              questions: input.questions,
                              createdBy: current.actor.id,
                              createdAt: now,
                          })
                          .returning()
                  )[0];
        return {
            questionnaireId: definition.id,
            versionId: version.id,
            version: version.version,
        };
    });
}
export const audienceSchema = z.object({
    classId: positiveId,
    groupIds: z.array(positiveId).max(100).default([]),
    division: z.enum(['sormena', 'digitala']).optional(),
});
export const launchSurveySchema = audienceSchema.extend({
    name: z.string().trim().min(1).max(120),
    versionId: positiveId,
    projectId: positiveId.optional(),
    academicPeriod: z
        .string()
        .regex(/^\d{4}-\d{4}$/)
        .default(academicPeriod()),
});
// Union overlapping module groups by durable identity, then intersect the optional specialty.
export async function currentSurveyAudience(
    store: DataSession,
    access: TeacherAccess,
    data: z.input<typeof audienceSchema>,
) {
    const input = audienceSchema.parse(data);
    requireClass(access, input.classId);
    const parent = await store.query.classes.findFirst({
        where: eq(classes.id, input.classId),
    });
    if (!parent) throw new InputError('Klasea ez da existitzen.', 404);
    const groupIds = [...new Set(input.groupIds)];
    const groups = groupIds.length
        ? await store.query.classGroups.findMany({
              where: inArray(classGroups.id, groupIds),
          })
        : [];
    if (
        groups.length !== groupIds.length ||
        groups.some((group) => group.classId !== parent.id || group.archivedAt)
    )
        throw new InputError(
            'Moduluko taldeak klase honetakoak izan behar dute.',
            403,
        );
    const memberships = groups.length
        ? await store.query.classGroupMembers.findMany({
              where: and(
                  inArray(classGroupMembers.groupId, groupIds),
                  isNull(classGroupMembers.leftAt),
              ),
          })
        : [];
    const rows = await store
        .select({
            id: studentRecords.id,
            name: studentRecords.name,
            needsReview: studentRecords.needsReview,
            division: classMembers.division,
        })
        .from(classMembers)
        .innerJoin(
            studentRecords,
            eq(studentRecords.id, classMembers.studentRecordId),
        )
        .where(eq(classMembers.classId, parent.id));
    const unique = new Map(
        rows
            .filter(
                (row) =>
                    (!input.division || row.division === input.division) &&
                    (!groups.length ||
                        memberships.some(
                            (member) => member.studentId === row.id,
                        )),
            )
            .map((row) => [row.id, row]),
    );
    const people = [...unique.values()];
    for (const person of people) {
        requireStudent(access, person.id);
        if (person.needsReview)
            throw new InputError(
                'Berrikusi audientziako identitateak inkesta ireki aurretik.',
                409,
            );
    }
    return { parent, groups, people };
}
export async function requireSurvey(
    store: DataSession,
    access: TeacherAccess,
    id: number,
) {
    const survey = await store.query.surveyCollections.findFirst({
        where: eq(surveyCollections.id, id),
    });
    if (!survey) throw new InputError('Inkesta ez da existitzen.', 404);
    if (!isMaster(access)) {
        if (survey.classId === null)
            throw new InputError('Klasea ez dago erabilgarri.', 403);
        requireClass(access, survey.classId);
    }
    if (survey.projectId) requireProject(access, survey.projectId);
    const audience = await store.query.surveyParticipants.findMany({
        where: eq(surveyParticipants.surveyId, id),
        orderBy: (row, { asc }) => [asc(row.studentName)],
    });
    for (const person of audience) requireStudent(access, person.studentId);
    const version = await store.query.questionnaireVersions.findFirst({
        where: eq(questionnaireVersions.id, survey.versionId),
    });
    if (!version)
        throw new InputError(
            'Galdera-sortaren bertsioa ez da existitzen.',
            409,
        );
    return { survey, audience, version };
}
async function insertAudience(
    store: DataSession,
    access: TeacherAccess,
    surveyId: number,
    data: Awaited<ReturnType<typeof currentSurveyAudience>>,
    studentIds?: number[],
) {
    const now = new Date().toISOString();
    const existing = await store.query.surveyParticipants.findMany({
        where: eq(surveyParticipants.surveyId, surveyId),
    });
    const people = data.people.filter(
        (person) =>
            !existing.some((row) => row.studentId === person.id) &&
            (!studentIds || studentIds.includes(person.id)),
    );
    if (
        studentIds?.some(
            (id) => !data.people.some((person) => person.id === id),
        )
    )
        throw new InputError(
            'Aukeratu hautatutako audientziako egungo ikasleak.',
            409,
        );
    if (people.length)
        await store.insert(surveyParticipants).values(
            people.map((person) => ({
                surveyId,
                studentId: person.id,
                studentName: person.name,
                addedAt: now,
                addedBy: access.actor.id,
                snapshot: {
                    className: data.parent.name,
                    year: data.parent.year,
                    division: person.division,
                    groupIds: data.groups.map((group) => group.id),
                    groupNames: data.groups.map(
                        (group) => `${group.moduleName} · ${group.name}`,
                    ),
                },
            })),
        );
    return people;
}
export async function launchSurvey(
    db: AppDatabase,
    access: TeacherAccess,
    data: z.input<typeof launchSurveySchema>,
) {
    const input = launchSurveySchema.parse(data);
    return db.transaction(async (tx) => {
        const current = await teachingAccess(tx, access.actor);
        const version = await tx.query.questionnaireVersions.findFirst({
            where: eq(questionnaireVersions.id, input.versionId),
        });
        if (!version) throw new InputError('Aukeratu galdera-sorta.', 404);
        await requireQuestionnaire(tx, current, version.questionnaireId);
        if (
            !input.projectId &&
            version.questions.some((q) => q.key === 'soft_motivation')
        )
            throw new InputError(
                'Motibazioaren galderak proiektu bat behar du. Kendu galdera edo lotu proiektu bat.',
            );
        const audience = await currentSurveyAudience(tx, current, input);
        if (!audience.people.length)
            throw new InputError('Ez dago ikaslerik hautatutako audientzian.');
        const project = input.projectId
            ? await tx.query.projects.findFirst({
                  where: eq(projects.id, input.projectId),
              })
            : undefined;
        if (input.projectId) {
            requireProject(current, input.projectId);
            if (!project || isArchivedProject(project))
                throw new InputError('Proiektua ez dago erabilgarri.', 409);
            const participants = await tx.query.students.findMany({
                where: eq(students.projectId, project.id),
            });
            if (
                audience.people.some(
                    (person) =>
                        !participants.some(
                            (p) =>
                                p.studentRecordId === person.id &&
                                !p.isExcluded,
                        ),
                )
            )
                throw new InputError(
                    'Audientziako ikasle guztiek proiektu horretan parte hartu behar dute.',
                    409,
                );
        }
        const [survey] = await tx
            .insert(surveyCollections)
            .values({
                name: input.name,
                versionId: version.id,
                classId: audience.parent.id,
                className: audience.parent.name,
                collectionYear: audience.parent.year,
                groupIds: audience.groups.map((group) => group.id),
                division: input.division ?? null,
                projectId: project?.id ?? null,
                originProjectId: project?.id ?? null,
                projectName: project?.name ?? null,
                academicPeriod: project?.academicPeriod || input.academicPeriod,
                createdBy: current.actor.id,
                launchedAt: new Date().toISOString(),
            })
            .returning();
        await insertAudience(tx, current, survey.id, audience);
        return survey.id;
    });
}
export async function addSurveyParticipants(
    db: AppDatabase,
    access: TeacherAccess,
    id: number,
    studentIds: number[],
) {
    const ids = z.array(positiveId).min(1).parse(studentIds);
    return db.transaction(async (tx) => {
        const current = await teachingAccess(tx, access.actor);
        const { survey } = await requireSurvey(tx, current, id);
        await requireOpenSurvey(tx, survey);
        if (!survey.classId)
            throw new InputError('Klasea ez dago erabilgarri.', 410);
        const audience = await currentSurveyAudience(tx, current, {
            classId: survey.classId,
            groupIds: survey.groupIds,
            division: survey.division ?? undefined,
        });
        if (survey.projectId) {
            const participants = await tx.query.students.findMany({
                where: eq(students.projectId, survey.projectId),
            });
            if (
                ids.some(
                    (id) =>
                        !participants.some(
                            (row) =>
                                row.studentRecordId === id && !row.isExcluded,
                        ),
                )
            )
                throw new InputError('Ikaslea ez dago proiektuan.', 409);
        }
        return insertAudience(tx, current, id, audience, ids);
    });
}
export async function closeSurvey(
    db: AppDatabase,
    access: TeacherAccess,
    id: number,
) {
    return db.transaction(async (tx) => {
        const { survey } = await requireSurvey(
            tx,
            await teachingAccess(tx, access.actor),
            id,
        );
        if (!survey.closedAt)
            await tx
                .update(surveyCollections)
                .set({ closedAt: new Date().toISOString() })
                .where(eq(surveyCollections.id, id));
    });
}
const tokenHash = (token: string) =>
    createHash('sha256').update(token).digest('hex');
export async function inviteSurvey(
    db: AppDatabase,
    access: TeacherAccess,
    id: number,
    studentId?: number,
) {
    return db.transaction(async (tx) => {
        const current = await teachingAccess(tx, access.actor);
        const { survey, audience, version } = await requireSurvey(
            tx,
            current,
            id,
        );
        await requireOpenSurvey(tx, survey);
        if (studentId && !audience.some((p) => p.studentId === studentId))
            throw new InputError(
                'Ikaslea ez dago inkestaren audientzian.',
                403,
            );
        const answered = await tx.query.surveyResponses.findMany({
            where: eq(surveyResponses.surveyId, id),
        });
        const now = new Date().toISOString(),
            expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
        const result = [];
        for (const person of audience.filter(
            (p) =>
                (!studentId || p.studentId === studentId) &&
                !answered.some((row) => row.studentId === p.studentId),
        )) {
            const token = randomBytes(32).toString('base64url');
            await tx
                .update(updateRequests)
                .set({ revokedAt: now })
                .where(
                    and(
                        eq(updateRequests.surveyId, id),
                        eq(updateRequests.studentId, person.studentId),
                        isNull(updateRequests.consumedAt),
                        isNull(updateRequests.revokedAt),
                    ),
                );
            await tx.insert(updateRequests).values({
                studentId: person.studentId,
                issuedBy: current.actor.id,
                scope: 'survey',
                surveyId: id,
                projectId: survey.projectId,
                classId: survey.classId,
                academicPeriod: survey.academicPeriod,
                assessmentAsked: version.questions.some(
                    (q) => q.type === 'skill',
                ),
                preferencesAsked: version.questions.some(
                    (q) => q.type === 'preference',
                ),
                tokenHash: tokenHash(token),
                createdAt: now,
                expiresAt,
            });
            result.push({
                studentId: person.studentId,
                name: person.studentName,
                token,
                expiresAt,
            });
        }
        return result;
    });
}
export async function surveyRequestContext(store: DataSession, token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new InputError('Esteka pertsonala ez da balioduna.', 401);
    const request = await store.query.updateRequests.findFirst({
        where: eq(updateRequests.tokenHash, tokenHash(token)),
    });
    if (
        !request ||
        request.scope !== 'survey' ||
        !request.surveyId ||
        request.issuedBy === null ||
        request.revokedAt ||
        request.consumedAt ||
        Date.parse(request.expiresAt) <= Date.now()
    )
        throw new InputError(
            'Esteka iraungi, erabili edo baliogabetu da.',
            410,
        );
    const issuer = await store.query.users.findFirst({
        where: eq(users.id, request.issuedBy),
    });
    if (!issuer) throw new InputError('Esteka ez dago erabilgarri.', 410);
    const access = await teachingAccess(store, issuer);
    const context = await requireSurvey(store, access, request.surveyId);
    await requireOpenSurvey(store, context.survey);
    const person = context.audience.find(
        (p) => p.studentId === request.studentId,
    );
    const identity = await store.query.studentRecords.findFirst({
        where: eq(studentRecords.id, request.studentId),
    });
    if (!person || !identity || identity.needsReview)
        throw new InputError('Ikaslea ez dago erabilgarri.', 410);
    return { ...context, request, person };
}
export function validateSurveyAnswers(
    questions: Question[],
    input: unknown,
    self: number,
    peerIds: number[],
): QuestionAnswers {
    const raw = z.record(z.unknown()).parse(input);
    const allowed = new Set(peerIds.filter((id) => id !== self));
    if (Object.keys(raw).some((key) => !questions.some((q) => q.key === key)))
        throw new InputError('Erantzun eskatutako galderei bakarrik.');
    const answers: QuestionAnswers = {},
        choices: number[] = [];
    for (const question of questions) {
        const value = raw[question.key];
        if (question.type === 'skill')
            answers[question.key] = z
                .number()
                .int()
                .min(1)
                .max(10)
                .nullable()
                .parse(value);
        else if (question.type === 'preference') {
            const ids = z
                .array(positiveId)
                .max(question.key === 'comfort' ? 1 : 3)
                .parse(value);
            if (
                ids.some((id) => !allowed.has(id) || choices.includes(id)) ||
                new Set(ids).size !== ids.length
            )
                throw new InputError('Hautatutako kideak ez dira baliodunak.');
            choices.push(...ids);
            answers[question.key] = ids;
        } else {
            const reports = z.record(z.enum(['worked', 'never'])).parse(value);
            if (
                Object.keys(reports).some(
                    (key) =>
                        !/^\d+$/.test(key) ||
                        String(Number(key)) !== key ||
                        !allowed.has(Number(key)),
                )
            )
                throw new InputError('Elkarlaneko kideak ez dira baliodunak.');
            answers[question.key] = reports;
        }
    }
    return answers;
}
export async function submitCollectionSurvey(
    db: AppDatabase,
    token: string,
    input: unknown,
    consent: boolean,
) {
    if (!consent) throw new InputError('Onartu datuen erabilera.');
    return db.transaction(async (tx) => {
        const { survey, audience, version, request, person } =
            await surveyRequestContext(tx, token);
        if (
            await tx.query.surveyResponses.findFirst({
                where: and(
                    eq(surveyResponses.surveyId, survey.id),
                    eq(surveyResponses.studentId, person.studentId),
                ),
            })
        )
            throw new InputError('Inkesta hau dagoeneko erantzun duzu.', 409);
        const answers = validateSurveyAnswers(
            version.questions,
            input,
            person.studentId,
            audience.map((p) => p.studentId),
        );
        await consumeRequest(tx, request.id);
        const now = new Date().toISOString();
        const [response] = await tx
            .insert(surveyResponses)
            .values({
                surveyId: survey.id,
                studentId: person.studentId,
                versionId: version.id,
                requestId: request.id,
                answers,
                submittedAt: now,
            })
            .returning();
        const assessment = emptyAssessment(),
            preferences = {
                comfort: [],
                preferWith: [],
                preferAvoid: [],
            } as Record<PreferenceKind, number[]>;
        const askedKinds: PreferenceKind[] = [];
        for (const q of version.questions) {
            if (q.type === 'skill') {
                const [prefix, key] = q.key.split('_');
                const category = (
                    {
                        narrative: 'skillsNarrative',
                        technical: 'skillsTechnical',
                        management: 'skillsManagement',
                        soft: 'skillsSoft',
                    } as const
                )[prefix as 'narrative' | 'technical' | 'management' | 'soft'];
                const value = answers[q.key];
                if (typeof value === 'number')
                    Object.assign(assessment[category], { [key]: value });
            } else if (q.type === 'preference') {
                askedKinds.push(q.key);
                preferences[q.key] = answers[q.key] as number[];
            }
        }
        const questionnaireVersion = `questionnaire-${version.questionnaireId}/v${version.version}`;
        await saveKnowledge(tx, {
            studentId: person.studentId,
            assessment: version.questions.some((q) => q.type === 'skill')
                ? assessment
                : undefined,
            preferences: askedKinds.length ? preferences : undefined,
            askedKinds,
            questionnaireVersion,
            surveyId: survey.id,
            source: 'survey-collection',
            scope: survey.projectId ? 'project' : 'period',
            academicPeriod: survey.academicPeriod,
            projectId: survey.projectId ?? undefined,
            projectName: [survey.projectName, survey.name]
                .filter(Boolean)
                .join(' · '),
            collectionYear: survey.collectionYear,
            requestId: request.id,
        });
        const collaboration = answers.collaboration;
        if (
            collaboration &&
            typeof collaboration === 'object' &&
            !Array.isArray(collaboration)
        ) {
            const reports = Object.entries(collaboration).map(
                ([peerId, answer]) => ({
                    respondentId: person.studentId,
                    peerId: Number(peerId),
                    answer,
                    responseId: response.id,
                    surveyId: survey.id,
                    surveyName: survey.name,
                    projectId: survey.projectId,
                    academicPeriod: survey.academicPeriod,
                    questionnaireVersion,
                    submittedAt: now,
                }),
            );
            if (reports.length)
                await tx.insert(collaborationReports).values(reports);
        }
        return response.id;
    });
}

export async function requireOpenSurvey(
    store: DataSession,
    survey: typeof surveyCollections.$inferSelect,
) {
    if (
        survey.closedAt ||
        (survey.originProjectId !== null && survey.projectId === null)
    )
        throw new InputError('Inkesta ez dago irekita.', 410);
    if (survey.projectId) {
        const project = await store.query.projects.findFirst({
            where: eq(projects.id, survey.projectId),
        });
        if (!project || isArchivedProject(project))
            throw new InputError('Proiektua artxibatuta dago.', 410);
    }
}

export function surveyVisibility(store: DataSession, access: TeacherAccess) {
    return isMaster(access)
        ? undefined
        : and(
              inArray(surveyCollections.classId, [...access.classIds]),
              or(
                  isNull(surveyCollections.projectId),
                  inArray(surveyCollections.projectId, [...access.projectIds]),
              ),
              notExists(
                  store
                      .select({ id: surveyParticipants.id })
                      .from(surveyParticipants)
                      .where(
                          and(
                              eq(
                                  surveyParticipants.surveyId,
                                  surveyCollections.id,
                              ),
                              notInArray(surveyParticipants.studentId, [
                                  ...access.studentIds,
                              ]),
                          ),
                      ),
              ),
          );
}
