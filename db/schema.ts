import type {
    AssessmentValues,
    Allocation,
    FormationSnapshot,
    HistoryMode,
    PreferenceKind,
    ClassGroupAudience,
} from '../src/lib/trackingTypes';
import type { Skills } from '../src/lib/skills';
import {
    sqliteTable,
    text,
    integer,
    unique,
    index,
    uniqueIndex,
    check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const degrees = sqliteTable('degrees', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const classes = sqliteTable(
    'classes',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        name: text('name').notNull(),
        year: integer('year').notNull(),
        capacity: integer('capacity').notNull().default(50),
        createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
        degreeId: integer('degree_id').references(() => degrees.id, {
            onDelete: 'cascade',
        }),
    },
    (table) => [
        unique('classes_degree_name_unique').on(table.degreeId, table.name),
    ],
);

export const studentRecords = sqliteTable('student_records', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    email: text('email'),
    termTimeTown: text('term_time_town'),
    termTimeTownSource: text('term_time_town_source')
        .$type<'unknown' | 'roster' | 'teacher'>()
        .notNull()
        .default('unknown'),
    termTimeTownUpdatedAt: text('term_time_town_updated_at'),
    createdBy: integer('created_by').references(() => users.id, {
        onDelete: 'set null',
    }),
    needsReview: integer('needs_review', { mode: 'boolean' })
        .notNull()
        .default(false),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const studentEmails = sqliteTable(
    'student_emails',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        studentId: integer('student_id')
            .notNull()
            .references(() => studentRecords.id, { onDelete: 'restrict' }),
        email: text('email').notNull(),
        source: text('source').notNull(),
        createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => [
        unique('student_email_alias_unique').on(table.studentId, table.email),
        index('student_email_lookup').on(table.email),
    ],
);

export const classMembers = sqliteTable('class_members', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    studentRecordId: integer('student_record_id').references(
        () => studentRecords.id,
        { onDelete: 'restrict' },
    ),
    notesAuthorId: integer('notes_author_id').references(() => users.id, {
        onDelete: 'set null',
    }),
    classId: integer('class_id')
        .notNull()
        .references(() => classes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email'),
    division: text('division').$type<'sormena' | 'digitala'>(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    nationalId: text('national_id'),
    tutor: text('tutor'),
    town: text('town'),
    academicStatus: text('academic_status'),
    erasmus: text('erasmus'),
    dual: text('dual'),
    notes: text('notes'),
});

export const projects = sqliteTable('projects', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    audienceSnapshot: text('audience_snapshot', {
        mode: 'json',
    }).$type<ClassGroupAudience>(),
    numTeams: integer('num_teams'),
    targetTeamSize: integer('target_team_size'),
    projectType: text('project_type')
        .$type<'narrative' | 'technical' | 'management' | 'balanced'>()
        .notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    status: text('status')
        .$type<'setup' | 'active' | 'completed' | 'archived'>()
        .default('setup'),
    ownerId: integer('owner_id').references(() => users.id, {
        onDelete: 'set null',
    }),
    academicPeriod: text('academic_period'),
    collectionYear: integer('collection_year'),
    historyMode: text('history_mode')
        .$type<HistoryMode>()
        .notNull()
        .default('balanced'),
    archivedAt: text('archived_at'),
    statusBeforeArchive: text('status_before_archive').$type<
        'setup' | 'active' | 'completed'
    >(),
    adminEmail: text('admin_email'),
    accessCode: text('access_code').unique(),
});

export const classGroups = sqliteTable(
    'class_groups',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        classId: integer('class_id').references(() => classes.id, {
            onDelete: 'set null',
        }),
        className: text('class_name').notNull(),
        name: text('name').notNull(),
        moduleName: text('module_name').notNull(),
        sourceAssignmentId: integer('source_assignment_id').references(
            () => confirmedAssignments.id,
            { onDelete: 'restrict' },
        ),
        createdBy: integer('created_by')
            .notNull()
            .references(() => users.id, { onDelete: 'restrict' }),
        createdAt: text('created_at').notNull(),
        archivedAt: text('archived_at'),
    },
    (table) => [
        uniqueIndex('active_class_group_name')
            .on(table.classId, table.moduleName, table.name)
            .where(sql`${table.archivedAt} IS NULL`),
    ],
);

export const classGroupMembers = sqliteTable(
    'class_group_members',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        groupId: integer('group_id')
            .notNull()
            .references(() => classGroups.id, { onDelete: 'restrict' }),
        studentId: integer('student_id')
            .notNull()
            .references(() => studentRecords.id, { onDelete: 'restrict' }),
        joinedAt: text('joined_at').notNull(),
        leftAt: text('left_at'),
        addedBy: integer('added_by')
            .notNull()
            .references(() => users.id, { onDelete: 'restrict' }),
        source: text('source')
            .$type<'manual' | 'confirmed-assignment'>()
            .notNull(),
    },
    (table) => [
        uniqueIndex('active_group_membership')
            .on(table.groupId, table.studentId)
            .where(sql`${table.leftAt} IS NULL`),
    ],
);

