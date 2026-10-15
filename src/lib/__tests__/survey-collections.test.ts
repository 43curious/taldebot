import { beforeEach, afterEach, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { testDatabase } from './testDatabase';
import { teachingAccess } from '../access';
import { resolveStudent, enrollStudent } from '../studentIdentity';
import { saveClassGroup } from '../classGroups';
import { standardQuestions } from '../questionnaires';
import {
    saveQuestionnaire,
    launchSurvey,
    requireSurvey,
    inviteSurvey,
    surveyRequestContext,
    submitCollectionSurvey,
    addSurveyParticipants,
    closeSurvey,
} from '../surveyCollections';
import { loadStudentProfiles } from '../studentProfiles';
import { saveKnowledge, issueUpdateRequest } from '../studentUpdates';
import {
    archiveProject,
    restoreProject,
    deleteProject,
} from '../projectLifecycle';

let f: Awaited<ReturnType<typeof testDatabase>>;
beforeEach(async () => {
    f = await testDatabase();
});
afterEach(async () => {
    await f.close();
});
async function setup() {
    const { db } = f;
    const [master, teacher, other] = await db
        .insert(schema.users)
        .values([
            { username: 'master', hashedPassword: 'unused', role: 'master' },
            { username: 'teacher', hashedPassword: 'unused', role: 'admin' },
            { username: 'other', hashedPassword: 'unused', role: 'admin' },
        ])
        .returning();
    const [degree] = await db
        .insert(schema.degrees)
        .values({ name: 'Media' })
        .returning();
    const classes = await db
        .insert(schema.classes)
        .values([
            { name: 'First', year: 1, degreeId: degree.id },
            { name: 'Second', year: 2, degreeId: degree.id },
        ])
        .returning();
    await db
        .insert(schema.teacherResponsibilities)
        .values({ userId: teacher.id, classId: classes[0].id });
    const access = await teachingAccess(db, master),
        people = [];
    for (const name of ['Ane', 'Iker', 'Leire']) {
        const person = await resolveStudent(
            db,
            { name, email: `${name}@example.com` },
            access,
        );
        await enrollStudent(db, person, classes[0].id, '2026-2027');
        people.push(person);
    }
    const questions = standardQuestions().filter((q) =>
        ['narrative_writing', 'comfort', 'collaboration'].includes(q.key),
    );
    const definition = await saveQuestionnaire(
        db,
        await teachingAccess(db, teacher),
        { name: 'Writing and peers', questions },
    );
    return {
        db,
        master,
        teacher,
        other,
        access,
        people,
        classes,
        questions,
        definition,
    };
}
it('edits unused drafts, freezes launched versions and deduplicates overlapping current groups across simultaneous enrollments', async () => {
    const s = await setup();
    const draft = await saveQuestionnaire(
        s.db,
        await teachingAccess(s.db, s.teacher),
        { name: 'Edited', questions: [...s.questions].reverse() },
        s.definition.questionnaireId,
    );
    expect(draft.versionId).toBe(s.definition.versionId);
    const first = await saveClassGroup(s.db, s.access, {
        classId: s.classes[0].id,
        name: 'A',
        moduleName: 'Film',
        studentIds: s.people.slice(0, 2).map((p) => p.id),
    });
    const second = await saveClassGroup(s.db, s.access, {
        classId: s.classes[0].id,
        name: 'B',
        moduleName: 'Film',
        studentIds: s.people.slice(1).map((p) => p.id),
    });
    await enrollStudent(s.db, s.people[0], s.classes[1].id, '2026-2027');
    const id = await launchSurvey(s.db, await teachingAccess(s.db, s.teacher), {
        name: 'First collection',
        classId: s.classes[0].id,
        groupIds: [first, second, first],
        versionId: draft.versionId,
    });
    const context = await requireSurvey(s.db, s.access, id);
    expect(context.audience).toHaveLength(3);
    expect(context.audience.map((p) => p.snapshot.className)).toEqual([
        'First',
        'First',
        'First',
    ]);
    expect(
        (
            await s.db.query.enrollments.findMany({
                where: eq(schema.enrollments.studentId, s.people[0].id),
            })
        ).filter((e) => !e.endedAt),
    ).toHaveLength(2);
    const next = await saveQuestionnaire(
        s.db,
        await teachingAccess(s.db, s.teacher),
        { name: 'Next', questions: s.questions.slice(0, 1) },
        draft.questionnaireId,
    );
    expect(next.version).toBe(2);
    expect((await requireSurvey(s.db, s.access, id)).version.questions).toEqual(
        [...s.questions].reverse(),
    );
    await saveClassGroup(
        s.db,
        s.access,
        {
            classId: s.classes[0].id,
            name: 'A',
            moduleName: 'Film',
            studentIds: [],
        },
        first,
    );
    expect((await requireSurvey(s.db, s.access, id)).audience).toHaveLength(3);
});
it('validates against the invitation/version, consumes once, and keeps explicit never separate from silence and assignments', async () => {
    const s = await setup();
    const id = await launchSurvey(s.db, s.access, {
        name: 'Survey',
        classId: s.classes[0].id,
        versionId: s.definition.versionId,
    });
    const [link] = await inviteSurvey(s.db, s.access, id, s.people[0].id);
    const answers = {
        narrative_writing: 8,
        comfort: [s.people[1].id],
        collaboration: { [s.people[1].id]: 'never' },
    };
    for (const patch of [
        { narrative_writing: 11 },
        { narrative_writing: 4.5 },
        { comfort: [s.people[0].id] },
        { comfort: [999] },
        { collaboration: { [s.people[0].id]: 'worked' } },
        { soft_teamwork: 8 },
    ]) {
        await expect(
            submitCollectionSurvey(
                s.db,
                link.token,
                { ...answers, ...patch },
                true,
            ),
        ).rejects.toThrow();
    }
    await expect(
        submitCollectionSurvey(s.db, link.token, answers, false),
    ).rejects.toThrow();
    expect(await s.db.query.surveyResponses.findMany()).toHaveLength(0);
    await submitCollectionSurvey(s.db, link.token, answers, true);
    await expect(
        submitCollectionSurvey(s.db, link.token, answers, true),
    ).rejects.toThrow();
    const reports = await s.db.query.collaborationReports.findMany();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
        respondentId: s.people[0].id,
        peerId: s.people[1].id,
        answer: 'never',
        surveyId: id,
        questionnaireVersion: 'questionnaire-1/v1',
    });
    expect(await s.db.query.confirmedAssignments.findMany()).toHaveLength(0);
    const profile = (
        await loadStudentProfiles(s.db, s.access, [s.people[0].id], {
            surveyId: id,
        })
    ).get(s.people[0].id)!;
    expect(profile.values.skillsNarrative.writing).toBe(8);
    expect(profile.values.skillsTechnical.camera).toBeUndefined();
    expect(profile.collaborations[0].answer).toBe('never');
});
it('isolates collection completion and reissued links, explicitly records additions and rejects requests after access revocation or closing', async () => {
    const s = await setup(),
        access = await teachingAccess(s.db, s.teacher);
    const id = await launchSurvey(s.db, access, {
        name: 'A',
        classId: s.classes[0].id,
        versionId: s.definition.versionId,
    });
    const second = await launchSurvey(s.db, access, {
        name: 'B',
        classId: s.classes[0].id,
        versionId: s.definition.versionId,
    });
    const [a] = await inviteSurvey(s.db, access, id, s.people[0].id),
        [b] = await inviteSurvey(s.db, access, second, s.people[0].id);
    const [replacement] = await inviteSurvey(s.db, access, id, s.people[0].id);
    await expect(surveyRequestContext(s.db, a.token)).rejects.toThrow();
    expect((await surveyRequestContext(s.db, b.token)).survey.id).toBe(second);
    const person = await resolveStudent(s.db, { name: 'New' }, s.access);
    await enrollStudent(s.db, person, s.classes[0].id, '2026-2027');
    expect((await requireSurvey(s.db, s.access, id)).audience).toHaveLength(3);
    await addSurveyParticipants(s.db, access, id, [person.id, person.id]);
    const audience = (await requireSurvey(s.db, s.access, id)).audience;
    expect(audience).toHaveLength(4);
    expect(audience.find((p) => p.studentId === person.id)?.addedBy).toBe(
        s.teacher.id,
    );
    await s.db
        .delete(schema.teacherResponsibilities)
        .where(eq(schema.teacherResponsibilities.userId, s.teacher.id));
    await expect(
        surveyRequestContext(s.db, replacement.token),
    ).rejects.toThrow();
    await expect(
        requireSurvey(s.db, await teachingAccess(s.db, s.other), id),
    ).rejects.toThrow();
    await closeSurvey(s.db, s.access, second);
    await expect(surveyRequestContext(s.db, b.token)).rejects.toThrow();
});
it('preserves unasked preference kinds and applies explicit empty answers only to the asked kind and scope', async () => {
    const s = await setup(),
        studentId = s.people[0].id,
        peer = s.people[1].id;
    await saveKnowledge(s.db, {
        studentId,
        source: 'independent-update',
        scope: 'period',
        academicPeriod: '2026-2027',
        preferences: { comfort: [peer], preferWith: [], preferAvoid: [] },
    });
    const q = await saveQuestionnaire(s.db, s.access, {
        name: 'Only avoidance',
        questions: standardQuestions().filter((q) => q.key === 'preferAvoid'),
    });
    const id = await launchSurvey(s.db, s.access, {
        name: 'Avoidance',
        classId: s.classes[0].id,
        versionId: q.versionId,
        academicPeriod: '2026-2027',
    });
    const [link] = await inviteSurvey(s.db, s.access, id, studentId);
    await submitCollectionSurvey(s.db, link.token, { preferAvoid: [] }, true);
    const profile = (
        await loadStudentProfiles(s.db, s.access, [studentId], {
            academicPeriod: '2026-2027',
        })
    ).get(studentId)!;
    expect(profile.relationships.filter((r) => !r.incoming)).toMatchObject([
        { kind: 'comfort', target: peer },
    ]);
    const scoped = (
        await loadStudentProfiles(s.db, s.access, [studentId], { surveyId: id })
    ).get(studentId)!;
    expect(scoped.relationships).toHaveLength(0);
    expect(scoped.preferenceCoverage.comfort).toBeNull();
    expect(scoped.preferenceCoverage.preferAvoid).not.toBeNull();
});

