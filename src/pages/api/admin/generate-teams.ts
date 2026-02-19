import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { projects, students, responses, teamHistory, teams as teamsTable } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { createTeams, type StudentData } from '../../../lib/teamMatcher';
import { createTeamsV1 } from '../../../lib/teamMatcherV1';

type AlgorithmVersion = 'v1' | 'v2';

function getRequestedAlgorithmVersion(requestUrl: string): AlgorithmVersion {
    const url = new URL(requestUrl);
    const version = url.searchParams.get('version');
    return version === 'v1' ? 'v1' : 'v2';
}

export const POST: APIRoute = async ({ request, redirect }) => {
    const url = new URL(request.url);
    const projectId = parseInt(url.searchParams.get('projectId') || '');
    const algorithmVersion = getRequestedAlgorithmVersion(request.url);

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
                    comfort: resp.comfort,
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
                    comfort: [],
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

        // 6. Run requested algorithm version on persisted responses
        const generatedTeams =
            algorithmVersion === 'v1'
                ? createTeamsV1(studentDataList, numTeams, project.projectType, history)
                : createTeams(studentDataList, numTeams, project.projectType, history);

        // 7. Save to database
        // Clear only the version being regenerated; keep the other one for comparison.
        await db.delete(teamsTable).where(
            and(
                eq(teamsTable.projectId, projectId),
                eq(teamsTable.algorithmVersion, algorithmVersion)
            )
        );

        const insertChunks = generatedTeams.map(t => ({
            projectId,
            teamNumber: t.teamNumber,
            memberIds: t.memberIds,
            justification: t.justification,
            algorithmVersion,
        }));

        await db.insert(teamsTable).values(insertChunks);

        return redirect(`/admin/teams/${projectId}?version=${algorithmVersion}`);
    } catch (error) {
        console.error('Team generation error:', error);
        return new Response('Error generating teams', { status: 500 });
    }
};
