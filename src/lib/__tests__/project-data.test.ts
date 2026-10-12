import { expect, it } from 'vitest';
import { projects, students, responses } from '../../../db/schema';
import { loadDashboard, teamMembers } from '../projectData';
import { testDatabase } from './testDatabase';

it('loads dashboard statistics in two queries, including empty projects and nullable absence flags', async () => {
    const fixture = await testDatabase();
    try {
        await fixture.db
            .insert(projects)
            .values(
                Array.from({ length: 20 }, (_, index) => ({
                    name: `Project ${index}`,
                    projectType: 'balanced' as const,
                })),
            );
        await fixture.db.insert(students).values([
            {
                projectId: 1,
                name: 'Complete',
                hasCompleted: true,
                isExcluded: null,
            },
            { projectId: 1, name: 'Pending', hasCompleted: false },
            {
                projectId: 1,
                name: 'Absent',
                hasCompleted: true,
                isExcluded: true,
            },
        ]);
        fixture.clearQueryCount();
        const result = await loadDashboard(fixture.db);
        expect(fixture.queryCount()).toBe(2);
        expect(result.find((project) => project.id === 1)).toMatchObject({
            totalStudents: 2,
            completedStudents: 1,
            percentage: 50,
        });
        expect(result.find((project) => project.id === 2)).toMatchObject({
            totalStudents: 0,
            completedStudents: 0,
            percentage: 0,
        });
        const members = teamMembers(
            await fixture.db.select().from(students),
            [],
        );
        expect(members.get(1)?.topSkills).toEqual([]);
    } finally {
        await fixture.close();
    }
});

it('keeps the original first-response policy for legacy duplicates in team summaries', async () => {
    const fixture = await testDatabase();
    try {
        await fixture.db.insert(projects).values({ name: 'Film', projectType: 'balanced' });
        await fixture.db.insert(students).values({ projectId: 1, name: 'Ane' });
        const response = {
            projectId: 1, studentId: 1,
            skillsNarrative: { creativity: 5, writing: 5, references: 5, communication: 5 },
            skillsTechnical: { camera: 9, sound: 5, editing: 5 },
            skillsManagement: { planning: 5, production: 5 },
            skillsSoft: { leadership: 5, listening: 5, proactivity: 5, teamwork: 5, motivation: 5, conflict: 5 },
            comfort: [], preferWith: [], preferAvoid: [],
        };
        await fixture.db.insert(responses).values([response, { ...response, skillsTechnical: { ...response.skillsTechnical, camera: 10 } }]);
        const members = teamMembers(await fixture.db.select().from(students), await fixture.db.select().from(responses));
        expect(members.get(1)?.topSkills.find(skill => skill.name === 'technical_camera')?.val).toBe(9);
    } finally { await fixture.close(); }
});
