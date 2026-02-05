import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { projects, students, responses, teams } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const projectId = parseInt(url.searchParams.get('projectId') || '');

    if (isNaN(projectId)) {
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
            where: eq(teams.projectId, projectId),
            orderBy: (teams, { asc }) => [asc(teams.teamNumber)],
        });

        const studentMap = new Map(allStudents.map(s => [s.id, s.name]));

        // --- SHEET 1: Detailed Responses (All Students) ---
        const studentRows = allStudents.map(student => {
            const resp = allResponses.find(r => r.studentId === student.id);
            const team = allTeams.find(t => t.memberIds.includes(student.id));

            let average = 0;
            if (resp) {
                const allSkills = [
                    ...Object.values(resp.skillsNarrative),
                    ...Object.values(resp.skillsTechnical),
                    ...Object.values(resp.skillsManagement),
                    ...Object.values(resp.skillsSoft)
                ];
                average = allSkills.reduce((a, b) => a + b, 0) / allSkills.length;
            }

            // Algorithm justification for this specific student
            // We search for the student's name in the team justification block
            let personalJustification = "Datirik gabe (inkesta ez du bete)";
            if (team && team.justification) {
                const lines = team.justification.split('\n');
                const studentLine = lines.find(l => l.startsWith(`${student.name} assigned:`));
                if (studentLine) {
                    personalJustification = studentLine.replace(`${student.name} assigned: `, "");
                } else if (resp) {
                    personalJustification = "Talde honetan esleitua (arrazoi zehatzik gabe)";
                }
            }

            return {
                "Ikaslea": student.name,
                "Email": student.email || "---",
                "Egoera": student.hasCompleted ? "Osatuta" : "Zain",
                "Absent": student.isExcluded ? "BAI" : "EZ",
                "Taldea": team?.teamNumber || "Esleitu gabe",
                "Gustukoak": resp ? resp.preferWith.map(id => studentMap.get(id) || id).join(', ') : "---",
                "Saihestu": resp ? resp.preferAvoid.map(id => studentMap.get(id) || id).join(', ') : "---",
                "Ezagunak": resp ? resp.comfort.map(id => studentMap.get(id) || id).join(', ') : "---",
                "Sormena": resp?.skillsNarrative.creativity || 0,
                "Idazketa": resp?.skillsNarrative.writing || 0,
                "Erreferentziak": resp?.skillsNarrative.references || 0,
                "Komunikazioa": resp?.skillsNarrative.communication || 0,
                "Kamera": resp?.skillsTechnical.camera || 0,
                "Soinua": resp?.skillsTechnical.sound || 0,
                "Edizioa": resp?.skillsTechnical.editing || 0,
                "Plangintza": resp?.skillsManagement.planning || 0,
                "Ekoizpena": resp?.skillsManagement.production || 0,
                "Lidergoa": resp?.skillsSoft.leadership || 0,
                "Entzumena": resp?.skillsSoft.listening || 0,
                "Ekimen-gaitasuna": resp?.skillsSoft.proactivity || 0,
                "Talde-lana": resp?.skillsSoft.teamwork || 0,
                "Motibazioa": resp?.skillsSoft.motivation || 0,
                "Gatazkak": resp?.skillsSoft.conflict || 0,
                "Media Orokorra": average > 0 ? average.toFixed(2) : "---",
                "Algoritmoaren Arrazoia": personalJustification
            };
        });

        // --- SHEET 2: Team Composition & Logic ---
        const teamRows = allTeams.map(t => {
            const memberNames = t.memberIds.map(id => studentMap.get(id)).join(', ');

            // The justification contains: 
            // 1. Team summary (averages)
            // 2. Individual assignment reasons
            return {
                "Taldea": t.teamNumber,
                "Kideak": memberNames,
                "Algoritmoaren Azalpena": t.justification
            };
        });

        // Create Workbook
        const wb = XLSX.utils.book_new();

        const wsStudents = XLSX.utils.json_to_sheet(studentRows);
        XLSX.utils.book_append_sheet(wb, wsStudents, "Erantzun Zehatzak");

        const wsTeams = XLSX.utils.json_to_sheet(teamRows);
        XLSX.utils.book_append_sheet(wb, wsTeams, "Taldeen Osaketa");

        // Generate Buffer
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="proiektua-${project.name.replace(/\s+/g, '-').toLowerCase()}.xlsx"`,
            },
        });
    } catch (error) {
        console.error('Export error:', error);
        return new Response('Error exporting project data', { status: 500 });
    }
};
