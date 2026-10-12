import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { positiveId, routeError } from '../../../lib/input';
import { issueUpdateRequest } from '../../../lib/studentUpdates';
import { projects } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
const schema = z.object({
    studentId: positiveId,
    projectId: positiveId.optional(),
    participantId: positiveId.optional(),
    assessmentAsked: z.boolean(),
    preferencesAsked: z.boolean(),
    academicPeriod: z
        .string()
        .regex(/^\d{4}-\d{4}$/)
        .optional(),
});
export const POST: APIRoute = async ({ request, locals, url }) => {
    try {
        const input = schema.parse(await request.json());
        const result = await issueUpdateRequest(
            db,
            locals.teacherAccess,
            input,
        );
        const project = input.projectId
            ? await db.query.projects.findFirst({
                  where: eq(projects.id, input.projectId),
              })
            : undefined;
        const path = project
            ? `/student/form/${project.accessCode}?token=${result.token}`
            : `/student/update/${result.token}`;
        return Response.json({
            ...result,
            url: new URL(path, url.origin).href,
        });
    } catch (error) {
        return routeError(error);
    }
};
