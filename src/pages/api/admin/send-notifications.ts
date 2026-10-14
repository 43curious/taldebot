import { isArchivedProject } from '../../../lib/projectLifecycle';
import type { APIRoute } from 'astro';
import { parseId, routeError, InputError } from '../../../lib/input';
import { scoredSkills } from '../../../lib/skills';
import { requireProject } from '../../../lib/access';
import { db } from '../../../lib/db';
import {
    projects,
    students,
    confirmedAssignments,
} from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { sendTeamNotification } from '../../../lib/email';

export const POST: APIRoute = async ({ request, redirect, locals }) => {
    try {
        const projectId = parseId(
            new URL(request.url).searchParams.get('projectId'),
        );
        if (!projectId) throw new InputError('Invalid project ID');
        requireProject(locals.teacherAccess, projectId);
        const project = await db.query.projects.findFirst({
            where: eq(projects.id, projectId),
        });
        if (!project || isArchivedProject(project))
            throw new InputError('Proiektua ez dago erabilgarri.', 404);
        const assignment = await db.query.confirmedAssignments.findFirst({
            where: eq(confirmedAssignments.projectId, projectId),
            orderBy: (row, { desc }) => [desc(row.revision)],
        });
        if (!assignment?.inputSnapshot)
            throw new InputError(
                'Berretsi esleipena jakinarazpenak bidali aurretik.',
                409,
            );
        const participants = await db.query.students.findMany({
            where: eq(students.projectId, projectId),
        });
        const byId = new Map(
            participants.map((row) => [row.studentRecordId, row]),
        );
        for (const team of assignment.allocation) {
            for (const id of team.studentIds) {
                const student = byId.get(id);
                if (!student?.email) continue;
                const input = assignment.inputSnapshot.inputs.find(
                    (row) => row.studentId === id,
                );
                const topSkills = scoredSkills(input?.assessment ?? {})
                    .filter((skill) => skill.category !== 'skillsSoft')
                    .sort((a, b) => (b.val ?? 0) - (a.val ?? 0))
                    .slice(0, 3)
                    .map((skill) => skill.label);
                const result = await sendTeamNotification({
                    to: student.email,
                    studentName: student.name,
                    projectName: assignment.projectName,
                    teamNumber: team.teamNumber,
                    members: team.studentIds
                        .filter((peer) => peer !== id)
                        .map((peer) => byId.get(peer)?.name || 'Ikaslea'),
                    topSkills,
                });
                if (!result.success)
                    throw new Error('Notification delivery failed');
            }
        }
        await db
            .update(projects)
            .set({ status: 'completed' })
            .where(eq(projects.id, projectId));
        return redirect(`/admin/teams/${projectId}?notifications=sent`);
    } catch (error) {
        return routeError(error);
    }
};
