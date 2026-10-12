import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { drizzle } from 'drizzle-orm/libsql';
import type { Client } from '@libsql/client';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { backfillTracking } from './migrate-tracking';
import { migrateClasses } from './migrate-classes.mjs';

const migrationsFolder = fileURLToPath(
    new URL('../db/migrations', import.meta.url),
);

// Adopt known pre-migration installations without replacing their tables or data.
// Later schema changes use generated Drizzle migrations and its migration journal.
export async function migrateDatabase(client: Client) {
    const [baseline] = readMigrationFiles({ migrationsFolder });
    const tx = await client.transaction('write');
    try {
        await tx.execute(
            'CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)',
        );
        const applied = await tx.execute(
            'SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at LIMIT 1',
        );
        if (applied.rows.length) {
            if (applied.rows[0].hash !== baseline.hash)
                throw new Error(
                    'Baseline migration has changed; restore the committed migration',
                );
        } else {
            await migrateClasses(tx, tx);
            const tables = baseline.sql.filter((statement) =>
                statement.trim().startsWith('CREATE TABLE'),
            );
            for (const statement of tables)
                await tx.execute(
                    statement.replace(
                        'CREATE TABLE',
                        'CREATE TABLE IF NOT EXISTS',
                    ),
                );
            const additions: Record<string, Record<string, string>> = {
                projects: { target_team_size: 'integer', access_code: 'text' },
                students: { is_excluded: 'integer DEFAULT false' },
                teams: { algorithm_version: "text DEFAULT 'v2'" },
                users: { full_name: 'text', email: 'text' },
                class_members: {
                    national_id: 'text',
                    tutor: 'text',
                    town: 'text',
                    academic_status: 'text',
                    erasmus: 'text',
                    dual: 'text',
                    notes: 'text',
                },
            };
            for (const [table, columns] of Object.entries(additions)) {
                const existing = new Set(
                    (await tx.execute(`PRAGMA table_info(${table})`)).rows.map(
                        (row) => row.name,
                    ),
                );
                for (const [column, definition] of Object.entries(columns)) {
                    if (existing.has(column)) continue;
                    await tx.execute(
                        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
                    );
                    // Only teams predating the version column are historical v1 teams.
                    if (table === 'teams')
                        await tx.execute(
                            "UPDATE teams SET algorithm_version = 'v1'",
                        );
                }
            }
            for (const statement of baseline.sql.filter((statement) =>
                statement.trim().startsWith('CREATE UNIQUE INDEX'),
            )) {
                await tx.execute(
                    statement.replace(
                        'CREATE UNIQUE INDEX',
                        'CREATE UNIQUE INDEX IF NOT EXISTS',
                    ),
                );
            }
            const snapshot = JSON.parse(
                readFileSync(
                    new URL(
                        '../db/migrations/meta/0000_snapshot.json',
                        import.meta.url,
                    ),
                    'utf8',
                ),
            ) as {
                tables: Record<
                    string,
                    { columns: Record<string, { type: string }> }
                >;
            };
            for (const [table, expected] of Object.entries(snapshot.tables)) {
                const columns = new Map(
                    (await tx.execute(`PRAGMA table_info(${table})`)).rows.map(
                        (row) => [row.name, String(row.type).toLowerCase()],
                    ),
                );
                for (const [name, column] of Object.entries(expected.columns)) {
                    if (columns.get(name) !== column.type)
                        throw new Error(
                            `Unsupported legacy schema: ${table}.${name}; no baseline changes applied`,
                        );
                }
            }
            if ((await tx.execute('PRAGMA foreign_key_check')).rows.length)
                throw new Error('Migration would break foreign keys');
            await tx.execute({
                sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
                args: [baseline.hash, baseline.folderMillis],
            });
        }
        await tx.commit();
    } catch (error) {
        await tx.rollback();
        throw error;
    } finally {
        tx.close();
    }
    await migrate(drizzle(client), { migrationsFolder });
    await backfillTracking(client);
}
