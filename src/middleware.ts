import { defineMiddleware } from 'astro/middleware';
import { db } from './lib/db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

export const onRequest = defineMiddleware(async (context, next) => {
    const path = context.url.pathname;
    if ((path.startsWith('/admin/') && path !== '/admin/login') || path.startsWith('/api/admin/')) {
        if (path !== '/api/admin/logout') {
            const adminId = await context.session?.get<number>('adminId');
            const user = adminId ? await db.query.users.findFirst({ where: eq(users.id, adminId) }) : null;
            if (!user) return path.startsWith('/api/')
                ? new Response('Unauthorized', { status: 401 })
                : context.redirect('/admin/login');
        }
    }
    return next();
});
