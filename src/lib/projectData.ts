import { sql } from 'drizzle-orm';
import { students, responses } from '../../db/schema';
import type { AppDatabase } from './db';
import { scoredSkills } from './skills';

export async function loadDashboard(db: AppDatabase) {
    const [projects, counts] = await Promise.all([
        db.query.projects.findMany({
            orderBy: (row, { desc }) => [desc(row.createdAt)],
        }),
        db
            .select({
                projectId: students.projectId,
                total: sql<number>`sum(case when coalesce(${students.isExcluded}, 0) = 0 then 1 else 0 end)`,
                completed: sql<number>`sum(case when ${students.hasCompleted} = 1 and coalesce(${students.isExcluded}, 0) = 0 then 1 else 0 end)`,
            })
            .from(students)
            .groupBy(students.projectId),
    ]);
    const byProject = new Map(counts.map((count) => [count.projectId, count]));
    return projects.map((project) => {
        const count = byProject.get(project.id);
        const totalStudents = count?.total ?? 0;
        const completedStudents = count?.completed ?? 0;
        return {
            ...project,
            totalStudents,
            completedStudents,
            percentage: totalStudents
                ? Math.round((completedStudents / totalStudents) * 100)
                : 0,
        };
    });
}

// Preserve the first matching row used by the former .find() lookups.
export function indexResponses(records: (typeof responses.$inferSelect)[]) {
    const index = new Map<number | null, typeof responses.$inferSelect>();
    for (const response of records) {
        if (!index.has(response.studentId)) index.set(response.studentId, response);
    }
    return index;
}

export function teamMembers(
    participants: (typeof students.$inferSelect)[],
    records: (typeof responses.$inferSelect)[],
) {
    const responsesByStudent = indexResponses(records);
    return new Map(
        participants.map((student) => {
            const response = responsesByStudent.get(student.id);
            const topSkills = response
                ? scoredSkills(response)
                      .filter(
                          (skill) =>
                              skill.category !== 'skillsSoft' &&
                              skill.val !== undefined,
                      )
                      .sort((a, b) => b.val! - a.val!)
                      .slice(0, 3)
                : [];
            return [student.id, { ...student, topSkills }];
        }),
    );
}
export type TeamMember =
    ReturnType<typeof teamMembers> extends Map<number, infer Member>
        ? Member
        : never;
