import { eq } from 'drizzle-orm';
import { projects, students } from '../../db/schema';
import { db } from './db';

export async function loadSurvey(accessCode: string | undefined) {
    if (!accessCode) return undefined;
    const project = await db.query.projects.findFirst({
        where: eq(projects.accessCode, accessCode),
    });
    if (!project) return undefined;
    const allStudents = await db.query.students.findMany({
        where: eq(students.projectId, project.id),
        orderBy: (row, { asc }) => [asc(row.name)],
    });
    return { project, allStudents };
}
export type SurveyData = NonNullable<Awaited<ReturnType<typeof loadSurvey>>>;
