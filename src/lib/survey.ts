import { eq } from 'drizzle-orm';
import { projects, students } from '../../db/schema';
import { db } from './db';
import { isArchivedProject } from './projectLifecycle';

export async function loadSurvey(accessCode: string | undefined) {
    if (!accessCode) return undefined;
    const project = await db.query.projects.findFirst({
        where: eq(projects.accessCode, accessCode),
    });
    if (!project || isArchivedProject(project)) return undefined;
    const allStudents = await db.query.students.findMany({
        where: eq(students.projectId, project.id),
        orderBy: (row, { asc }) => [asc(row.name)],
    });
    return { project, allStudents };
}
export type SurveyData = NonNullable<Awaited<ReturnType<typeof loadSurvey>>>;

export async function loadProjectSurvey(
    accessCode: string | undefined,
    token: string | null,
) {
    const data = await loadSurvey(accessCode);
    if (!data) return undefined;
    if (!token)
        return { data, token: null, context: undefined, invalid: false };
    try {
        const context = await (
            await import('./studentUpdates')
        ).requestContext(db, token, { includePreferences: false });
        if (
            context.request.scope !== 'project' ||
            context.request.projectId !== data.project.id
        )
            return { data, token: null, context: undefined, invalid: true };
        return { data, token, context, invalid: false };
    } catch {
        return { data, token: null, context: undefined, invalid: true };
    }
}

export async function loadCollectionSurvey(token: string) {
    try {
        return await (
            await import('./surveyCollections')
        ).surveyRequestContext(db, token);
    } catch {
        return undefined;
    }
}