// Minimal provenance for retained student history after the working project is deleted.
export const deletedProjectSources = sqliteTable('deleted_project_sources', {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    audienceSnapshot: text('audience_snapshot', {
        mode: 'json',
    }).$type<ClassGroupAudience>(),
    projectType: text('project_type').notNull(),
    academicPeriod: text('academic_period'),
    collectionYear: integer('collection_year'),
    createdAt: text('created_at'),
    deletedAt: text('deleted_at').notNull(),
    deletedBy: integer('deleted_by')
        .notNull()
        .references(() => users.id, { onDelete: 'restrict' }),
    retainedRecords: text('retained_records', { mode: 'json' })
        .$type<{
            assessmentIds: number[];
            preferenceSubmissionIds: number[];
            requestIds: number[];
            restrictionIds: number[];
            draftIds: number[];
            assignmentIds: number[];
            reviewIds: number[];
        }>()
        .notNull(),
});

// The legacy SQL name stores project participants, not persistent student identity.
export const students = sqliteTable('students', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    studentRecordId: integer('student_record_id').references(
        () => studentRecords.id,
        { onDelete: 'restrict' },
    ),
    projectId: integer('project_id').references(() => projects.id, {
        onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    email: text('email'),
    hasCompleted: integer('has_completed', { mode: 'boolean' }).default(false),
    isExcluded: integer('is_excluded', { mode: 'boolean' }).default(false),
});

export const responses = sqliteTable('responses', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    studentId: integer('student_id').references(() => students.id, {
        onDelete: 'cascade',
    }),
    projectId: integer('project_id').references(() => projects.id, {
        onDelete: 'cascade',
    }),
    skillsNarrative: text('skills_narrative', { mode: 'json' })
        .$type<Skills['skillsNarrative']>()
        .notNull(),
    skillsTechnical: text('skills_technical', { mode: 'json' })
        .$type<Skills['skillsTechnical']>()
        .notNull(),
    skillsManagement: text('skills_management', { mode: 'json' })
        .$type<Skills['skillsManagement']>()
        .notNull(),
    skillsSoft: text('skills_soft', { mode: 'json' })
        .$type<Skills['skillsSoft']>()
        .notNull(),
    preferWith: text('prefer_with', { mode: 'json' })
        .$type<number[]>()
        .notNull(),
    preferAvoid: text('prefer_avoid', { mode: 'json' })
        .$type<number[]>()
        .notNull(),
    comfort: text('comfort', { mode: 'json' }).$type<number[]>().notNull(),
    completedAt: text('completed_at').default(sql`CURRENT_TIMESTAMP`),
});

export const teams = sqliteTable('teams', {
    draftId: integer('draft_id').references(() => teamDrafts.id, {
        onDelete: 'set null',
    }),
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, {
        onDelete: 'cascade',
    }),
    teamNumber: integer('team_number').notNull(),
    memberIds: text('member_ids', { mode: 'json' }).$type<number[]>().notNull(),
    justification: text('justification').notNull(),
    algorithmVersion: text('algorithm_version').default('v2'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const teamHistory = sqliteTable('team_history', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, {
        onDelete: 'cascade',
    }),
    student1Id: integer('student1_id').notNull(),
    student2Id: integer('student2_id').notNull(),
});

export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull().unique(),
    hashedPassword: text('hashed_password').notNull(),
    role: text('role').$type<'master' | 'admin'>().notNull().default('admin'),
    fullName: text('full_name'),
    email: text('email'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const enrollments = sqliteTable(
    'enrollments',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        studentId: integer('student_id')
            .notNull()
            .references(() => studentRecords.id, { onDelete: 'restrict' }),
        classId: integer('class_id').references(() => classes.id, {
            onDelete: 'set null',
        }),
        className: text('class_name').notNull(),
        degreeName: text('degree_name'),
        year: integer('year').notNull(),
        academicPeriod: text('academic_period').notNull(),
        startedAt: text('started_at'),
        endedAt: text('ended_at'),
        source: text('source').notNull(),
        rosterSnapshot: text('roster_snapshot', { mode: 'json' }).$type<
            Record<string, unknown>
        >(),
    },
    (table) => [
        index('enrollment_student_current').on(table.studentId, table.endedAt),
        index('enrollment_class_current').on(table.classId, table.endedAt),
    ],
);

