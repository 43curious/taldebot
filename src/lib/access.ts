import { eq, inArray, sql } from 'drizzle-orm';
import { classes, studentRecords, projects, users } from '../../db/schema';
import type { EntryProvenance } from './trackingTypes';
import type { AppDatabase } from './db';
import { InputError } from './input';

export interface TeacherActor {
    id: number;
    role: 'master' | 'admin';
}
export interface TeacherAccess {
    actor: TeacherActor;
    classIds: Set<number>;
    degreeIds: Set<number>;
    studentIds: Set<number>;
    projectIds: Set<number>;
}

// Recheck the account/role and current grants inside teacher submission transactions.
export async function currentTeacher(
    store: Pick<AppDatabase, 'query' | 'all'>,
    actor: TeacherActor,
) {
    const user = await store.query.users.findFirst({
        where: eq(users.id, actor.id),
    });
    if (!user)
        throw new InputError('Irakaslearen kontua ez dago erabilgarri.', 403);
    const access = await teachingAccess(store, user);
    const entry: EntryProvenance = {
        kind: 'teacher',
        teacherId: user.id,
        teacherName: user.fullName || user.username,
    };
    return { access, entry };
}

export async function teachingAccess(
    db: Pick<AppDatabase, 'all'>,
    actor: TeacherActor,
): Promise<TeacherAccess> {
    const access: TeacherAccess = {
        actor,
        classIds: new Set(),
        degreeIds: new Set(),
        studentIds: new Set(),
        projectIds: new Set(),
    };
    if (actor.role === 'master') return access;
    // One statement reads a consistent responsibility snapshot without transferring
    // unrelated rosters, participant snapshots or private enrollment metadata.
    const scopes = await db.all<{
        kind: 'class' | 'degree' | 'student' | 'project';
        id: number;
    }>(sql`
        WITH granted_classes AS (
            SELECT c.id, c.degree_id FROM classes c
            WHERE EXISTS (
                SELECT 1 FROM teacher_responsibilities r
                WHERE r.user_id = ${actor.id}
                AND (r.class_id = c.id OR r.degree_id = c.degree_id)
            )
        ), visible_students AS (
            SELECT e.student_id AS id FROM enrollments e
            JOIN granted_classes c ON c.id = e.class_id
            WHERE e.ended_at IS NULL
            UNION
            SELECT s.id FROM student_records s
            WHERE s.created_by = ${actor.id}
            AND NOT EXISTS (
                SELECT 1 FROM enrollments e
                WHERE e.student_id = s.id AND e.ended_at IS NULL
            )
        ), visible_projects AS (
            SELECT p.id FROM projects p
            WHERE NOT EXISTS (
                SELECT 1 FROM students s WHERE s.project_id = p.id
                AND (s.student_record_id IS NULL OR s.student_record_id NOT IN (SELECT id FROM visible_students))
            )
            AND (p.owner_id = ${actor.id} OR EXISTS (SELECT 1 FROM students s WHERE s.project_id = p.id))
        )
        SELECT 'class' AS kind, id FROM granted_classes
        UNION SELECT 'degree', degree_id FROM granted_classes WHERE degree_id IS NOT NULL
        UNION SELECT 'degree', degree_id FROM teacher_responsibilities WHERE user_id = ${actor.id} AND degree_id IS NOT NULL
        UNION SELECT 'student', id FROM visible_students
        UNION SELECT 'project', id FROM visible_projects
    `);
    for (const { kind, id } of scopes) {
        if (kind === 'class') access.classIds.add(id);
        else if (kind === 'degree') access.degreeIds.add(id);
        else if (kind === 'student') access.studentIds.add(id);
        else access.projectIds.add(id);
    }
    return access;
}
export const isMaster = (access: TeacherAccess) =>
    access.actor.role === 'master';
export const canReadStudent = (access: TeacherAccess, id: number) =>
    isMaster(access) || access.studentIds.has(id);
export const canReadProject = (access: TeacherAccess, id: number) =>
    isMaster(access) || access.projectIds.has(id);
export function requireStudent(access: TeacherAccess, id: number) {
    if (!canReadStudent(access, id))
        throw new InputError(
            'Ikasle honen jarraipena ikusteko baimenik ez duzu.',
            403,
        );
}
export function requireProject(access: TeacherAccess, id: number) {
    if (!canReadProject(access, id))
        throw new InputError('Proiektu honetarako baimenik ez duzu.', 403);
}
export function requireClass(access: TeacherAccess, id: number) {
    if (!isMaster(access) && !access.classIds.has(id))
        throw new InputError('Klase honetarako baimenik ez duzu.', 403);
}
export function requireMaster(access: TeacherAccess) {
    if (!isMaster(access))
        throw new InputError('Master baimena behar da.', 403);
}
export const studentFilter = (access: TeacherAccess) =>
    isMaster(access)
        ? undefined
        : inArray(studentRecords.id, [...access.studentIds]);
export const classFilter = (access: TeacherAccess) =>
    isMaster(access) ? undefined : inArray(classes.id, [...access.classIds]);
export const projectFilter = (access: TeacherAccess) =>
    isMaster(access) ? undefined : inArray(projects.id, [...access.projectIds]);
