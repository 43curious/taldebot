import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { projects, teams, students } from '../../../../db/schema';
import { eq, inArray } from 'drizzle-orm';

export const GET: APIRoute = async ({ params, request }) => {
    const url = new URL(request.url);
    const projectId = parseInt(url.searchParams.get('projectId') || '');

    if (isNaN(projectId)) {
        return new Response('Invalid project ID', { status: 400 });
    }

    try {
        const project = await db.query.projects.findFirst({
            where: eq(projects.id, projectId),
        });
        if (!project) return new Response('Project not found', { status: 404 });

        const projectTeams = await db.query.teams.findMany({
            where: eq(teams.projectId, projectId),
            orderBy: (teams, { asc }) => [asc(teams.teamNumber)],
        });

        let csvContent = 'Team,Member Name,Email\n';

        for (const team of projectTeams) {
            const memberData = await db.query.students.findMany({
                where: inArray(students.id, team.memberIds),
            });

            for (const student of memberData) {
                csvContent += `${team.teamNumber},"${student.name}","${student.email || ''}"\n`;
            }
        }

        return new Response(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="teams-${project.name.replace(/\s+/g, '-').toLowerCase()}.csv"`,
            },
        });
    } catch (error) {
        console.error('Export error:', error);
        return new Response('Error exporting teams', { status: 500 });
    }
};
