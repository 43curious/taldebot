import { expect, it, vi } from 'vitest';
import { onRequest } from '../../middleware';

const findAdmin = vi.hoisted(() => vi.fn(async (): Promise<{ id: number } | undefined> => ({ id: 1 })));
vi.mock('../db', () => ({ db: { query: { users: { findFirst: findAdmin } } } }));

it('blocks forged legacy cookies and protects both pages and API routes', async () => {
    for (const path of ['/admin/classes', '/admin/dashboard', '/api/admin/export-data']) {
        const next = vi.fn(async () => new Response('ok'));
        const context = {
            url: new URL(`https://example.com${path}`),
            cookies: { get: () => ({ value: 'active' }) },
            session: { get: async (): Promise<number | undefined> => undefined },
            redirect: (url: string) => Response.redirect(`https://example.com${url}`),
        };
        const response = await onRequest(context as any, next);
        expect(response?.status).toBe(path.startsWith('/api/') ? 401 : 302);
        expect(next).not.toHaveBeenCalled();
        context.session.get = async () => 1;
        expect((await onRequest(context as any, next))?.status).toBe(200);
        findAdmin.mockResolvedValueOnce(undefined);
        expect((await onRequest(context as any, next))?.status).toBe(path.startsWith('/api/') ? 401 : 302);
    }
});