export const teacherResponsibilities = sqliteTable(
    'teacher_responsibilities',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        degreeId: integer('degree_id').references(() => degrees.id, {
            onDelete: 'cascade',
        }),
        classId: integer('class_id').references(() => classes.id, {
            onDelete: 'cascade',
        }),
    },
    (table) => [
        unique('teacher_degree_unique').on(table.userId, table.degreeId),
        unique('teacher_class_unique').on(table.userId, table.classId),
        check(
            'one_responsibility_scope',
            sql`(${table.degreeId} IS NULL) <> (${table.classId} IS NULL)`,
        ),
    ],
);

export const updateRequests = sqliteTable('update_requests', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    studentId: integer('student_id')
        .notNull()
        .references(() => studentRecords.id, { onDelete: 'restrict' }),
    issuedBy: integer('issued_by').references(() => users.id, {
        onDelete: 'set null',
    }),
    projectId: integer('project_id').references(() => projects.id, {
        onDelete: 'set null',
    }),
    participantId: integer('participant_id').references(() => students.id, {
        onDelete: 'set null',
    }),
    classId: integer('class_id').references(() => classes.id, {
        onDelete: 'set null',
    }),
    scope: text('scope').$type<'project' | 'period'>().notNull(),
    academicPeriod: text('academic_period').notNull(),
    assessmentAsked: integer('assessment_asked', { mode: 'boolean' }).notNull(),
    preferencesAsked: integer('preferences_asked', {
        mode: 'boolean',
    }).notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    consumedAt: text('consumed_at'),
    revokedAt: text('revoked_at'),
});

export const assessments = sqliteTable(
    'assessments',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        studentId: integer('student_id')
            .notNull()
            .references(() => studentRecords.id, { onDelete: 'restrict' }),
        data: text('data', { mode: 'json' })
            .$type<AssessmentValues>()
            .notNull(),
        questionnaireVersion: text('questionnaire_version')
            .notNull()
            .default('skills-v1'),
        source: text('source')
            .$type<
                | 'legacy-survey'
                | 'project-survey'
                | 'independent-update'
                | 'demo'
            >()
            .notNull(),
        projectId: integer('project_id').references(() => projects.id, {
            onDelete: 'set null',
        }),
        projectName: text('project_name'),
        academicPeriod: text('academic_period').notNull(),
        collectionYear: integer('collection_year'),
        requestId: integer('request_id').references(() => updateRequests.id, {
            onDelete: 'set null',
        }),
        legacyResponseId: integer('legacy_response_id').unique(),
        legacyParticipantId: integer('legacy_participant_id'),
        rawLegacyData: text('raw_legacy_data', { mode: 'json' }).$type<
            Record<string, unknown>
        >(),
        submittedAt: text('submitted_at'),
        withdrawnAt: text('withdrawn_at'),
    },
    (table) => [
        index('assessment_student_date').on(table.studentId, table.submittedAt),
    ],
);

export const preferenceSubmissions = sqliteTable(
    'preference_submissions',
    {
        complete: integer('complete', { mode: 'boolean' })
            .notNull()
            .default(true),
        id: integer('id').primaryKey({ autoIncrement: true }),
        studentId: integer('student_id')
            .notNull()
            .references(() => studentRecords.id, { onDelete: 'restrict' }),
        scope: text('scope').$type<'project' | 'period'>().notNull(),
        academicPeriod: text('academic_period').notNull(),
        collectionYear: integer('collection_year'),
        projectId: integer('project_id').references(() => projects.id, {
            onDelete: 'set null',
        }),
        projectName: text('project_name'),
        source: text('source')
            .$type<
                | 'legacy-survey'
                | 'project-survey'
                | 'independent-update'
                | 'demo'
            >()
            .notNull(),
        requestId: integer('request_id').references(() => updateRequests.id, {
            onDelete: 'set null',
        }),
        legacyResponseId: integer('legacy_response_id').unique(),
        legacyParticipantId: integer('legacy_participant_id'),
        rawLegacyData: text('raw_legacy_data', { mode: 'json' }).$type<
            Record<string, unknown>
        >(),
        unresolvedTargets: text('unresolved_targets', { mode: 'json' })
            .$type<number[]>()
            .notNull()
            .default([]),
        submittedAt: text('submitted_at'),
        withdrawnAt: text('withdrawn_at'),
    },
    (table) => [
        index('preferences_student_scope_date').on(
            table.studentId,
            table.scope,
            table.submittedAt,
        ),
    ],
);

