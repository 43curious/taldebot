import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
    enrollments,
    projects,
    studentRecords,
    students,
    surveyResponses,
} from '../../db/schema';
import {
    currentTeacher,
    requireProject,
    requireStudent,
    canReadStudent,
    type TeacherAccess,
} from './access';
import { InputError, submissionSchema } from './input';
import { isArchivedProject } from './projectLifecycle';
import { standardQuestions, type QuestionAnswers } from './questionnaires';
import { submitSurvey } from './projectOperations';
import {
    submitCollectionSurvey,
    teacherCollectionContext,
    validateSurveyAnswers,
} from './surveyCollections';
import { saveKnowledge } from './studentUpdates';
import { emptyAssessment, loadStudentProfiles } from './studentProfiles';
import type { Preferences } from './studentUpdates';
import type { AppDatabase } from './db';
import type { DataSession } from './studentIdentity';
import type { TeacherSurveyTarget } from './teacherSurveyTarget';

// Opening an entry form creates no invitations and changes no completion state.
export async function teacherSurveyContext(
    store: DataSession,
    access: TeacherAccess,
    target: TeacherSurveyTarget,
    options: { includePreferences?: boolean } = {},
) {
    if (target.kind === 'survey') {
        const context = await teacherCollectionContext(
            store,
            access,
            target.surveyId,
            target.studentId,
        );
        if (
            await store.query.surveyResponses.findFirst({
                where: and(
                    eq(surveyResponses.surveyId, target.surveyId),
                    eq(surveyResponses.studentId, target.studentId),
                ),
            })
        )
            throw new InputError('Inkesta hau dagoeneko erantzunda dago.', 409);
        return {
            title: context.survey.name,
            studentId: context.person.studentId,
            studentName: context.person.studentName,
            questions: context.version.questions,
            peers: context.audience.map((p) => ({
                id: p.studentId,
                name: p.studentName,
            })),
            description: `${context.survey.className} · ${context.survey.academicPeriod} · v${context.version.version}`,
            entry: context.entry,
            email: undefined,
            initialPreferences: undefined,
        };
    }
    const actor = await currentTeacher(store, access.actor);
    if (target.kind === 'project') {
        requireProject(actor.access, target.projectId);
        const project = await store.query.projects.findFirst({
            where: eq(projects.id, target.projectId),
        });
        const participants = await store.query.students.findMany({
            where: eq(students.projectId, target.projectId),
        });
        const person = participants.find((p) => p.id === target.participantId);
        if (
            !project ||
            isArchivedProject(project) ||
            !person ||
            person.hasCompleted ||
            person.isExcluded ||
            !person.studentRecordId
        )
            throw new InputError(
                'Proiektuko inkesta ez dago erabilgarri.',
                409,
            );
        requireStudent(actor.access, person.studentRecordId);
        const identity = await store.query.studentRecords.findFirst({
            where: eq(studentRecords.id, person.studentRecordId),
        });
        if (!identity || identity.needsReview)
            throw new InputError(
                'Ikaslearen identitatea berrikusi behar da.',
                409,
            );
        return {
            title: project.name,
            studentId: person.id,
            studentName: person.name,
            questions: standardQuestions().filter(
                (q) => q.type !== 'collaboration',
            ),
            peers: participants
                .filter((p) => !p.isExcluded && p.studentRecordId !== null)
                .map((p) => ({ id: p.id, name: p.name })),
            description: project.academicPeriod || '',
            entry: actor.entry,
            email: person.email || identity.email || '',
            initialPreferences: undefined,
        };
    }
    requireStudent(actor.access, target.studentId);
    const person = await store.query.studentRecords.findFirst({
        where: eq(studentRecords.id, target.studentId),
    });
    if (!person || person.needsReview)
        throw new InputError('Ikaslearen identitatea berrikusi behar da.', 409);
    const active = await store.query.enrollments.findMany({
        where: and(
            eq(enrollments.studentId, person.id),
            isNull(enrollments.endedAt),
        ),
    });
    const cohort = await store.query.enrollments.findMany({
        where: and(
            inArray(
                enrollments.classId,
                active.flatMap((row) =>
                    row.classId === null ? [] : [row.classId],
                ),
            ),
            isNull(enrollments.endedAt),
        ),
    });
    const ids = [...new Set(cohort.map((row) => row.studentId))].filter((id) =>
        canReadStudent(actor.access, id),
    );
    const peers = await store.query.studentRecords.findMany({
        columns: { id: true, name: true },
        where: inArray(studentRecords.id, ids),
    });
    const questions = standardQuestions().filter((q) =>
        q.type === 'skill'
            ? target.assessmentAsked && q.key !== 'soft_motivation'
            : q.type === 'preference' && target.preferencesAsked,
    );
    const initialPreferences: Preferences = {
        comfort: [],
        preferWith: [],
        preferAvoid: [],
    };
    if (target.preferencesAsked && options.includePreferences !== false) {
        const profile = (
            await loadStudentProfiles(store, actor.access, [person.id], {
                academicPeriod: target.academicPeriod,
            })
        ).get(person.id);
        const allowed = new Set(peers.map((peer) => peer.id));
        for (const link of profile?.relationships ?? [])
            if (
                !link.incoming &&
                link.kind !== 'restriction' &&
                allowed.has(link.target)
            )
                initialPreferences[link.kind].push(link.target);
    }
    return {
        title: 'Ikaslearen jarraipena',
        studentId: person.id,
        studentName: person.name,
        questions,
        peers,
        description: target.academicPeriod,
        entry: actor.entry,
        email: undefined,
        initialPreferences,
    };
}

