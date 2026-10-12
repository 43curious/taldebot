import type { APIRoute } from 'astro';
import { indexResponses } from '../../../lib/projectData';
import { db } from '../../../lib/db';
import {
    projects,
    students,
    responses,
    teamHistory,
} from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { createTeams, type StudentData } from '../../../lib/teamMatcher';
import { createTeamsV1 } from '../../../lib/teamMatcherV1';

import { parseId, routeError } from '../../../lib/input';
import { replaceTeams } from '../../../lib/projectOperations';

type AlgorithmVersion = 'v1' | 'v2';

function getRequestedAlgorithmVersion(requestUrl: string): AlgorithmVersion {
    const url = new URL(requestUrl);
    const version = url.searchParams.get('version');
    return version === 'v1' ? 'v1' : 'v2';
}

export const POST: APIRoute = async ({ request, redirect }) => {
    const url = new URL(request.url);
    const projectId = parseId(url.searchParams.get('projectId'));
    const algorithmVersion = getRequestedAlgorithmVersion(request.url);

    if (!projectId) {
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
        if (allStudents.length === 0) {
            return redirect(
                `/admin/teams/${projectId}?version=${algorithmVersion}&error=no-students`,
            );
        }

        const allResponses = await db.query.responses.findMany({
            where: eq(responses.projectId, projectId),
        });

        // 3. Fetch history
        const history = await db.query.teamHistory.findMany({
            where: eq(teamHistory.projectId, projectId),
        });

        // 4. Prepare data for the algorithm
        const responsesByStudent = indexResponses(allResponses);
        const studentDataList: StudentData[] = allStudents.map((student) => {
            const resp = responsesByStudent.get(student.id);

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
                        skillsNarrative: {
                            creativity: 5,
                            writing: 5,
                            references: 5,
                            communication: 5,
                        },
                        skillsTechnical: { camera: 5, sound: 5, editing: 5 },
                        skillsManagement: { planning: 5, production: 5 },
                        skillsSoft: {
                            leadership: 5,
                            listening: 5,
                            proactivity: 5,
                            teamwork: 5,
                            motivation: 5,
                            conflict: 5,
                        },
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
            const activeCount = studentDataList.filter(
                (s) => !s.isExcluded,
            ).length;
            numTeams = Math.max(
                2,
                Math.round(activeCount / project.targetTeamSize),
            );
        }

        if (!numTeams) {
            return new Response(
                'Project configuration missing team count or size',
                { status: 400 },
            );
        }

        // 6. Run requested algorithm version on persisted responses
        const generatedTeams =
            algorithmVersion === 'v1'
                ? createTeamsV1(
                      studentDataList,
                      numTeams,
                      project.projectType,
                      history,
                  )
                : createTeams(
                      studentDataList,
                      numTeams,
                      project.projectType,
                      history,
                  );

        await replaceTeams(db, projectId, algorithmVersion, generatedTeams);

        return redirect(
            `/admin/teams/${projectId}?version=${algorithmVersion}`,
        );
    } catch (error) {
        return routeError(error);
    }
};
