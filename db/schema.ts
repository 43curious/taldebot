import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  numTeams: integer('num_teams'),
  targetTeamSize: integer('target_team_size'),
  projectType: text('project_type').$type<'narrative' | 'technical' | 'management' | 'balanced'>().notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  status: text('status').$type<'setup' | 'active' | 'completed'>().default('setup'),
  adminEmail: text('admin_email'),
  accessCode: text('access_code').unique(),
});

export const students = sqliteTable('students', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  hasCompleted: integer('has_completed', { mode: 'boolean' }).default(false),
  isExcluded: integer('is_excluded', { mode: 'boolean' }).default(false),
});

export const responses = sqliteTable('responses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  studentId: integer('student_id').references(() => students.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  skillsNarrative: text('skills_narrative', { mode: 'json' }).$type<{
    creativity: number;
    writing: number;
    references: number;
    communication: number;
  }>().notNull(),
  skillsTechnical: text('skills_technical', { mode: 'json' }).$type<{
    camera: number;
    sound: number;
    editing: number;
  }>().notNull(),
  skillsManagement: text('skills_management', { mode: 'json' }).$type<{
    planning: number;
    production: number;
  }>().notNull(),
  skillsSoft: text('skills_soft', { mode: 'json' }).$type<{
    leadership: number;
    listening: number;
    proactivity: number;
    teamwork: number;
    motivation: number;
    conflict: number;
  }>().notNull(),
  preferWith: text('prefer_with', { mode: 'json' }).$type<number[]>().notNull(),
  preferAvoid: text('prefer_avoid', { mode: 'json' }).$type<number[]>().notNull(),
  comfort: text('comfort', { mode: 'json' }).$type<number[]>().notNull(),
  completedAt: text('completed_at').default(sql`CURRENT_TIMESTAMP`),
});

export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  teamNumber: integer('team_number').notNull(),
  memberIds: text('member_ids', { mode: 'json' }).$type<number[]>().notNull(),
  justification: text('justification').notNull(),
  algorithmVersion: text('algorithm_version').default('v2'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const teamHistory = sqliteTable('team_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
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
