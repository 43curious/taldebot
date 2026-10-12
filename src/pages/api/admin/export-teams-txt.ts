import type { APIRoute } from 'astro';
import { parseId, routeError } from '../../../lib/input';
import { db } from '../../../lib/db';
import {
    projects,
    students,
    teams,
    confirmedAssignments,
} from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const projectId = parseId(url.searchParams.get('projectId'));
    const version = url.searchParams.get('version') || 'v2';

    if (!projectId) {
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
                eq(teams.algorithmVersion, version),
            ),
            orderBy: (teams, { asc }) => [asc(teams.teamNumber)],
        });

        const adopted = await db.query.confirmedAssignments.findFirst({
            where: eq(confirmedAssignments.projectId, projectId),
            orderBy: (row, { desc }) => [desc(row.revision)],
        });
        const assignmentStatus =
            adopted &&
            projectTeams.length &&
            projectTeams.every((team) => team.draftId === adopted.draftId)
                ? `Berretsia · ${adopted.revision}. berrikuspena`
                : 'Zirriborroa';
        const participants = await db.query.students.findMany({
            where: eq(students.projectId, projectId),
        });
        const membersById = new Map(
            participants.map((student) => [student.id, student]),
        );
        let textContent = `${project.name.toUpperCase()} - TALDEEN ZERRENDA\n`;
        textContent += '='.repeat(textContent.length - 1) + '\n\n';

        textContent += assignmentStatus + '\n\n';
        for (const team of projectTeams) {
            const memberData = team.memberIds
                .map((id) => membersById.get(id))
                .filter((member): member is NonNullable<typeof member> =>
                    Boolean(member),
                );

            // SORTING LOGIC: Alphabetical by first surname
            // Heuristic: Take the first word after the first space as the surname.
            // If only one word exists, use the whole name.
            const sortedMembers = memberData.sort((a, b) => {
                const getSurname = (name: string) => {
                    const parts = name.trim().split(/\s+/);
                    return parts.length > 1
                        ? parts[1].toLowerCase()
                        : parts[0].toLowerCase();
                };
                return getSurname(a.name).localeCompare(getSurname(b.name));
            });

            textContent += `TALDEA ${team.teamNumber}\n`;
            textContent += '-'.repeat(10) + '\n';
            sortedMembers.forEach((m) => {
                textContent += `• ${m.name}\n`;
            });
            textContent += '\n';
        }

        return new Response(textContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Disposition': `attachment; filename="taldeak-${project.name.replace(/\s+/g, '-').toLowerCase()}.txt"`,
            },
        });
    } catch (error) {
        return routeError(error);
    }
};
