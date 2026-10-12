import { expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateDatabase } from './migrations';

it('initializes every table, preserves existing rows and v2 labels, and records the baseline once', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'taldebot-migrations-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    try {
        await migrateDatabase(client);
        await client.execute(
            "INSERT INTO projects (name, project_type) VALUES ('Film', 'balanced')",
        );
        await client.execute(
            "INSERT INTO teams (project_id, team_number, member_ids, justification, algorithm_version) VALUES (1, 1, '[]', 'keep', 'v2')",
        );
        await client.execute('DROP TABLE __drizzle_migrations');
        await migrateDatabase(client);
        await migrateDatabase(client);
        expect(
            (
                await client.execute(
                    'SELECT algorithm_version, justification FROM teams',
                )
            ).rows,
        ).toMatchObject([{ algorithm_version: 'v2', justification: 'keep' }]);
        expect(
            (await client.execute('SELECT * FROM __drizzle_migrations')).rows,
        ).toHaveLength(1);
        expect(
            (await client.execute('PRAGMA foreign_key_check')).rows,
        ).toHaveLength(0);
    } finally {
        client.close();
        await rm(dir, { recursive: true, force: true });
    }
});

it('marks only pre-version teams as v1 and rolls back unsupported legacy adoption', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'taldebot-legacy-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    try {
        await client.execute(
            'CREATE TABLE teams (id INTEGER PRIMARY KEY, project_id INTEGER, team_number INTEGER NOT NULL, member_ids TEXT NOT NULL, justification TEXT NOT NULL, created_at TEXT)',
        );
        await client.execute(
            "INSERT INTO teams VALUES (1, NULL, 1, '[]', 'legacy', NULL)",
        );
        await migrateDatabase(client);
        expect(
            (await client.execute('SELECT algorithm_version FROM teams'))
                .rows[0].algorithm_version,
        ).toBe('v1');
        await client.execute('DROP TABLE __drizzle_migrations');
        await client.execute(
            'ALTER TABLE projects RENAME COLUMN project_type TO unsupported_type',
        );
        await expect(migrateDatabase(client)).rejects.toThrow(
            'Unsupported legacy schema',
        );
        expect(
            (
                await client.execute(
                    "SELECT name FROM sqlite_master WHERE name='__drizzle_migrations'",
                )
            ).rows,
        ).toHaveLength(0);
    } finally {
        client.close();
        await rm(dir, { recursive: true, force: true });
    }
});
