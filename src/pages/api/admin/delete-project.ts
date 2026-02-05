import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { projects } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { projectId } = await request.json();

        if (!projectId) {
            return new Response('Missing projectId', { status: 400 });
        }

        await db.delete(projects).where(eq(projects.id, projectId));

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Project deletion error:', error);
        return new Response('Error deleting project', { status: 500 });
    }
};
