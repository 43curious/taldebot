import type { APIRoute } from 'astro';
import { parseId, routeError } from '../../../lib/input';
import { indexResponses } from '../../../lib/projectData';
import { db } from '../../../lib/db';
import {
    projects,
    students,
    responses,
    teams,
    confirmedAssignments,
} from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { scoredSkills } from '../../../lib/skills';
import * as XLSX from 'xlsx';
import { entryLabel } from '../../../lib/entryProvenance';

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

        const allStudents = await db.query.students.findMany({
            where: eq(students.projectId, projectId),
        });

        const allResponses = await db.query.responses.findMany({
            where: eq(responses.projectId, projectId),
        });

        const allTeams = await db.query.teams.findMany({
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
            allTeams.length &&
            allTeams.every((team) => team.draftId === adopted.draftId)
                ? `Berretsia · ${adopted.revision}. berrikuspena`
                : 'Zirriborroa';
        const studentMap = new Map(allStudents.map((s) => [s.id, s.name]));

        const responseMap = indexResponses(allResponses);
        const teamMap = new Map<number, typeof teams.$inferSelect>();
        for (const team of allTeams) {
            for (const id of team.memberIds)
                if (!teamMap.has(id)) teamMap.set(id, team);
        }

        // --- SHEET 1: Detailed Responses (All Students) ---
        const studentRows = allStudents.map((student) => {
            const resp = responseMap.get(student.id);
            const team = teamMap.get(student.id);

            let average = 0;
            if (resp) {
                const allSkills = [
                    ...Object.values(resp.skillsNarrative),
                    ...Object.values(resp.skillsTechnical),
                    ...Object.values(resp.skillsManagement),
                    ...Object.values(resp.skillsSoft),
                ];
                average =
                    allSkills.reduce((a, b) => a + b, 0) / allSkills.length;
            }

            // Algorithm justification for this specific student
            // We search for the student's name in the team justification block
            let personalJustification = 'Datirik gabe (inkesta ez du bete)';
            if (team && team.justification) {
                const lines = team.justification.split('\n');
                const studentLine = lines.find((l) =>
                    l.startsWith(`${student.name} assigned:`),
                );
                if (studentLine) {
                    personalJustification = studentLine.replace(
                        `${student.name} assigned: `,
                        '',
                    );
                } else if (resp) {
                    personalJustification =
                        'Talde honetan esleitua (arrazoi zehatzik gabe)';
                }
            }

            return {
                Ikaslea: student.name,
                Email: student.email || '---',
                Egoera: student.hasCompleted ? 'Osatuta' : 'Zain',
                'Erantzunaren jatorria': resp
                    ? entryLabel(resp.entryProvenance)
                    : '',
                'Sartu duen irakaslea':
                    resp?.entryProvenance?.kind === 'teacher'
                        ? resp.entryProvenance.teacherName
                        : '',
                Absent: student.isExcluded ? 'BAI' : 'EZ',
                Taldea: team?.teamNumber || 'Esleitu gabe',
                Gustukoak: resp
                    ? resp.preferWith
                          .map((id) => studentMap.get(id) || id)
                          .join(', ')
                    : '---',
                Saihestu: resp
                    ? resp.preferAvoid
                          .map((id) => studentMap.get(id) || id)
                          .join(', ')
                    : '---',
                Ezagunak: resp
                    ? resp.comfort
                          .map((id) => studentMap.get(id) || id)
                          .join(', ')
                    : '---',
                ...Object.fromEntries(
                    scoredSkills(resp ?? {}).map((skill) => [
                        skill.label,
                        skill.val ?? 'Ezezaguna',
                    ]),
                ),
                'Media Orokorra': average > 0 ? average.toFixed(2) : '---',
                'Algoritmoaren Arrazoia': personalJustification,
            };
        });

        // --- SHEET 2: Team Composition & Logic ---
        const teamRows = allTeams.map((t) => {
            const memberNames = t.memberIds
                .map((id) => studentMap.get(id))
                .join(', ');

            // The justification contains:
            // 1. Team summary (averages)
            // 2. Individual assignment reasons
            return {
                Egoera: assignmentStatus,
                Taldea: t.teamNumber,
                Kideak: memberNames,
                'Algoritmoaren Azalpena': t.justification,
            };
        });

        // Create Workbook
        const wb = XLSX.utils.book_new();

        const wsStudents = XLSX.utils.json_to_sheet(studentRows);
        XLSX.utils.book_append_sheet(wb, wsStudents, 'Erantzun Zehatzak');

        const wsTeams = XLSX.utils.json_to_sheet(teamRows);
        XLSX.utils.book_append_sheet(wb, wsTeams, 'Taldeen Osaketa');

        // Generate Buffer
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type':
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="proiektua-${project.name.replace(/\s+/g, '-').toLowerCase()}.xlsx"`,
            },
        });
    } catch (error) {
        return routeError(error);
    }
};
