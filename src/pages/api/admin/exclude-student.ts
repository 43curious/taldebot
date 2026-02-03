import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { students } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const studentId = parseInt(url.searchParams.get('studentId') || '');
        const projectId = parseInt(url.searchParams.get('projectId') || '');
        const exclude = url.searchParams.get('exclude') === 'true';

        if (isNaN(studentId) || isNaN(projectId)) {
            return new Response('Invalid params', { status: 400 });
        }

        await db.update(students)
            .set({ isExcluded: exclude })
            .where(and(eq(students.id, studentId), eq(students.projectId, projectId)));

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('Exclude error:', error);
        return new Response('Error updating student', { status: 500 });
    }
};