export async function submitTeacherSurvey(
    db: AppDatabase,
    access: TeacherAccess,
    target: TeacherSurveyTarget,
    input: unknown,
    acknowledged: boolean,
    email?: string,
) {
    if (!acknowledged)
        throw new InputError(
            'Berretsi erantzunak ikaslearen partez sartzen ari zarela.',
        );
    if (target.kind === 'survey')
        return submitCollectionSurvey(
            db,
            { access, surveyId: target.surveyId, studentId: target.studentId },
            input,
            true,
        );
    if (target.kind === 'project') {
        const context = await teacherSurveyContext(db, access, target);
        const answers = validateSurveyAnswers(
            context.questions,
            input,
            context.studentId,
            context.peers.map((p) => p.id),
        );
        const data = submissionSchema.parse({
            ...answers,
            projectId: target.projectId,
            studentId: target.participantId,
            email,
            comfort: JSON.stringify(answers.comfort),
            preferWith: JSON.stringify(answers.preferWith),
            preferAvoid: JSON.stringify(answers.preferAvoid),
        });
        return submitSurvey(db, data, undefined, access);
    }
    return db.transaction(async (tx) => {
        const context = await teacherSurveyContext(tx, access, target, {
            includePreferences: false,
        });
        const answers: QuestionAnswers = validateSurveyAnswers(
            context.questions,
            input,
            target.studentId,
            context.peers.map((p) => p.id),
        );
        const assessment = emptyAssessment();
        const preferences = {
            comfort: [] as number[],
            preferWith: [] as number[],
            preferAvoid: [] as number[],
        };
        for (const question of context.questions) {
            if (question.type === 'skill') {
                const [prefix, key] = question.key.split('_');
                const category = (
                    {
                        narrative: 'skillsNarrative',
                        technical: 'skillsTechnical',
                        management: 'skillsManagement',
                        soft: 'skillsSoft',
                    } as const
                )[prefix as 'narrative' | 'technical' | 'management' | 'soft'];
                if (typeof answers[question.key] === 'number')
                    Object.assign(assessment[category], {
                        [key]: answers[question.key],
                    });
            } else if (question.type === 'preference')
                preferences[question.key] = answers[question.key] as number[];
        }
        await saveKnowledge(tx, {
            studentId: target.studentId,
            assessment: target.assessmentAsked ? assessment : undefined,
            preferences: target.preferencesAsked ? preferences : undefined,
            source: 'independent-update',
            scope: 'period',
            academicPeriod: target.academicPeriod,
            entryProvenance: context.entry,
        });
    });
}
