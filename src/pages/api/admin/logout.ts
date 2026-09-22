import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ session, cookies, redirect }) => {
    session?.destroy();
    cookies.delete('admin_session', { path: '/' });
    cookies.delete('admin_user', { path: '/' });
    return redirect('/admin/login');
};
