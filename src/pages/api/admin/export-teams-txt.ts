import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { projects, students, teams } from '../../../../db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const projectId = parseInt(url.searchParams.get('projectId') || '');
    const version = url.searchParams.get('version') || 'v2';

    if (isNaN(projectId)) {
        return new Response('Missing or invalid projectId', { status: 400 });
    }

    try {
        const project = await db.query.projects.findFirst({
            where: eq(projects.id, projectId),
        });
        if (!project) return new Response('Project not found', { status: 404 });

        const projectTeams = await db.query.teams.findMany({
            where: and(
                eq(teams.projectId, projectId),
                eq(teams.algorithmVersion, version)
            ),
            orderBy: (teams, { asc }) => [asc(teams.teamNumber)],
        });

        let textContent = `${project.name.toUpperCase()} - TALDEEN ZERRENDA\n`;
        textContent += "=".repeat(textContent.length - 1) + "\n\n";

        for (const team of projectTeams) {
            const memberData = await db.query.students.findMany({
                where: inArray(students.id, team.memberIds),
            });

            // SORTING LOGIC: Alphabetical by first surname
            // Heuristic: Take the first word after the first space as the surname.
            // If only one word exists, use the whole name.
            const sortedMembers = memberData.sort((a, b) => {
                const getSurname = (name: string) => {
                    const parts = name.trim().split(/\s+/);
                    return parts.length > 1 ? parts[1].toLowerCase() : parts[0].toLowerCase();
                };
                return getSurname(a.name).localeCompare(getSurname(b.name));
            });

            textContent += `TALDEA ${team.teamNumber}\n`;
            textContent += "-".repeat(10) + "\n";
            sortedMembers.forEach(m => {
                textContent += `• ${m.name}\n`;
            });
            textContent += "\n";
        }

        return new Response(textContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Disposition': `attachment; filename="taldeak-${project.name.replace(/\s+/g, '-').toLowerCase()}.txt"`,
            },
        });
    } catch (error) {
        console.error('Text export error:', error);
        return new Response('Error exporting text file', { status: 500 });
    }
};
