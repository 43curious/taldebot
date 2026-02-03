import { db } from '../src/lib/db';
import { projects, students, responses, teamHistory } from './schema';
import { createTeams, type StudentData } from '../src/lib/teamMatcher';

async function seed() {
    console.log('Seeding database...');

    // 1. Create a sample project
    const [project] = await db.insert(projects).values({
        name: 'Film Production Q1',
        description: 'First quarter film project for senior students.',
        numTeams: 5,
        projectType: 'technical',
        status: 'active',
        adminEmail: 'admin@example.com',
    }).returning();

    console.log(`Created project: ${project.name}`);

    // 2. Create sample students
    const studentNames = [
        'Alice Smith', 'Bob Johnson', 'Charlie Brown', 'Diana Prince', 'Ethan Hunt',
        'Fiona Apple', 'George Miller', 'Hannah Baker', 'Ian Somerhalder', 'Jack Reacher',
        'Karen Gillan', 'Liam Neeson', 'Mia Wallace', 'Noah Centineo', 'Olivia Rodrigo',
        'Peter Parker', 'Quinn Fabray', 'Riley Reid', 'Sarah Connor', 'Tony Stark'
    ];

    const studentEntities = [];
    for (const name of studentNames) {
        const [s] = await db.insert(students).values({
            projectId: project.id,
            name,
            email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
            hasCompleted: true,
        }).returning();
        studentEntities.push(s);
    }

    // 3. Create responses with varied skills
    const studentDataForAlgorithm: StudentData[] = [];

    for (const student of studentEntities) {
        const responseData = {
            skillsNarrative: {
                creativity: Math.floor(Math.random() * 10) + 1,
                writing: Math.floor(Math.random() * 10) + 1,
                references: Math.floor(Math.random() * 10) + 1,
                communication: Math.floor(Math.random() * 10) + 1,
            },
            skillsTechnical: {
                camera: Math.floor(Math.random() * 10) + 1,
                sound: Math.floor(Math.random() * 10) + 1,
                editing: Math.floor(Math.random() * 10) + 1,
            },
            skillsManagement: {
                planning: Math.floor(Math.random() * 10) + 1,
                production: Math.floor(Math.random() * 10) + 1,
            },
            skillsSoft: {
                leadership: Math.floor(Math.random() * 10) + 1,
                listening: Math.floor(Math.random() * 10) + 1,
                proactivity: Math.floor(Math.random() * 10) + 1,
                teamwork: Math.floor(Math.random() * 10) + 1,
                motivation: Math.floor(Math.random() * 10) + 1,
                conflict: Math.floor(Math.random() * 10) + 1,
            },
            preferWith: [], // Will populate below
            preferAvoid: [],
            comfort: [],
        };

        await db.insert(responses).values({
            studentId: student.id,
            projectId: project.id,
            ...responseData,
        });

        studentDataForAlgorithm.push({
            id: student.id,
            name: student.name,
            skills: responseData,
            preferWith: [],
            preferAvoid: [],
            comfort: [],
        });
    }

    // 4. Add some history and preferences
    await db.insert(teamHistory).values([
        { projectId: project.id, student1Id: studentEntities[0].id, student2Id: studentEntities[1].id },
        { projectId: project.id, student1Id: studentEntities[2].id, student2Id: studentEntities[3].id },
    ]);

    // Update a few preferences for testing
    studentDataForAlgorithm[0].preferWith = [studentEntities[2].id];
    studentDataForAlgorithm[2].preferAvoid = [studentEntities[0].id];

    console.log('Running team creation algorithm...');
    const teams = createTeams(studentDataForAlgorithm, project.numTeams, project.projectType, [
        { student1Id: studentEntities[0].id, student2Id: studentEntities[1].id },
        { student1Id: studentEntities[2].id, student2Id: studentEntities[3].id },
    ]);

    console.log('Teams generated:');
    teams.forEach(t => {
        console.log(`Team ${t.teamNumber}: ${t.members.map(m => m.name).join(', ')}`);
        console.log(`Justification: ${t.justification.substring(0, 100)}...`);
    });

    console.log('Seed complete!');
}

seed().catch(console.error);
