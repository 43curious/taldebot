import { eq, inArray, isNull } from 'drizzle-orm';
import {
    classes,
    enrollments,
    studentRecords,
    projects,
    teacherResponsibilities,
} from '../../db/schema';
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

export async function teachingAccess(
    db: Pick<AppDatabase, 'query'>,
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
    const grants = await db.query.teacherResponsibilities.findMany({
        where: eq(teacherResponsibilities.userId, actor.id),
    });
    const grantedDegrees = new Set(
        grants.flatMap((grant) =>
            grant.degreeId === null ? [] : [grant.degreeId],
        ),
    );
    const groups = await db.query.classes.findMany();
    for (const grant of grants) {
        if (grant.degreeId !== null) access.degreeIds.add(grant.degreeId);
        if (grant.classId !== null) access.classIds.add(grant.classId);
    }
    for (const group of groups) {
        if (group.degreeId !== null && grantedDegrees.has(group.degreeId))
            access.classIds.add(group.id);
        if (access.classIds.has(group.id) && group.degreeId !== null)
            access.degreeIds.add(group.degreeId);
    }
    // Degree IDs displayed for a class grant do not grant access to sibling classes.
    const active = await db.query.enrollments.findMany({
        where: isNull(enrollments.endedAt),
    });
    const enrolled = new Set(active.map((row) => row.studentId));
    for (const row of active)
        if (row.classId !== null && access.classIds.has(row.classId))
            access.studentIds.add(row.studentId);
    const collected = await db.query.studentRecords.findMany({
        where: eq(studentRecords.createdBy, actor.id),
    });
    for (const person of collected)
        if (!enrolled.has(person.id)) access.studentIds.add(person.id);
    const [allProjects, participants] = await Promise.all([
        db.query.projects.findMany(),
        db.query.students.findMany(),
    ]);
    const grouped = new Map<number, typeof participants>();
    for (const row of participants)
        if (row.projectId !== null) {
            const members = grouped.get(row.projectId) ?? [];
            members.push(row);
            grouped.set(row.projectId, members);
        }
    for (const project of allProjects) {
        const members = grouped.get(project.id) ?? [];
        const allVisible = members.every(
            (row) =>
                row.studentRecordId !== null &&
                access.studentIds.has(row.studentRecordId),
        );
        if (allVisible && (members.length > 0 || project.ownerId === actor.id))
            access.projectIds.add(project.id);
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
