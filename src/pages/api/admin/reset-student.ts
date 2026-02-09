import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { students, responses } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const studentId = parseInt(url.searchParams.get('studentId') || '');
        const projectId = parseInt(url.searchParams.get('projectId') || '');

        if (isNaN(studentId) || isNaN(projectId)) {
            return new Response('Invalid params', { status: 400 });
        }

        // Delete the student's response
        await db.delete(responses)
            .where(and(eq(responses.studentId, studentId), eq(responses.projectId, projectId)));

        // Reset hasCompleted flag
        await db.update(students)
            .set({ hasCompleted: false })
            .where(and(eq(students.id, studentId), eq(students.projectId, projectId)));

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('Reset error:', error);
        return new Response('Error resetting student', { status: 500 });
    }
};
