import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { projects, students } from '../../../../db/schema';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

const projectSchema = z.object({
    name: z.string().min(1),
    numTeams: z.coerce.number().min(2).optional(),
    targetTeamSize: z.coerce.number().min(2).optional(),
    description: z.string().optional(),
    projectType: z.enum(['narrative', 'technical', 'management', 'balanced']),
    adminEmail: z.string().email(),
    studentList: z.string().optional(),
    studentsJson: z.string().optional(),
});

function generateAccessCode() {
    const digits = Math.floor(1000 + Math.random() * 9000).toString();
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const letter = letters.charAt(Math.floor(Math.random() * letters.length));
    return `${digits}${letter}`;
}

export const POST: APIRoute = async ({ request, redirect }) => {
    try {
        const formData = await request.formData();
        const data = projectSchema.parse(Object.fromEntries(formData.entries()));

        // Generate a unique access code
        let accessCode = generateAccessCode();
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
            const existing = await db.query.projects.findFirst({
                where: eq(projects.accessCode, accessCode),
            });
            if (!existing) {
                isUnique = true;
            } else {
                accessCode = generateAccessCode();
                attempts++;
            }
        }

        // 1. Create project
        const [project] = await db.insert(projects).values({
            name: data.name,
            numTeams: data.numTeams || null,
            targetTeamSize: data.targetTeamSize || null,
            description: data.description,
            projectType: data.projectType,
            adminEmail: data.adminEmail,
            accessCode: accessCode,
            status: 'active',
        }).returning();

        // 2. Handle students
        let studentToInsert: { name: string, email: string, projectId: number }[] = [];

        if (data.studentsJson) {
            const parsed = JSON.parse(data.studentsJson);
            studentToInsert = parsed.map((s: any) => ({
                name: s.name,
                email: s.email,
                projectId: project.id,
            }));
        } else if (data.studentList) {
            studentToInsert = data.studentList
                .split('\n')
                .map(name => name.trim())
                .filter(name => name.length > 0)
                .map(name => ({
                    name,
                    email: '',
                    projectId: project.id,
                }));
        }

        if (studentToInsert.length > 0) {
            await db.insert(students).values(studentToInsert);
        }

        return redirect('/admin/dashboard');
    } catch (error) {
        console.error('Project creation error:', error);
        return new Response('Invalid project data', { status: 400 });
    }
};
