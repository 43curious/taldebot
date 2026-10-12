import { eq } from 'drizzle-orm';
import { classes, degrees, projects, students, responses } from '../db/schema';
import {
    resolveStudent,
    enrollStudent,
    academicPeriod,
} from '../src/lib/studentIdentity';
import { saveKnowledge } from '../src/lib/studentUpdates';
import { withDatabase, reportFailure } from './database';

// Synthetic, deterministic, and local-only. Reruns leave an existing demo untouched.
withDatabase(async (db, _client, args) => {
    if (process.argv[2] !== '--local' || args.length)
        throw new Error('Demo seeding requires --local');
    await db.transaction(async (tx) => {
        if (
            await tx.query.projects.findFirst({
                where: eq(projects.accessCode, '1234D'),
            })
        ) {
            console.log('Demo already exists; no changes.');
            return;
        }
        const [degree] = await tx
            .insert(degrees)
            .values({ name: 'Demo' })
            .onConflictDoNothing()
            .returning();
        const degreeId =
            degree?.id ??
            (await tx.query.degrees.findFirst({
                where: eq(degrees.name, 'Demo'),
            }))!.id;
        const [group] = await tx
            .insert(classes)
            .values({ name: 'Demo', year: 1, degreeId })
            .onConflictDoNothing()
            .returning();
        const classId =
            group?.id ??
            (await tx.query.classes.findFirst({
                where: (row, { and, eq }) =>
                    and(eq(row.degreeId, degreeId), eq(row.name, 'Demo')),
            }))!.id;
        const [project] = await tx
            .insert(projects)
            .values({
                academicPeriod: academicPeriod(),
                name: 'Demo proiektua',
                projectType: 'balanced',
                numTeams: 2,
                status: 'active',
                accessCode: '1234D',
                adminEmail: 'teacher@example.com',
            })
            .returning();
        for (let index = 1; index <= 8; index++) {
            const name = `Demo ${index}`;
            const email = `demo${index}@example.com`;
            const person = await resolveStudent(tx, { name, email });
            await enrollStudent(tx, person, classId, academicPeriod());
            const [student] = await tx
                .insert(students)
                .values({
                    projectId: project.id,
                    studentRecordId: person.id,
                    name,
                    email,
                    hasCompleted: true,
                })
                .returning();
            const score = 3 + (index % 7);
            const [response] = await tx
                .insert(responses)
                .values({
                    projectId: project.id,
                    studentId: student.id,
                    skillsNarrative: {
                        creativity: score,
                        writing: 5,
                        references: 5,
                        communication: 5,
                    },
                    skillsTechnical: { camera: score, sound: 5, editing: 5 },
                    skillsManagement: { planning: 5, production: score },
                    skillsSoft: {
                        leadership: 5,
                        listening: 5,
                        proactivity: 5,
                        teamwork: 5,
                        motivation: 5,
                        conflict: 5,
                    },
                    comfort: [],
                    preferWith: [],
                    preferAvoid: [],
                })
                .returning();
            await saveKnowledge(tx, {
                studentId: person.id,
                assessment: {
                    skillsNarrative: response.skillsNarrative,
                    skillsTechnical: response.skillsTechnical,
                    skillsManagement: response.skillsManagement,
                    skillsSoft: response.skillsSoft,
                },
                preferences: { comfort: [], preferWith: [], preferAvoid: [] },
                scope: 'project',
                academicPeriod: academicPeriod(),
                projectId: project.id,
                projectName: project.name,
                source: 'demo',
                legacyResponseId: response.id,
                legacyParticipantId: student.id,
            });
        }
        console.log('Demo created. Access code: 1234D');
    });
}).catch(reportFailure);
