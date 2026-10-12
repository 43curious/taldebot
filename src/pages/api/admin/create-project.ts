import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { projectSchema, routeError } from '../../../lib/input';
import { createProject } from '../../../lib/projectOperations';

export const POST: APIRoute = async ({ request, redirect, locals }) => {
    try {
        const data = projectSchema.parse(
            Object.fromEntries((await request.formData()).entries()),
        );
        await createProject(db, data, locals.teacherAccess);
        return redirect('/admin/dashboard');
    } catch (error) {
        return routeError(error);
    }
};
