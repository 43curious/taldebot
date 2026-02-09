import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { students, responses } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const submissionSchema = z.object({
    projectId: z.coerce.number(),
    studentId: z.coerce.number(),
    lang: z.string().optional().default('eu'),
    comfort: z.string().transform(val => JSON.parse(val) as number[]),
    preferWith: z.string().transform(val => JSON.parse(val) as number[]),
    preferAvoid: z.string().transform(val => JSON.parse(val) as number[]),
    narrative_creativity: z.coerce.number(),
    narrative_writing: z.coerce.number(),
    narrative_references: z.coerce.number(),
    narrative_communication: z.coerce.number(),
    technical_camera: z.coerce.number(),
    technical_sound: z.coerce.number(),
    technical_editing: z.coerce.number(),
    management_planning: z.coerce.number(),
    management_production: z.coerce.number(),
    soft_leadership: z.coerce.number(),
    soft_listening: z.coerce.number(),
    soft_proactivity: z.coerce.number(),
    soft_teamwork: z.coerce.number(),
    soft_motivation: z.coerce.number(),
    soft_conflict: z.coerce.number(),
    email: z.string().email(),
});

export const POST: APIRoute = async ({ request, redirect }) => {
    try {
        const formData = await request.formData();
        const data = submissionSchema.parse(Object.fromEntries(formData.entries()));

        // Check if student already completed
        const student = await db.query.students.findFirst({
            where: and(eq(students.id, data.studentId), eq(students.projectId, data.projectId)),
        });

        if (!student || student.hasCompleted) {
            return new Response('Student not found or already completed', { status: 400 });
        }

        // Save response
        await db.insert(responses).values({
            studentId: data.studentId,
            projectId: data.projectId,
            skillsNarrative: {
                creativity: data.narrative_creativity,
                writing: data.narrative_writing,
                references: data.narrative_references,
                communication: data.narrative_communication,
            },
            skillsTechnical: {
                camera: data.technical_camera,
                sound: data.technical_sound,
                editing: data.technical_editing,
            },
            skillsManagement: {
                planning: data.management_planning,
                production: data.management_production,
            },
            skillsSoft: {
                leadership: data.soft_leadership,
                listening: data.soft_listening,
                proactivity: data.soft_proactivity,
                teamwork: data.soft_teamwork,
                motivation: data.soft_motivation,
                conflict: data.soft_conflict,
            },
            preferWith: data.preferWith,
            preferAvoid: data.preferAvoid,
            comfort: data.comfort,
        });

        // Mark student as completed and save email
        await db.update(students)
            .set({
                hasCompleted: true,
                email: data.email
            })
            .where(eq(students.id, data.studentId));

        // Redirect based on language
        const confirmationPath = data.lang === 'en' ? '/en/student/confirmation' : '/student/confirmation';
        return redirect(confirmationPath);
    } catch (error) {
        console.error('Submission error:', error);
        return new Response('Invalid form data', { status: 400 });
    }
};

