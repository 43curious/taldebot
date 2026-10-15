import { beforeEach, afterEach, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { testDatabase } from './testDatabase';
import { teachingAccess, requireStudent, requireProject } from '../access';
import {
    resolveStudent,
    enrollStudent,
    enrollExistingStudent,
    moveStudent,
    endEnrollment,
    updateStudentIdentity,
} from '../studentIdentity';
import { createProject } from '../projectOperations';
import { projectSchema } from '../input';
import { loadStudentProfiles, emptyAssessment } from '../studentProfiles';
import {
    saveKnowledge,
    issueUpdateRequest,
    requestContext,
    completeIndependentUpdate,
} from '../studentUpdates';
import {
    generateDraft,
    createManualDraft,
    confirmDraft,
    adjustDraft,
    confirmedPairHistory,
} from '../formation';
import { migrateDatabase } from '../../../scripts/migrations';
import { updateStudentLocation } from '../studentLocations';
import { setProjectCollectionContext } from '../../../scripts/project-context';
import { knowledgeSourceLabel } from '../knowledgeContext';
let fixture: Awaited<ReturnType<typeof testDatabase>>;
beforeEach(async () => {
    fixture = await testDatabase();
});
afterEach(async () => {
    await fixture.close();
});
async function setup() {
    const { db } = fixture;
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
    const groups = await db
        .insert(schema.classes)
        .values([
            { name: 'First', year: 1, degreeId: degree.id },
            { name: 'Second', year: 2, degreeId: degree.id },
        ])
        .returning();
    await db.insert(schema.teacherResponsibilities).values([
        { userId: teacher.id, classId: groups[0].id },
        { userId: other.id, classId: groups[1].id },
    ]);
    const access = await teachingAccess(db, master);
    const people = [];
    for (const name of ['Ane', 'Iker', 'Leire', 'Miren']) {
        const person = await resolveStudent(
            db,
            { name, email: `${name.toLowerCase()}@example.com` },
            access,
        );
        await enrollStudent(db, person, groups[0].id, '2026-2027');
        people.push(person);
    }
    const project = await createProject(
        db,
        projectSchema.parse({
            name: 'Film',
            numTeams: '2',
            projectType: 'balanced',
            adminEmail: 'master@example.com',
            studentsJson: JSON.stringify(
                people.map((person) => ({
                    name: person.name,
                    studentRecordId: person.id,
                })),
            ),
        }),
        access,
    );
    return {
        db,
        master,
        teacher,
        other,
        degree,
        groups,
        access,
        people,
        project,
    };
}
it('keeps identity and email aliases across class moves while current responsibility controls access', async () => {
    const s = await setup();
    let access = await teachingAccess(s.db, s.teacher);
    expect(access.classIds.has(s.groups[1].id)).toBe(false);
    expect(access.degreeIds.has(s.degree.id)).toBe(true);
    requireStudent(access, s.people[0].id);
    await updateStudentIdentity(
        s.db,
        s.people[0].id,
        'Ane Updated',
        'updated@example.com',
    );
    expect(
        (
            await resolveStudent(
                s.db,
                { name: 'Ane', email: 'ane@example.com' },
                s.access,
            )
        ).id,
    ).toBe(s.people[0].id);
    const member = await s.db.query.classMembers.findFirst({
        where: eq(schema.classMembers.studentRecordId, s.people[0].id),
    });
    await moveStudent(s.db, s.access, member!.id, s.groups[1].id, '2026-2027');
    access = await teachingAccess(s.db, s.teacher);
    expect(() => requireStudent(access, s.people[0].id)).toThrow();
    expect(() => requireProject(access, s.project.id)).toThrow();
    requireStudent(await teachingAccess(s.db, s.other), s.people[0].id);
    const profile = (
        await loadStudentProfiles(s.db, s.access, [s.people[0].id])
    ).get(s.people[0].id)!;
    expect(profile.enrollments).toHaveLength(2);
    expect(
        profile.enrollments.find((row) => row.classId === s.groups[0].id)!
            .endedAt,
    ).not.toBeNull();
    expect(profile.enrollments[0]).not.toHaveProperty('rosterSnapshot');
});
it('separates period preferences from local choices, retains unknown skills, and supports explicit clearing', async () => {
    const s = await setup(),
        id = s.people[0].id,
        peer = s.people[1].id;
    const assessment = emptyAssessment();
    assessment.skillsTechnical.camera = 8;
    assessment.skillsSoft.motivation = 9;
    await saveKnowledge(s.db, {
        studentId: id,
        assessment,
        preferences: { comfort: [peer], preferWith: [], preferAvoid: [] },
        source: 'independent-update',
        scope: 'period',
        academicPeriod: '2026-2027',
    });
    await saveKnowledge(s.db, {
        studentId: id,
        preferences: { comfort: [], preferWith: [], preferAvoid: [peer] },
        source: 'project-survey',
        scope: 'project',
        projectId: s.project.id,
        projectName: 'Film',
        academicPeriod: '2026-2027',
    });
    let profile = (
        await loadStudentProfiles(s.db, s.access, [id], {
            academicPeriod: '2026-2027',
        })
    ).get(id)!;
    expect(profile.values.skillsTechnical).toEqual({ camera: 8 });
    expect(profile.values.skillsSoft.motivation).toBeUndefined();
    expect(profile.relationships[0].kind).toBe('comfort');
    profile = (
        await loadStudentProfiles(s.db, s.access, [id], {
            projectId: s.project.id,
            academicPeriod: '2026-2027',
        })
    ).get(id)!;
    expect(profile.relationships[0].kind).toBe('preferAvoid');
    await saveKnowledge(s.db, {
        studentId: id,
        preferences: { comfort: [], preferWith: [], preferAvoid: [] },
        source: 'independent-update',
        scope: 'period',
        academicPeriod: '2026-2027',
    });
    profile = (
        await loadStudentProfiles(s.db, s.access, [id], {
            academicPeriod: '2026-2027',
        })
    ).get(id)!;
    expect(profile.relationships).toHaveLength(0);
    expect(profile.preferenceHistory).toHaveLength(3);
    expect(profile.values.skillsTechnical.camera).toBe(8);
    expect(
        (
            await loadStudentProfiles(s.db, s.access, [id], {
                academicPeriod: '2027-2028',
            })
        ).get(id)!.preference,
    ).toBeUndefined();
});
it('shows dated historical relationships from the current roster without making them current formation inputs', async () => {
    const s = await setup();
    const [author, peer] = s.people;
    await saveKnowledge(s.db, {
        studentId: author.id,
        assessment: { ...emptyAssessment(), skillsTechnical: { camera: 8 } },
        preferences: { comfort: [peer.id], preferWith: [], preferAvoid: [] },
        source: 'legacy-survey',
        scope: 'project',
        projectId: s.project.id,
        projectName: s.project.name,
        academicPeriod: '2025-2026',
    });
    await setProjectCollectionContext(s.db, {
        projectIds: [s.project.id],
        academicPeriod: '2025-2026',
        collectionYear: 1,
    });
    await s.db
        .update(schema.preferenceSubmissions)
        .set({ submittedAt: '2026-02-20 11:30:59' });
    const enrollments = await s.db.query.enrollments.findMany();
    const ids = s.people.map((p) => p.id);
    const context = {
        academicPeriod: '2026-2027',
        relationshipView: 'latest-recorded' as const,
    };
    const profiles = await loadStudentProfiles(s.db, s.access, ids, context);
    const profile = profiles.get(author.id)!;
    expect(profile.relationships).toMatchObject([
        {
            source: author.id,
            target: peer.id,
            kind: 'comfort',
            scope: 'project',
            sourceLabel: 'Film · 2025-2026 · 1. mailan jasoa',
            submittedAt: '2026-02-20 11:30:59',
            incoming: false,
        },
    ]);
    expect(profiles.get(peer.id)!.relationships[0].incoming).toBe(true);
    expect(profile.preference).toBeUndefined();
    expect(profile.needsReview).toBe(true);
    expect(profile.values.skillsTechnical.camera).toBe(8);
    expect(
        (
            await loadStudentProfiles(s.db, s.access, ids, {
                academicPeriod: '2026-2027',
            })
        ).get(author.id)!.relationships,
    ).toEqual([]);
    expect(
        (
            await loadStudentProfiles(s.db, s.access, ids, {
                ...context,
                asOf: '2026-02-19',
            })
        ).get(author.id)!.relationships,
    ).toEqual([]);
    expect(await s.db.query.enrollments.findMany()).toEqual(enrollments);
    // A newer explicitly empty answer is evidence, rather than a reason to reuse old choices.
    await saveKnowledge(s.db, {
        studentId: author.id,
        preferences: { comfort: [], preferWith: [], preferAvoid: [] },
        source: 'independent-update',
        scope: 'period',
        academicPeriod: '2026-2027',
    });
    expect(
        (await loadStudentProfiles(s.db, s.access, ids, context)).get(
            author.id,
        )!.relationships,
    ).toEqual([]);
    expect(
        (
            await loadStudentProfiles(s.db, s.access, ids, {
                projectId: s.project.id,
            })
        ).get(author.id)!.relationships[0].kind,
    ).toBe('comfort');
});
it('uses single-use personal requests, revokes older links, scopes requested sections, and invalidates transferred access', async () => {
    const s = await setup();
    const access = await teachingAccess(s.db, s.teacher);
    const input = {
        studentId: s.people[0].id,
        assessmentAsked: false,
        preferencesAsked: true,
        academicPeriod: '2026-2027',
    };
    const first = await issueUpdateRequest(s.db, access, input),
        second = await issueUpdateRequest(s.db, access, input);
    await expect(requestContext(s.db, first.token)).rejects.toThrow();
    await expect(
        completeIndependentUpdate(s.db, second.token, {
            assessment: emptyAssessment(),
            preferences: { comfort: [], preferWith: [], preferAvoid: [] },
        }),
    ).rejects.toThrow();
    await completeIndependentUpdate(s.db, second.token, {
        preferences: {
            comfort: [s.people[1].id],
            preferWith: [],
            preferAvoid: [],
        },
    });
    await expect(
        completeIndependentUpdate(s.db, second.token, {
            preferences: { comfort: [], preferWith: [], preferAvoid: [] },
        }),
    ).rejects.toThrow();
    expect(await s.db.query.assessments.findMany()).toHaveLength(0);
    const pending = await issueUpdateRequest(s.db, access, input);
    const member = await s.db.query.classMembers.findFirst({
        where: eq(schema.classMembers.studentRecordId, input.studentId),
    });
    await moveStudent(s.db, s.access, member!.id, s.groups[1].id, '2026-2027');
    await expect(requestContext(s.db, pending.token)).rejects.toThrow();
    const stored = await s.db.query.updateRequests.findFirst();
    expect(stored!.tokenHash).not.toBe(first.token);
});
it('keeps drafts out of history, confirms immutable inputs, and counts pairs once per project across revisions', async () => {
    const s = await setup();
    const draft = await generateDraft(s.db, s.access, s.project.id, 'v2', {
        historyMode: 'familiar',
    });
    expect(
        await confirmedPairHistory(
            s.db,
            s.people.map((p) => p.id),
        ),
    ).toEqual([]);
    const adopted = await confirmDraft(s.db, s.access, s.project.id, draft.id);
    expect(
        (await confirmDraft(s.db, s.access, s.project.id, draft.id)).id,
    ).toBe(adopted.id);
    const values = emptyAssessment();
    values.skillsTechnical.camera = 10;
    await saveKnowledge(s.db, {
        studentId: s.people[0].id,
        assessment: values,
        source: 'independent-update',
        scope: 'period',
        academicPeriod: '2026-2027',
    });
    expect(
        (await s.db.query.confirmedAssignments.findFirst())!.inputSnapshot!
            .inputs[0].assessment.skillsTechnical.camera,
    ).toBeUndefined();
    const allocation = draft.allocation.map((team) => ({
        ...team,
        studentIds: [...team.studentIds],
    }));
    const temp = allocation[0].studentIds[0];
    allocation[0].studentIds[0] = allocation[1].studentIds[0];
    allocation[1].studentIds[0] = temp;
    const changed = await adjustDraft(
        s.db,
        s.access,
        s.project.id,
        draft.id,
        allocation,
    );
    expect(
        (await confirmDraft(s.db, s.access, s.project.id, changed.id)).revision,
    ).toBe(2);
    const restored = await adjustDraft(
        s.db,
        s.access,
        s.project.id,
        changed.id,
        draft.allocation,
    );
    await confirmDraft(s.db, s.access, s.project.id, restored.id);
    expect(
        (
            await confirmedPairHistory(
                s.db,
                s.people.map((p) => p.id),
            )
        ).every((pair) => pair.projects === 1),
    ).toBe(true);
    expect(
        await confirmedPairHistory(
            s.db,
            s.people.map((p) => p.id),
            s.project.id,
        ),
    ).toEqual([]);
    expect(adopted.inputSnapshot?.historyMode).toBe('familiar');
});
it('enforces overdue mandatory restrictions during generation, edits and confirmation without overwriting a valid draft', async () => {
    const s = await setup();
    const draft = await generateDraft(s.db, s.access, s.project.id, 'v2');
    const pair = draft.allocation[0].studentIds;
    await s.db.insert(schema.pairingRestrictions).values({
        student1Id: pair[0],
        student2Id: pair[1],
        createdBy: s.master.id,
        scope: 'period',
        academicPeriod: '2026-2027',
        reason: 'private',
        createdAt: new Date().toISOString(),
        reviewAt: '2000-01-01',
    });
    await expect(
        confirmDraft(s.db, s.access, s.project.id, draft.id),
    ).rejects.toThrow('murrizketa');
    await expect(
        adjustDraft(s.db, s.access, s.project.id, draft.id, draft.allocation),
    ).rejects.toThrow('murrizketa');
    const valid = await generateDraft(s.db, s.access, s.project.id, 'v2');
    expect(
        valid.allocation.some((team) =>
            pair.every((id) => team.studentIds.includes(id)),
        ),
    ).toBe(false);
    await expect(
        generateDraft(s.db, s.access, s.project.id, 'v2', { numTeams: 1 }),
    ).rejects.toThrow();
    expect((await s.db.query.teams.findFirst())!.draftId).toBe(valid.id);
    const profile = (
        await loadStudentProfiles(
            s.db,
            await teachingAccess(s.db, s.teacher),
            [pair[0]],
            { academicPeriod: '2026-2027' },
        )
    ).get(pair[0])!;
    expect(profile.restrictions[0].reason).toBeNull();
});
it('preserves legacy source data and ambiguity, remaps only within a project, and creates no confirmed history', async () => {
    const { db, client } = fixture;
    await client.execute("INSERT INTO classes(name,year) VALUES ('First',1)");
    await client.execute(
        "INSERT INTO class_members(class_id,name,email) VALUES (1,'Alex A','shared@example.com'),(1,'Alex B','shared@example.com')",
    );
    await client.execute(
        "INSERT INTO projects(name,project_type) VALUES ('Legacy','balanced'),('Other','balanced')",
    );
    await client.execute(
        "INSERT INTO students(project_id,name,email) VALUES (1,'Alex A','shared@example.com'),(1,'Peer','peer@example.com'),(2,'Other','other@example.com')",
    );
    await client.execute(
        "INSERT INTO responses(student_id,project_id,skills_narrative,skills_technical,skills_management,skills_soft,comfort,prefer_with,prefer_avoid,completed_at) VALUES (1,1,'{\"creativity\":9}','{\"camera\":null}','{}','{}','[2,3]','[]','[]',NULL)",
    );
    await client.execute(
        "INSERT INTO teams(project_id,team_number,member_ids,justification) VALUES (1,1,'[1,2]','legacy')",
    );
    const before = (await client.execute('SELECT * FROM responses')).rows;
    await migrateDatabase(client);
    await migrateDatabase(client);
    expect((await client.execute('SELECT * FROM responses')).rows).toEqual(
        before,
    );
    expect(await db.query.confirmedAssignments.findMany()).toHaveLength(0);
    expect((await db.query.teamDrafts.findFirst())!.inputSnapshot).toBeNull();
    expect((await db.query.identityReviews.findMany()).length).toBeGreaterThan(
        0,
    );
    const record = (await db.query.assessments.findFirst())!;
    expect(record.submittedAt).toBeNull();
    expect(record.data.skillsTechnical.camera).toBeUndefined();
    const pref = (await db.query.preferenceSubmissions.findFirst())!;
    expect(pref.complete).toBe(false);
    expect(pref.unresolvedTargets).toContain(3);
    expect(await db.query.preferenceChoices.findMany()).toHaveLength(1);
    expect(await db.query.assessments.findMany()).toHaveLength(1);
});
it('restores dated context before withdrawal and rolls back a failed independent update without consuming the token', async () => {
    const s = await setup(),
        id = s.people[0].id;
    await s.db.insert(schema.assessments).values({
        studentId: id,
        data: { ...emptyAssessment(), skillsTechnical: { camera: 7 } },
        source: 'independent-update',
        academicPeriod: '2025-2026',
        submittedAt: '2026-01-01T10:00:00Z',
        withdrawnAt: '2026-02-01T10:00:00Z',
    });
    let profile = (
        await loadStudentProfiles(s.db, s.access, [id], { asOf: '2026-01-15' })
    ).get(id)!;
    expect(profile.values.skillsTechnical.camera).toBe(7);
    profile = (
        await loadStudentProfiles(s.db, s.access, [id], { asOf: '2026-02-15' })
    ).get(id)!;
    expect(profile.values.skillsTechnical.camera).toBeUndefined();
    expect(profile.assessmentHistory).toHaveLength(1);
    const link = await issueUpdateRequest(s.db, s.access, {
        studentId: id,
        assessmentAsked: true,
        preferencesAsked: false,
    });
    await fixture.client.execute(
        "CREATE TRIGGER fail_knowledge BEFORE INSERT ON assessments BEGIN SELECT RAISE(ABORT,'fail'); END",
    );
    await expect(
        completeIndependentUpdate(s.db, link.token, {
            assessment: emptyAssessment(),
        }),
    ).rejects.toThrow();
    expect(
        (await requestContext(s.db, link.token)).request.consumedAt,
    ).toBeNull();
});
it('reuses explicit identities in new projects, keeps same-name people separate, and preserves records through archival', async () => {
    const s = await setup();
    const twin = await resolveStudent(
        s.db,
        { name: 'Ane', email: 'different@example.com' },
        s.access,
    );
    expect(twin.id).not.toBe(s.people[0].id);
    await expect(
        resolveStudent(s.db, { name: 'Ane' }, s.access),
    ).rejects.toThrow('Izen bera');
    const other = await createProject(
        s.db,
        projectSchema.parse({
            name: 'Sound',
            numTeams: '2',
            projectType: 'technical',
            adminEmail: 'master@example.com',
            studentsJson: JSON.stringify(
                s.people.map((person) => ({
                    name: person.name,
                    studentRecordId: person.id,
                })),
            ),
        }),
        s.access,
    );
    const first = await generateDraft(s.db, s.access, s.project.id, 'v2');
    await confirmDraft(s.db, s.access, s.project.id, first.id);
    await s.db
        .update(schema.students)
        .set({ isExcluded: true })
        .where(
            eq(
                schema.students.id,
                first.inputSnapshot!.inputs[0].participantId,
            ),
        );
    const second = await generateDraft(s.db, s.access, other.id, 'v2');
    expect(second.allocation.flatMap((team) => team.studentIds)).toHaveLength(
        4,
    );
    expect(second.inputSnapshot?.history.length).toBeGreaterThan(0);
    await s.db
        .update(schema.projects)
        .set({ archivedAt: new Date().toISOString(), status: 'archived' })
        .where(eq(schema.projects.id, s.project.id));
    expect(
        (await loadStudentProfiles(s.db, s.access, [s.people[0].id])).get(
            s.people[0].id,
        )!.assignments,
    ).toHaveLength(1);
    await expect(
        generateDraft(s.db, s.access, s.project.id, 'v2'),
    ).rejects.toThrow();
    expect(
        (
            await s.db.query.students.findMany({
                where: eq(schema.students.projectId, other.id),
            })
        ).every((row) => !row.isExcluded),
    ).toBe(true);
});
it('ports surname-first surveys to current students without moving their enrollment back to the collection year', async () => {
    const { db, client } = fixture;
    await client.execute("INSERT INTO classes(name,year) VALUES ('Second',2)");
    await client.execute(
        "INSERT INTO class_members(class_id,name,email) VALUES (1,'Ane García Lasa',NULL),(1,'Iker Lopez Goikoetxea',NULL)",
    );
    await client.execute(
        "INSERT INTO projects(name,project_type,academic_period,collection_year) VALUES ('Film Language A','balanced','2025-2026',1)",
    );
    await client.execute(
        "INSERT INTO students(project_id,name,email) VALUES (1,'GARCIA LASA, ANE','ane@example.com'),(1,'LÓPEZ GOIKOETXEA, IKER','iker@example.com')",
    );
    await client.execute(
        "INSERT INTO responses(student_id,project_id,skills_narrative,skills_technical,skills_management,skills_soft,comfort,prefer_with,prefer_avoid,completed_at) VALUES (1,1,'{}','{\"camera\":8}','{}','{\"motivation\":9}','[2]','[]','[]','2026-02-20 11:30:59')",
    );
    await migrateDatabase(client);
    const participant = await db.query.students.findFirst({
        where: eq(schema.students.id, 1),
    });
    const roster = await db.query.classMembers.findFirst({
        where: eq(schema.classMembers.id, 1),
    });
    expect(participant!.studentRecordId).toBe(roster!.studentRecordId);
    const assessment = await db.query.assessments.findFirst();
    expect(assessment!.studentId).toBe(roster!.studentRecordId);
    expect(assessment!.submittedAt).toBe('2026-02-20 11:30:59');
    expect(assessment!.academicPeriod).toBe('2025-2026');
    expect(assessment!.collectionYear).toBe(1);
    expect(knowledgeSourceLabel(assessment!)).toBe(
        'Film Language A · 2025-2026 · 1. mailan jasoa',
    );
    expect(
        (await db.query.preferenceSubmissions.findFirst())!.collectionYear,
    ).toBe(1);
    expect((await db.query.enrollments.findFirst())!.year).toBe(2);
    expect(
        (await db.query.preferenceChoices.findFirst())!.targetStudentId,
    ).toBe(
        (await db.query.classMembers.findFirst({
            where: eq(schema.classMembers.id, 2),
        }))!.studentRecordId,
    );
});

it('corrects collection context atomically without rewriting survey values, dates or current enrollments', async () => {
    const s = await setup();
    await saveKnowledge(s.db, {
        studentId: s.people[0].id,
        assessment: { ...emptyAssessment(), skillsTechnical: { camera: 8 } },
        preferences: {
            comfort: [s.people[1].id],
            preferWith: [],
            preferAvoid: [],
        },
        source: 'legacy-survey',
        scope: 'project',
        academicPeriod: 'legacy',
        projectId: s.project.id,
        projectName: s.project.name,
    });
    const before = (await s.db.query.assessments.findFirst())!;
    const enrollmentsBefore = await s.db.query.enrollments.findMany();
    await expect(
        setProjectCollectionContext(s.db, {
            projectIds: [s.project.id, 9999],
            academicPeriod: '2025-2026',
            collectionYear: 1,
        }),
    ).rejects.toThrow();
    expect((await s.db.query.assessments.findFirst())!.academicPeriod).toBe(
        'legacy',
    );
    await setProjectCollectionContext(s.db, {
        projectIds: [s.project.id],
        academicPeriod: '2025-2026',
        collectionYear: 1,
    });
    const after = (await s.db.query.assessments.findFirst())!;
    expect(after.data).toEqual(before.data);
    expect(after.submittedAt).toBe(before.submittedAt);
    expect(after.academicPeriod).toBe('2025-2026');
    const profile = (
        await loadStudentProfiles(s.db, s.access, [s.people[0].id], {
            projectId: s.project.id,
        })
    ).get(s.people[0].id)!;
    expect(profile.period).toBe('2025-2026');
    expect(profile.preference?.academicPeriod).toBe('2025-2026');
    expect(after.collectionYear).toBe(1);
    expect(
        (await s.db.query.preferenceSubmissions.findFirst())!.collectionYear,
    ).toBe(1);
    expect(await s.db.query.enrollments.findMany()).toEqual(enrollmentsBefore);
});
it('keeps canonical full-name collisions across classes ambiguous during migration', async () => {
    const { db, client } = fixture;
    await client.execute(
        "INSERT INTO classes(name,year) VALUES ('First',1),('Second',2)",
    );
    await client.execute(
        "INSERT INTO class_members(class_id,name,email) VALUES (1,'Ane García','first@example.com'),(2,'Ane Garcia','second@example.com')",
    );
    await client.execute(
        "INSERT INTO projects(name,project_type) VALUES ('Film Language','balanced')",
    );
    await client.execute(
        "INSERT INTO students(project_id,name) VALUES (1,'GARCIA, ANE')",
    );
    await migrateDatabase(client);
    const participant = (await db.query.students.findFirst())!;
    const members = await db.query.classMembers.findMany();
    expect(
        members.some(
            (row) => row.studentRecordId === participant.studentRecordId,
        ),
    ).toBe(false);
    const review = (await db.query.identityReviews.findFirst())!;
    expect(review.candidates).toHaveLength(2);
});

it('forms random teams without responses, respects attendance and hard restrictions, and preserves inputs after later answers', async () => {
    const s = await setup();
    const ids = s.people.map((person) => person.id);
    await s.db
        .update(schema.students)
        .set({ isExcluded: true })
        .where(eq(schema.students.studentRecordId, ids[3]));
    await s.db.insert(schema.pairingRestrictions).values({
        student1Id: ids[0],
        student2Id: ids[1],
        scope: 'project',
        projectId: s.project.id,
        academicPeriod: '2026-2027',
        createdBy: s.master.id,
        createdAt: new Date().toISOString(),
        reviewAt: '2027-01-01',
    });
    const draft = await generateDraft(s.db, s.access, s.project.id, 'v2', {
        method: 'random',
        numTeams: 2,
    });
    expect(draft.inputSnapshot!.method).toBe('random');
    expect(draft.allocation.flatMap((team) => team.studentIds).sort()).toEqual(
        ids.slice(0, 3).sort(),
    );
    expect(
        draft.allocation.map((team) => team.studentIds.length).sort(),
    ).toEqual([1, 2]);
    expect(
        draft.allocation.some((team) =>
            ids.slice(0, 2).every((id) => team.studentIds.includes(id)),
        ),
    ).toBe(false);
    expect(await confirmedPairHistory(s.db, ids)).toEqual([]);
    const confirmed = await confirmDraft(
        s.db,
        s.access,
        s.project.id,
        draft.id,
    );
    const assessment = emptyAssessment();
    assessment.skillsTechnical.camera = 10;
    await saveKnowledge(s.db, {
        studentId: ids[0],
        assessment,
        source: 'project-survey',
        scope: 'project',
        projectId: s.project.id,
        projectName: 'Film',
        academicPeriod: '2026-2027',
    });
    const retained = await s.db.query.confirmedAssignments.findFirst({
        where: eq(schema.confirmedAssignments.id, confirmed.id),
    });
    expect(retained!.allocation).toEqual(draft.allocation);
    expect(
        retained!.inputSnapshot!.inputs[0].assessment.skillsTechnical.camera,
    ).toBeUndefined();
    expect((await confirmedPairHistory(s.db, ids))[0].projects).toBe(1);
    await expect(
        generateDraft(s.db, s.access, s.project.id, 'v2', {
            method: 'random',
            numTeams: 1,
        }),
    ).rejects.toThrow('murrizketak');
});
it('starts manual formation without a generated draft and validates membership, capacities and mandatory rules', async () => {
    const s = await setup();
    const ids = s.people.map((person) => person.id);
    const allocation = [
        { teamNumber: 1, studentIds: ids.slice(0, 2), justification: '' },
        { teamNumber: 2, studentIds: ids.slice(2), justification: '' },
    ];
    await expect(
        createManualDraft(s.db, s.access, s.project.id, 'v2', 2, [
            { ...allocation[0], studentIds: ids },
        ]),
    ).rejects.toThrow('Osatu');
    await expect(
        createManualDraft(s.db, s.access, s.project.id, 'v2', 2, [
            { ...allocation[0], studentIds: [ids[0], ids[0]] },
            allocation[1],
        ]),
    ).rejects.toThrow('behin');
    const draft = await createManualDraft(
        s.db,
        s.access,
        s.project.id,
        'v2',
        2,
        allocation,
    );
    expect(draft.inputSnapshot!.method).toBe('manual');
    const first = await confirmDraft(s.db, s.access, s.project.id, draft.id);
    // Identical members formed by another method still retain that teacher decision.
    const next = await generateDraft(s.db, s.access, s.project.id, 'v2', {
        method: 'random',
    });
    const restored = await adjustDraft(
        s.db,
        s.access,
        s.project.id,
        next.id,
        allocation,
    );
    const second = await confirmDraft(
        s.db,
        s.access,
        s.project.id,
        restored.id,
    );
    expect(second.revision).toBe(first.revision + 1);
    expect(second.inputSnapshot!.method).toBe('random');
    expect(
        (await confirmedPairHistory(s.db, ids)).every(
            (pair) => pair.projects === 1,
        ),
    ).toBe(true);
    await expect(
        adjustDraft(s.db, s.access, s.project.id, draft.id, allocation),
    ).rejects.toThrow('aldatu');
});
it('deduplicates durable roster identities across simultaneous enrollments when creating an activity', async () => {
    const s = await setup();
    await enrollStudent(s.db, s.people[0], s.groups[1].id, '2026-2027');
    await expect(
        createProject(
            s.db,
            projectSchema.parse({
                name: 'Repeated names',
                numTeams: 2,
                projectType: 'balanced',
                adminEmail: 'teacher@example.com',
                studentList: 'Ane\nAne',
            }),
            s.access,
        ),
    ).rejects.toThrow('emailaren bidez');
    const project = await createProject(
        s.db,
        projectSchema.parse({
            name: 'Shared roster',
            numTeams: 2,
            projectType: 'balanced',
            adminEmail: 'teacher@example.com',
            studentsJson: JSON.stringify(
                [s.people[0], s.people[0], s.people[1]].map((person) => ({
                    name: person.name,
                    studentRecordId: person.id,
                })),
            ),
        }),
        s.access,
    );
    expect(
        await s.db.query.students.findMany({
            where: eq(schema.students.projectId, project.id),
        }),
    ).toHaveLength(2);
    const draft = await generateDraft(s.db, s.access, project.id, 'v2', {
        method: 'random',
    });
    expect(draft.allocation.flatMap((team) => team.studentIds)).toHaveLength(2);
    const other = await teachingAccess(s.db, s.other);
    await expect(
        createManualDraft(s.db, other, s.project.id, 'v2', 2, [
            {
                teamNumber: 1,
                studentIds: s.people.map((person) => person.id),
                justification: '',
            },
        ]),
    ).rejects.toThrow();
});

it('forms town-based teams from shared verified locations and retains original locations through edits and confirmation', async () => {
    const s = await setup(),
        ids = s.people.map((person) => person.id);
    for (let i = 0; i < ids.length; i++)
        await updateStudentLocation(
            s.db,
            s.access,
            ids[i],
            i < 2 ? 'Bilbao' : 'Donostia',
        );
    await enrollStudent(s.db, s.people[0], s.groups[1].id, '2026-2027');
    const draft = await generateDraft(s.db, s.access, s.project.id, 'v2', {
        method: 'location',
    });
    expect(draft.inputSnapshot!.locationPolicy).toBe('same-term-time-town-v1');
    expect(
        draft.allocation.every((team) => {
            const towns = team.studentIds.map(
                (id) =>
                    draft.inputSnapshot!.inputs.find(
                        (input) => input.studentId === id,
                    )!.location!.town,
            );
            return new Set(towns).size === 1;
        }),
    ).toBe(true);
    await updateStudentLocation(s.db, s.access, ids[0], 'Eibar');
    const adjusted = await adjustDraft(
        s.db,
        s.access,
        s.project.id,
        draft.id,
        draft.allocation,
    );
    const confirmed = await confirmDraft(
        s.db,
        s.access,
        s.project.id,
        adjusted.id,
    );
    expect(
        confirmed.inputSnapshot!.inputs.find(
            (input) => input.studentId === ids[0],
        )!.location!.town,
    ).toBe('Bilbao');
    const profile = (await loadStudentProfiles(s.db, s.access, [ids[0]])).get(
        ids[0],
    )!;
    expect(profile.person.termTimeTown).toBe('Eibar');
    expect(profile.enrollments.filter((row) => !row.endedAt)).toHaveLength(2);
    await updateStudentLocation(s.db, s.access, ids[0], '');
    expect(
        (await s.db.query.studentRecords.findFirst({
            where: eq(schema.studentRecords.id, ids[0]),
        }))!.termTimeTown,
    ).toBeNull();
    const otherAccess = await teachingAccess(s.db, s.other);
    await expect(
        updateStudentLocation(s.db, otherAccess, ids[1], 'Eibar'),
    ).rejects.toThrow();
    await expect(
        updateStudentLocation(s.db, s.access, ids[1], 'x'.repeat(121)),
    ).rejects.toThrow();
    expect(
        (await confirmedPairHistory(s.db, ids)).every(
            (pair) => pair.projects === 1,
        ),
    ).toBe(true);
});
it('keeps hard separations above town grouping and treats roster suggestions as unknown', async () => {
    const s = await setup(),
        ids = s.people.map((person) => person.id);
    await updateStudentLocation(s.db, s.access, ids[0], 'Bilbao');
    await updateStudentLocation(s.db, s.access, ids[1], 'bilbao');
    await s.db
        .update(schema.studentRecords)
        .set({ termTimeTown: 'Bilbao', termTimeTownSource: 'roster' })
        .where(eq(schema.studentRecords.id, ids[2]));
    await s.db.insert(schema.pairingRestrictions).values({
        student1Id: ids[0],
        student2Id: ids[1],
        scope: 'project',
        projectId: s.project.id,
        academicPeriod: '2026-2027',
        createdBy: s.master.id,
        createdAt: new Date().toISOString(),
        reviewAt: '2027-01-01',
    });
    const draft = await generateDraft(s.db, s.access, s.project.id, 'v2', {
        method: 'location',
    });
    expect(draft.allocation.every((team) => team.studentIds.length === 2)).toBe(
        true,
    );
    expect(
        draft.allocation.some(
            (team) =>
                team.studentIds.includes(ids[0]) &&
                team.studentIds.includes(ids[1]),
        ),
    ).toBe(false);
    expect(draft.inputSnapshot!.inputs[2].location).toMatchObject({
        town: 'Bilbao',
        source: 'roster',
        updatedAt: null,
    });
    await expect(
        generateDraft(s.db, s.access, s.project.id, 'v2', {
            method: 'location',
            numTeams: 1,
        }),
    ).rejects.toThrow('murrizketak');
});

it('adds an explicit concurrent enrollment without ending the first and rejects revoked destination access', async () => {
    const s = await setup();
    const first = await s.db.query.classMembers.findFirst({
        where: eq(schema.classMembers.studentRecordId, s.people[0].id),
    });
    await enrollExistingStudent(
        s.db,
        s.access,
        s.people[0].id,
        s.groups[1].id,
        '2026-2027',
    );
    await enrollExistingStudent(
        s.db,
        s.access,
        s.people[0].id,
        s.groups[1].id,
        '2026-2027',
    );
    expect(
        await s.db.query.classMembers.findMany({
            where: eq(schema.classMembers.studentRecordId, s.people[0].id),
        }),
    ).toHaveLength(2);
    expect(
        (
            await s.db.query.enrollments.findMany({
                where: eq(schema.enrollments.studentId, s.people[0].id),
            })
        ).every((row) => row.endedAt === null),
    ).toBe(true);
    const access = await teachingAccess(s.db, s.teacher);
    await expect(
        enrollExistingStudent(
            s.db,
            access,
            s.people[1].id,
            s.groups[1].id,
            '2026-2027',
        ),
    ).rejects.toThrow();
    await endEnrollment(s.db, first!.id, s.groups[0].id);
    expect(
        (
            await s.db.query.classMembers.findMany({
                where: eq(schema.classMembers.studentRecordId, s.people[0].id),
            })
        ).map((row) => row.classId),
    ).toEqual([s.groups[1].id]);
});

it('validates project invitations without loading unused historical profiles, retaining all authorization checks', async () => {
    const s = await setup();
    const participant = await s.db.query.students.findFirst({
        where: eq(schema.students.studentRecordId, s.people[0].id),
    });
    const link = await issueUpdateRequest(s.db, s.access, {
        studentId: s.people[0].id,
        projectId: s.project.id,
        participantId: participant!.id,
        assessmentAsked: true,
        preferencesAsked: true,
    });
    fixture.clearQueryCount();
    const context = await requestContext(s.db, link.token, {
        includePreferences: false,
    });
    expect(context.request.studentId).toBe(s.people[0].id);
    expect(context.peers).toHaveLength(4);
    expect(fixture.queryCount()).toBeLessThanOrEqual(7);
    await s.db
        .update(schema.updateRequests)
        .set({ revokedAt: new Date().toISOString() })
        .where(eq(schema.updateRequests.id, link.requestId));
    await expect(
        requestContext(s.db, link.token, { includePreferences: false }),
    ).rejects.toThrow();
});
