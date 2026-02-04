import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ cookies, redirect }) => {
    cookies.delete('admin_session', { path: '/' });
    cookies.delete('admin_user', { path: '/' });

    return redirect('/admin/login');
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
    // Also support GET for simple links if needed, though POST is safer
    cookies.delete('admin_session', { path: '/' });
    cookies.delete('admin_user', { path: '/' });

    return redirect('/admin/login');
};
