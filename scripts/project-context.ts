import { pathToFileURL } from 'node:url';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { projects, assessments, preferenceSubmissions } from '../db/schema';
import type { AppDatabase } from '../src/lib/db';
import { withDatabase, reportFailure } from './database';

const contextSchema = z.object({
    projectIds: z.array(z.number().int().positive()).min(1),
    academicPeriod: z
        .string()
        .regex(/^\d{4}-\d{4}$/)
        .refine(
            (value) => Number(value.slice(5)) === Number(value.slice(0, 4)) + 1,
        ),
    collectionYear: z.number().int().positive().max(20),
});

// Correct collection context without changing answers, dates or current enrollment.
export async function setProjectCollectionContext(
    db: AppDatabase,
    context: z.infer<typeof contextSchema>,
) {
    const input = contextSchema.parse(context);
    const ids = [...new Set(input.projectIds)];
    return db.transaction(async (tx) => {
        const selected = await tx
            .select({ id: projects.id })
            .from(projects)
            .where(inArray(projects.id, ids));
        if (selected.length !== ids.length)
            throw new Error(
                'One or more projects do not exist; no context changed',
            );
        const values = {
            academicPeriod: input.academicPeriod,
            collectionYear: input.collectionYear,
        };
        await tx.update(projects).set(values).where(inArray(projects.id, ids));
        await tx
            .update(assessments)
            .set(values)
            .where(inArray(assessments.projectId, ids));
        await tx
            .update(preferenceSubmissions)
            .set(values)
            .where(inArray(preferenceSubmissions.projectId, ids));
        return selected.length;
    });
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    withDatabase(async (db, _client, args) => {
        if (
            args.length !== 6 ||
            args[0] !== '--projects' ||
            args[2] !== '--period' ||
            args[4] !== '--year'
        )
            throw new Error(
                'Use --local|--remote --projects <ids> --period YYYY-YYYY --year <study-year>',
            );
        const count = await setProjectCollectionContext(db, {
            projectIds: args[1].split(',').map(Number),
            academicPeriod: args[3],
            collectionYear: Number(args[5]),
        });
        console.log(
            `Collection context updated for ${count} projects; original answers and enrollment retained.`,
        );
    }).catch(reportFailure);
}
