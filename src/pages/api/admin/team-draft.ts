import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { positiveId, routeError } from '../../../lib/input';
import {
    adjustDraft,
    confirmDraft,
    createManualDraft,
} from '../../../lib/formation';
const allocationSchema = z.array(
    z.object({
        teamNumber: positiveId,
        studentIds: z.array(z.number().int().positive()),
        justification: z.string().default('Irakasleak egokitua'),
    }),
);
const schema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('manual'),
        projectId: positiveId,
        version: z.enum(['v1', 'v2']).default('v2'),
        numTeams: positiveId,
        allocation: allocationSchema,
    }),
    z.object({
        action: z.literal('confirm'),
        projectId: positiveId,
        draftId: positiveId,
    }),
    z.object({
        action: z.literal('adjust'),
        projectId: positiveId,
        draftId: positiveId,
        allocation: allocationSchema,
    }),
]);
export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const input = schema.parse(await request.json());
        const result =
            input.action === 'manual'
                ? await createManualDraft(
                      db,
                      locals.teacherAccess,
                      input.projectId,
                      input.version,
                      input.numTeams,
                      input.allocation,
                  )
                : input.action === 'confirm'
                  ? await confirmDraft(
                        db,
                        locals.teacherAccess,
                        input.projectId,
                        input.draftId,
                    )
                  : await adjustDraft(
                        db,
                        locals.teacherAccess,
                        input.projectId,
                        input.draftId,
                        input.allocation,
                    );
        return Response.json({ success: true, id: result.id });
    } catch (error) {
        return routeError(error);
    }
};
