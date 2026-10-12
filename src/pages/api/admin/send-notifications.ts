import type { APIRoute } from 'astro';
import { parseId, routeError } from '../../../lib/input';
import { scoredSkills } from '../../../lib/skills';
import { indexResponses } from '../../../lib/projectData';
import { db } from '../../../lib/db';
import { projects, teams, students, responses } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { sendTeamNotification } from '../../../lib/email';

export const POST: APIRoute = async ({ request, redirect }) => {
    const url = new URL(request.url);
    const projectId = parseId(url.searchParams.get('projectId'));

    if (!projectId) {
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

        const [participants, records] = await Promise.all([
            db.query.students.findMany({ where: eq(students.projectId, projectId) }),
            db.query.responses.findMany({ where: eq(responses.projectId, projectId) }),
        ]);
        const membersById = new Map(participants.map(student => [student.id, student]));
        const responsesByStudent = indexResponses(records);
        for (const team of projectTeams) {
            const teamMembers = team.memberIds.map(id => membersById.get(id)).filter((member): member is NonNullable<typeof member> => Boolean(member));

            const memberNames = teamMembers.map(m => m.name);

            for (const student of teamMembers) {
                if (!student.email) continue;

                const resp = responsesByStudent.get(student.id);
                const topSkills: string[] = [];

                if (resp) {
                    const allSkills = scoredSkills(resp).filter(skill => skill.category !== 'skillsSoft');
                    topSkills.push(...allSkills.sort((a, b) => (b.val ?? 0) - (a.val ?? 0)).slice(0, 3).map(skill => skill.label));
                }

                const result = await sendTeamNotification({
                    to: student.email,
                    studentName: student.name,
                    projectName: project.name,
                    teamNumber: team.teamNumber,
                    members: memberNames.filter(name => name !== student.name),
                    topSkills,
                });
                if (!result.success) throw new Error("Notification delivery failed");
            }
        }

        // Update project status
        await db.update(projects)
            .set({ status: 'completed' })
            .where(eq(projects.id, projectId));

        return redirect(`/admin/teams/${projectId}?notifications=sent`);
    } catch (error) {
        return routeError(error);
    }
};
