import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { projects, teams, students, responses } from '../../../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { sendTeamNotification } from '../../../lib/email';

export const POST: APIRoute = async ({ request, redirect }) => {
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
        });

        for (const team of projectTeams) {
            const memberIds = team.memberIds;
            const teamMembers = await db.query.students.findMany({
                where: inArray(students.id, memberIds),
            });

            const memberResponses = await db.query.responses.findMany({
                where: inArray(responses.studentId, memberIds),
            });

            const memberNames = teamMembers.map(m => m.name);

            for (const student of teamMembers) {
                if (!student.email) continue;

                const resp = memberResponses.find(r => r.studentId === student.id);
                const topSkills: string[] = [];

                if (resp) {
                    const allSkills = [
                        ...Object.entries(resp.skillsNarrative).map(([k, v]) => ({ name: k, val: v })),
                        ...Object.entries(resp.skillsTechnical).map(([k, v]) => ({ name: k, val: v })),
                        ...Object.entries(resp.skillsManagement).map(([k, v]) => ({ name: k, val: v })),
                    ];
                    topSkills.push(...allSkills.sort((a, b) => b.val - a.val).slice(0, 3).map(s => s.name));
                }

                await sendTeamNotification({
                    to: student.email,
                    studentName: student.name,
                    projectName: project.name,
                    teamNumber: team.teamNumber,
                    members: memberNames.filter(name => name !== student.name),
                    topSkills,
                });
            }
        }

        // Update project status
        await db.update(projects)
            .set({ status: 'completed' })
            .where(eq(projects.id, projectId));

        return redirect(`/admin/teams/${projectId}?notifications=sent`);
    } catch (error) {
        console.error('Notification error:', error);
        return new Response('Error sending notifications', { status: 500 });
    }
};