export const preferenceChoices = sqliteTable(
    'preference_choices',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        submissionId: integer('submission_id')
            .notNull()
            .references(() => preferenceSubmissions.id, {
                onDelete: 'cascade',
            }),
        targetStudentId: integer('target_student_id')
            .notNull()
            .references(() => studentRecords.id, { onDelete: 'restrict' }),
        kind: text('kind').$type<PreferenceKind>().notNull(),
    },
    (table) => [
        unique('preference_choice_unique').on(
            table.submissionId,
            table.targetStudentId,
            table.kind,
        ),
    ],
);

export const pairingRestrictions = sqliteTable('pairing_restrictions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    student1Id: integer('student1_id')
        .notNull()
        .references(() => studentRecords.id, { onDelete: 'restrict' }),
    student2Id: integer('student2_id')
        .notNull()
        .references(() => studentRecords.id, { onDelete: 'restrict' }),
    createdBy: integer('created_by').references(() => users.id, {
        onDelete: 'set null',
    }),
    scope: text('scope').$type<'project' | 'period'>().notNull(),
    projectId: integer('project_id').references(() => projects.id, {
        onDelete: 'set null',
    }),
    academicPeriod: text('academic_period').notNull(),
    reason: text('reason'),
    createdAt: text('created_at').notNull(),
    reviewAt: text('review_at').notNull(),
    withdrawnAt: text('withdrawn_at'),
});

export const teamDrafts = sqliteTable('team_drafts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, {
        onDelete: 'set null',
    }),
    projectName: text('project_name').notNull(),
    algorithmVersion: text('algorithm_version').$type<'v1' | 'v2'>().notNull(),
    allocation: text('allocation', { mode: 'json' })
        .$type<Allocation[]>()
        .notNull(),
    inputSnapshot: text('input_snapshot', {
        mode: 'json',
    }).$type<FormationSnapshot | null>(),
    source: text('source')
        .$type<'legacy-draft' | 'generated' | 'manual-adjustment'>()
        .notNull(),
    createdBy: integer('created_by').references(() => users.id, {
        onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull(),
});

export const confirmedAssignments = sqliteTable(
    'confirmed_assignments',
    {
        originProjectId: integer('origin_project_id').notNull(),
        id: integer('id').primaryKey({ autoIncrement: true }),
        projectId: integer('project_id').references(() => projects.id, {
            onDelete: 'set null',
        }),
        projectName: text('project_name').notNull(),
        revision: integer('revision').notNull(),
        draftId: integer('draft_id').references(() => teamDrafts.id, {
            onDelete: 'set null',
        }),
        algorithmVersion: text('algorithm_version')
            .$type<'v1' | 'v2'>()
            .notNull(),
        allocation: text('allocation', { mode: 'json' })
            .$type<Allocation[]>()
            .notNull(),
        inputSnapshot: text('input_snapshot', {
            mode: 'json',
        }).$type<FormationSnapshot | null>(),
        confirmedBy: integer('confirmed_by').references(() => users.id, {
            onDelete: 'set null',
        }),
        confirmedAt: text('confirmed_at').notNull(),
        supersededAt: text('superseded_at'),
    },
    (table) => [
        unique('assignment_project_revision_unique').on(
            table.projectId,
            table.revision,
        ),
    ],
);

export const assignmentMembers = sqliteTable(
    'assignment_members',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        assignmentId: integer('assignment_id')
            .notNull()
            .references(() => confirmedAssignments.id, { onDelete: 'cascade' }),
        studentId: integer('student_id')
            .notNull()
            .references(() => studentRecords.id, { onDelete: 'restrict' }),
        teamNumber: integer('team_number').notNull(),
    },
    (table) => [
        unique('assignment_student_unique').on(
            table.assignmentId,
            table.studentId,
        ),
    ],
);

export const identityReviews = sqliteTable(
    'identity_reviews',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        sourceType: text('source_type')
            .$type<'participant' | 'roster' | 'response'>()
            .notNull(),
        sourceId: integer('source_id').notNull(),
        provisionalStudentId: integer('provisional_student_id').references(
            () => studentRecords.id,
            { onDelete: 'restrict' },
        ),
        reason: text('reason').notNull(),
        candidates: text('candidates', { mode: 'json' })
            .$type<number[]>()
            .notNull(),
        rawSource: text('raw_source', { mode: 'json' }).$type<
            Record<string, unknown>
        >(),
        resolvedStudentId: integer('resolved_student_id').references(
            () => studentRecords.id,
            { onDelete: 'restrict' },
        ),
        resolvedBy: integer('resolved_by').references(() => users.id, {
            onDelete: 'set null',
        }),
        resolvedAt: text('resolved_at'),
    },
    (table) => [
        unique('identity_review_source_unique').on(
            table.sourceType,
            table.sourceId,
        ),
    ],
);
