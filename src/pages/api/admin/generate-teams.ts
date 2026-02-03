import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { projects, students, responses, teamHistory, teams as teamsTable } from '../../../../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { createTeams, type StudentData } from '../../../lib/teamMatcher';

export const POST: APIRoute = async ({ params, request, redirect }) => {
    const url = new URL(request.url);
    const projectId = parseInt(url.searchParams.get('projectId') || '');

    if (isNaN(projectId)) {
        return new Response('Invalid project ID', { status: 400 });
    }

    try {
        // 1. Fetch project info
        const project = await db.query.projects.findFirst({
            where: eq(projects.id, projectId),
        });
        if (!project) return new Response('Project not found', { status: 404 });

        // 2. Fetch all students and their responses
        const allStudents = await db.query.students.findMany({
            where: eq(students.projectId, projectId),
        });

        const allResponses = await db.query.responses.findMany({
            where: eq(responses.projectId, projectId),
        });

        // 3. Fetch history
        const history = await db.query.teamHistory.findMany({
            where: eq(teamHistory.projectId, projectId), // Or a more global history if available
        });

        // 4. Prepare data for the algorithm
        const studentDataList: StudentData[] = allStudents.map(student => {
            const resp = allResponses.find(r => r.studentId === student.id);

            if (resp) {
                return {
                    id: student.id,
                    name: student.name,
                    skills: {
                        skillsNarrative: resp.skillsNarrative,
                        skillsTechnical: resp.skillsTechnical,
                        skillsManagement: resp.skillsManagement,
                        skillsSoft: resp.skillsSoft,
                    },
                    preferWith: resp.preferWith,
                    preferAvoid: resp.preferAvoid,
                    isExcluded: student.isExcluded || false,
                };
            } else {
                // Missing student: baseline skills (average 5)
                return {
                    id: student.id,
                    name: student.name,
                    skills: {
                        skillsNarrative: { creativity: 5, writing: 5, references: 5, communication: 5 },
                        skillsTechnical: { camera: 5, sound: 5, editing: 5 },
                        skillsManagement: { planning: 5, production: 5 },
                        skillsSoft: { leadership: 5, listening: 5, proactivity: 5, teamwork: 5, motivation: 5, conflict: 5 },
                    },
                    preferWith: [],
                    preferAvoid: [],
                    isExcluded: student.isExcluded || false,
                };
            }
        });

        // 5. Calculate number of teams
        let numTeams = project.numTeams;
        if (!numTeams && project.targetTeamSize) {
            const activeCount = studentDataList.filter(s => !s.isExcluded).length;
            numTeams = Math.max(2, Math.round(activeCount / project.targetTeamSize));
        }

        if (!numTeams) {
            return new Response('Project configuration missing team count or size', { status: 400 });
        }

        // 6. Run algorithm
        const generatedTeams = createTeams(studentDataList, numTeams, project.projectType, history);

        // 6. Save to database
        // Clear old teams first
        await db.delete(teamsTable).where(eq(teamsTable.projectId, projectId));

        const insertChunks = generatedTeams.map(t => ({
            projectId,
            teamNumber: t.teamNumber,
            memberIds: t.memberIds,
            justification: t.justification,
        }));

        await db.insert(teamsTable).values(insertChunks);

        return redirect(`/admin/teams/${projectId}`);
    } catch (error) {
        console.error('Team generation error:', error);
        return new Response('Error generating teams', { status: 500 });
    }
};