it('keeps collection links separate from legacy invitations, revokes them on project archival, and retains answers after project deletion', async () => {
    const s = await setup();
    const [project] = await s.db
        .insert(schema.projects)
        .values({ name: 'Activity', projectType: 'balanced', status: 'active' })
        .returning();
    const participants = await s.db
        .insert(schema.students)
        .values(
            s.people.map((person) => ({
                projectId: project.id,
                studentRecordId: person.id,
                name: person.name,
            })),
        )
        .returning();
    const id = await launchSurvey(s.db, s.access, {
        name: 'Activity questionnaire',
        classId: s.classes[0].id,
        versionId: s.definition.versionId,
        projectId: project.id,
    });
    const links = await inviteSurvey(s.db, s.access, id);
    await issueUpdateRequest(s.db, s.access, {
        studentId: s.people[0].id,
        projectId: project.id,
        participantId: participants[0].id,
        assessmentAsked: true,
        preferencesAsked: true,
    });
    await expect(
        surveyRequestContext(s.db, links[0].token),
    ).resolves.toBeDefined();
    await submitCollectionSurvey(
        s.db,
        links[0].token,
        {
            narrative_writing: 7,
            comfort: [],
            collaboration: { [s.people[1].id]: 'never' },
        },
        true,
    );
    await archiveProject(s.db, s.access, project.id);
    await restoreProject(s.db, s.access, project.id);
    await expect(surveyRequestContext(s.db, links[1].token)).rejects.toThrow();
    const [fresh] = await inviteSurvey(s.db, s.access, id, s.people[1].id);
    await deleteProject(s.db, s.access, project.id);
    await expect(surveyRequestContext(s.db, fresh.token)).rejects.toThrow();
    const retained = await requireSurvey(s.db, s.access, id);
    expect(retained.survey.projectId).toBeNull();
    expect(retained.survey.originProjectId).toBe(project.id);
    expect(await s.db.query.surveyResponses.findMany()).toHaveLength(1);
    expect(await s.db.query.collaborationReports.findMany()).toHaveLength(1);
    expect(
        (await f.client.execute('PRAGMA foreign_key_check')).rows,
    ).toHaveLength(0);
});
