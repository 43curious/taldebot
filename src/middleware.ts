import { defineMiddleware } from 'astro/middleware';
import { db } from './lib/db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
    teachingAccess,
    requireMaster,
    requireProject,
    requireStudent,
} from './lib/access';
import { routeError } from './lib/input';

export const onRequest = defineMiddleware(async (context, next) => {
    const path = context.url.pathname;
    if (
        (path.startsWith('/admin/') && path !== '/admin/login') ||
        path.startsWith('/api/admin/')
    ) {
        if (path !== '/api/admin/logout') {
            const adminId = await context.session?.get<number>('adminId');
            const user = adminId
                ? await db.query.users.findFirst({
                      where: eq(users.id, adminId),
                  })
                : null;
            if (!user)
                return path.startsWith('/api/')
                    ? new Response('Unauthorized', { status: 401 })
                    : context.redirect('/admin/login');
            const access = await teachingAccess(db, user);
            context.locals.teacherAccess = access;
            context.locals.teacher = user;
            try {
                if (
                    [
                        '/admin/users',
                        '/admin/access',
                        '/admin/identity-review',
                    ].includes(path)
                )
                    requireMaster(access);
                const project = path.match(
                    /^\/admin\/(?:teams|monitor)\/(\d+)$/,
                );
                if (project) requireProject(access, Number(project[1]));
                const student = path.match(/^\/admin\/students\/(\d+)$/);
                if (student) requireStudent(access, Number(student[1]));
                if (
                    path.startsWith('/api/admin/') &&
                    context.url.searchParams.has('projectId')
                ) {
                    const id = Number(
                        context.url.searchParams.get('projectId'),
                    );
                    if (Number.isSafeInteger(id) && id > 0)
                        requireProject(access, id);
                }
            } catch (error) {
                return routeError(error);
            }
        }
    }
    const response = await next();
    if (path.startsWith('/admin/') || path.startsWith('/api/admin/'))
        response.headers.set('Cache-Control', 'private, no-store');
    return response;
});
