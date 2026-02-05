import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

const sqlite = new Database('sqlite.db');
const db = drizzle(sqlite, { schema });

async function seed() {
    console.log("🌱 Seeding test exclusion project (v2)...");

    // Clear previous TEST99 project if exists
    const existing = await db.query.projects.findFirst({
        where: eq(schema.projects.accessCode, "TEST99"),
    });
    if (existing) {
        console.log("🗑️ Deleting old TEST99 project...");
        await db.delete(schema.projects).where(eq(schema.projects.id, existing.id));
    }

    // 1. Create Project
    const [project] = await db.insert(schema.projects).values({
        name: "Test Social (Exclusión Realista)",
        description: "Alumnos con perfiles variados y un Mikel altamente rechazado pero técnico.",
        projectType: "balanced",
        numTeams: 3,
        targetTeamSize: 4,
        accessCode: "TEST99",
        status: "active",
        adminEmail: "admin@test.com"
    }).returning();

    const pid = project.id;

    // 2. Create 12 Students
    const names = [
        "Mikel (El Excluido)", "Ane", "Jon", "Sara", "Gorka", "Idoia",
        "Xabier", "Maite", "Eneko", "Nerea", "Oier", "Izaro"
    ];

    const insertedStudents = await db.insert(schema.students).values(
        names.map(name => ({
            name,
            email: `${name.toLowerCase().replace(/\s+/g, '')}@test.com`,
            projectId: pid,
            hasCompleted: true
        }))
    ).returning();

    const excluido = insertedStudents[0];
    const others = insertedStudents.slice(1);

    const getRandom = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    // 3. Create Responses
    const responseValues = insertedStudents.map((s, index) => {
        // Base skills with slight variation
        const b = () => getRandom(3, 6);
        const h = () => getRandom(7, 10);
        const l = () => getRandom(1, 4);

        let skills = {
            skillsNarrative: { creativity: b(), writing: b(), references: b(), communication: b() },
            skillsTechnical: { camera: b(), sound: b(), editing: b() },
            skillsManagement: { planning: b(), production: b() },
            skillsSoft: { leadership: b(), listening: b(), proactivity: b(), teamwork: b(), motivation: b(), conflict: b() }
        };

        if (s.id === excluido.id) {
            // Mikel is a technical beast but socially poor
            skills.skillsTechnical = { camera: 10, sound: 7, editing: 9 };
            skills.skillsSoft.teamwork = 2;
            skills.skillsSoft.conflict = 1;
        } else {
            // Randomly assign a profile to others
            const profiles = ['narrative', 'technical', 'management', 'soft'];
            const profile = profiles[index % profiles.length];

            if (profile === 'narrative') {
                skills.skillsNarrative = { creativity: h(), writing: h(), references: h(), communication: h() };
            } else if (profile === 'technical') {
                skills.skillsTechnical = { camera: h(), sound: h(), editing: h() };
            } else if (profile === 'management') {
                skills.skillsManagement = { planning: h(), production: h() };
                skills.skillsSoft.leadership = h();
            } else if (profile === 'soft') {
                skills.skillsSoft = { leadership: h(), listening: h(), proactivity: h(), teamwork: h(), motivation: h(), conflict: h() };
            }
        }

        let preferAvoid: number[] = [];
        let preferWith: number[] = [];
        let comfort: number[] = [];

        if (s.id !== excluido.id) {
            if (index < 9) {
                preferAvoid = [excluido.id];
            }
            const randomOthers = others.filter(o => o.id !== s.id);
            comfort = [randomOthers[0].id, randomOthers[1].id];
        } else {
            preferWith = [others[0].id];
            comfort = [others[0].id];
        }

        return {
            studentId: s.id,
            projectId: pid,
            ...skills,
            preferWith,
            preferAvoid,
            comfort
        };
    });

    await db.insert(schema.responses).values(responseValues);

    console.log("✅ Seed complete!");
    console.log("Access Code: TEST99");
    console.log(`Mikel (ID: ${excluido.id}) is technical-heavy and socially rejected.`);
}

seed().catch(console.error);
