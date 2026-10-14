import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { withDatabase, reportFailure } from './database';
import { teachingAccess, canReadStudent } from '../src/lib/access';
import { loadStudentProfiles } from '../src/lib/studentProfiles';
import { loadDashboard } from '../src/lib/projectData';

// Read-only database measurements. No identities, SQL parameters or credentials are printed.
withDatabase(async (_db, client, args) => {
    if (args.length !== 4 || args[0] !== '--class' || args[2] !== '--samples')
        throw new Error('Use --remote --class <id> --samples <5–100>');
    const classId = Number(args[1]),
        samples = Number(args[3]);
    if (
        !Number.isSafeInteger(classId) ||
        classId < 1 ||
        !Number.isInteger(samples) ||
        samples < 5 ||
        samples > 100
    )
        throw new Error('Invalid class or sample count');
    let queries = 0,
        rows = 0,
        bytes = 0,
        queryMs = 0;
    const measured = new Proxy(client, {
        get(target, key) {
            if (key === 'execute')
                return async (
                    statement: Parameters<typeof client.execute>[0],
                ) => {
                    const start = performance.now();
                    const result = await target.execute(statement);
                    queries++;
                    queryMs += performance.now() - start;
                    rows += result.rows.length;
                    bytes += Buffer.byteLength(JSON.stringify(result.rows));
                    return result;
                };
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    const db = drizzle(measured, { schema });
    const people = await db.query.classMembers.findMany({
        columns: { studentRecordId: true },
        where: eq(schema.classMembers.classId, classId),
    });
    const ids = [
        ...new Set(
            people.flatMap((p) =>
                p.studentRecordId ? [p.studentRecordId] : [],
            ),
        ),
    ];
    const actors = await db.query.users.findMany({
        columns: { id: true, role: true },
    });
    console.log(
        JSON.stringify({
            classMembers: ids.length,
            samples,
            target: process.argv[2] === '--remote' ? 'remote' : 'local',
            source: 'database only; excludes hosting, session storage and browser',
        }),
    );
    for (const actor of actors)
        for (const view of ['access', 'dashboard', 'graph', 'report']) {
            const timings: number[] = [];
            let stats = {};
            for (let n = 0; n < samples; n++) {
                queries = 0;
                rows = 0;
                bytes = 0;
                queryMs = 0;
                const start = performance.now();
                const access = await teachingAccess(db, actor);
                const visible = ids.filter((id) => canReadStudent(access, id));
                if (view === 'dashboard') await loadDashboard(db, access);
                if (view === 'graph')
                    await loadStudentProfiles(db, access, visible, {
                        relationshipView: 'latest-recorded',
                    });
                if (view === 'report')
                    await loadStudentProfiles(db, access, visible.slice(0, 1), {
                        relationshipView: 'latest-recorded',
                    });
                timings.push(performance.now() - start);
                stats = {
                    queries,
                    rows,
                    rowJsonBytes: bytes,
                    sumQueryMs: Math.round(queryMs),
                    visibleMembers: visible.length,
                };
            }
            timings.sort((a, b) => a - b);
            console.log(
                JSON.stringify({
                    role: actor.role,
                    view,
                    ...stats,
                    medianMs: Math.round(timings[Math.floor(samples / 2)]),
                    p95Ms: Math.round(timings[Math.ceil(samples * 0.95) - 1]),
                }),
            );
        }
}).catch(reportFailure);
