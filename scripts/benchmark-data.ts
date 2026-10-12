import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as schema from '../db/schema';
import { migrateDatabase } from './migrations';
import { loadDashboard, teamMembers } from '../src/lib/projectData';
import { createTeams, type StudentData } from '../src/lib/teamMatcher';

// Compare the issue's original query patterns using disposable synthetic data.
const dir = await mkdtemp(join(tmpdir(), 'taldebot-benchmark-'));
const client = createClient({ url: `file:${join(dir, 'benchmark.db')}` });
let queryCount = 0;
const db = drizzle(client, {
    schema,
    logger: {
        logQuery() {
            queryCount++;
        },
    },
});
try {
    await migrateDatabase(client);
    const projects = await db
        .insert(schema.projects)
        .values(
            Array.from({ length: 40 }, (_, index) => ({
                name: `Demo ${index}`,
                projectType: 'balanced' as const,
                numTeams: 20,
            })),
        )
        .returning();
    const skills = {
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
    };
    for (const project of projects) {
        const participants = await db
            .insert(schema.students)
            .values(
                Array.from({ length: 60 }, (_, index) => ({
                    projectId: project.id,
                    name: `Demo ${index}`,
                    hasCompleted: true,
                })),
            )
            .returning();
        for (const student of participants)
            await db
                .insert(schema.responses)
                .values({
                    ...skills,
                    projectId: project.id,
                    studentId: student.id,
                    comfort: [],
                    preferWith: [],
                    preferAvoid: [],
                });
        await db
            .insert(schema.teams)
            .values(
                Array.from({ length: 20 }, (_, index) => ({
                    projectId: project.id,
                    teamNumber: index + 1,
                    memberIds: participants
                        .slice(index * 3, index * 3 + 3)
                        .map((student) => student.id),
                    justification: 'Demo',
                })),
            );
    }
    async function measure(label: string, run: () => Promise<unknown>) {
        await run();
        const elapsed: number[] = [];
        let queries = 0;
        for (let index = 0; index < 5; index++) {
            queryCount = 0;
            const start = performance.now();
            await run();
            elapsed.push(performance.now() - start);
            queries = queryCount;
        }
        console.log(
            `${label}: ${queries} queries, ${elapsed.sort((a, b) => a - b)[2].toFixed(2)} ms median`,
        );
    }
    await measure('Dashboard before', async () => {
        const projects = await db.query.projects.findMany();
        await Promise.all(
            projects.map((project) =>
                db
                    .select({
                        total: sql<number>`sum(case when coalesce(${schema.students.isExcluded}, 0) = 0 then 1 else 0 end)`,
                        completed: sql<number>`sum(case when ${schema.students.hasCompleted} = 1 and coalesce(${schema.students.isExcluded}, 0) = 0 then 1 else 0 end)`,
                    })
                    .from(schema.students)
                    .where(eq(schema.students.projectId, project.id)),
            ),
        );
    });
    await measure('Dashboard after', () => loadDashboard(db));
    await measure('Teams before', async () => {
        await db.query.projects.findFirst({ where: eq(schema.projects.id, 1) });
        const teams = await db.query.teams.findMany({
            where: and(
                eq(schema.teams.projectId, 1),
                eq(schema.teams.algorithmVersion, 'v2'),
            ),
        });
        for (const team of teams) {
            const participants = await db.query.students.findMany({
                where: inArray(schema.students.id, team.memberIds),
            });
            const records = await db.query.responses.findMany({
                where: inArray(schema.responses.studentId, team.memberIds),
            });
            teamMembers(participants, records);
        }
    });
    await measure('Teams after', async () => {
        await db.query.projects.findFirst({ where: eq(schema.projects.id, 1) });
        const teams = await db.query.teams.findMany({
            where: and(
                eq(schema.teams.projectId, 1),
                eq(schema.teams.algorithmVersion, 'v2'),
            ),
        });
        const participants = await db.query.students.findMany({
            where: eq(schema.students.projectId, 1),
        });
        const records = await db.query.responses.findMany({
            where: eq(schema.responses.projectId, 1),
        });
        const members = teamMembers(participants, records);
        return teams.map((team) => team.memberIds.map((id) => members.get(id)));
    });
    const participants = await db.query.students.findMany();
    const records = await db.query.responses.findMany();
    const selected = participants.slice(0, 300);
    const responses = records.filter((record) =>
        selected.some((student) => record.studentId === student.id),
    );
    await measure('Generation before (300 students)', async () => {
        const data: StudentData[] = selected.map((student) => ({
            id: student.id,
            name: student.name,
            skills: responses.find(
                (response) => response.studentId === student.id,
            )!,
            comfort: [],
            preferWith: [],
            preferAvoid: [],
            isExcluded: false,
        }));
        return createTeams(data, 30, 'balanced', []);
    });
    await measure('Generation after (300 students)', async () => {
        const byStudent = new Map(
            responses.map((response) => [response.studentId, response]),
        );
        const data: StudentData[] = selected.map((student) => ({
            id: student.id,
            name: student.name,
            skills: byStudent.get(student.id)!,
            comfort: [],
            preferWith: [],
            preferAvoid: [],
            isExcluded: false,
        }));
        return createTeams(data, 30, 'balanced', []);
    });
} finally {
    client.close();
    await rm(dir, { recursive: true, force: true });
}
