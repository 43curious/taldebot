import { expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateDatabase } from './migrations';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { fileURLToPath } from 'node:url';

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
        ).toHaveLength(6);
        expect(
            (await client.execute('PRAGMA foreign_key_check')).rows,
        ).toHaveLength(0);
    } finally {
        client.close();
        await rm(dir, { recursive: true, force: true });
    }
});

it('upgrades existing archives without inventing their prior state or reactivating old invitations', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'taldebot-archive-migration-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    try {
        const migrations = readMigrationFiles({
            migrationsFolder: fileURLToPath(
                new URL('../db/migrations', import.meta.url),
            ),
        });
        await client.execute(
            'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)',
        );
        for (const migration of migrations.slice(0, 3)) {
            for (const statement of migration.sql)
                await client.execute(statement);
            await client.execute({
                sql: 'INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)',
                args: [migration.hash, migration.folderMillis],
            });
        }
        await client.execute(
            "INSERT INTO users(id,username,hashed_password,role) VALUES (1,'master','unused','master')",
        );
        await client.execute(
            "INSERT INTO student_records(id,name) VALUES (1,'Ane')",
        );
        await client.execute(
            "INSERT INTO projects(id,name,project_type,status) VALUES (1,'Active','balanced','active'),(2,'Old archive','balanced','archived')",
        );
        for (const [id, projectId, consumedAt] of [
            [1, 1, null],
            [2, 2, null],
            [3, 2, '2026-01-01'],
        ] as const)
            await client.execute({
                sql: "INSERT INTO update_requests(id,student_id,issued_by,project_id,scope,academic_period,assessment_asked,preferences_asked,token_hash,created_at,expires_at,consumed_at) VALUES (?,1,1,?,'project','2025-2026',1,1,?,'2026-01-01','2099-01-01',?)",
                args: [id, projectId, `hash-${id}`, consumedAt],
            });
        await migrateDatabase(client);
        const rows = (
            await client.execute(
                'SELECT id,status,status_before_archive,archived_at FROM projects ORDER BY id',
            )
        ).rows;
        expect(rows).toEqual([
            {
                id: 1,
                status: 'active',
                status_before_archive: null,
                archived_at: null,
            },
            {
                id: 2,
                status: 'archived',
                status_before_archive: null,
                archived_at: null,
            },
        ]);
        const invitations = (
            await client.execute(
                'SELECT id,revoked_at,consumed_at FROM update_requests ORDER BY id',
            )
        ).rows;
        expect(invitations[0].revoked_at).toBeNull();
        expect(invitations[1].revoked_at).not.toBeNull();
        expect(invitations[2]).toEqual({
            id: 3,
            revoked_at: null,
            consumed_at: '2026-01-01',
        });
        await migrateDatabase(client);
        expect(
            (
                await client.execute(
                    'SELECT id,revoked_at,consumed_at FROM update_requests ORDER BY id',
                )
            ).rows,
        ).toEqual(invitations);
        expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual(
            [],
        );
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

it('upgrades shared locations conservatively and preserves teacher clears on migration reruns', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'taldebot-location-migration-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    try {
        const migrations = readMigrationFiles({
            migrationsFolder: fileURLToPath(
                new URL('../db/migrations', import.meta.url),
            ),
        });
        await client.execute(
            'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)',
        );
        for (const migration of migrations.slice(0, 4)) {
            for (const statement of migration.sql)
                await client.execute(statement);
            await client.execute({
                sql: 'INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)',
                args: [migration.hash, migration.folderMillis],
            });
        }
        await client.execute(
            "INSERT INTO classes(id,name,year) VALUES (1,'First',1),(2,'Second',2)",
        );
        await client.execute(
            "INSERT INTO student_records(id,name) VALUES (1,'Ane'),(2,'Iker'),(3,'Miren')",
        );
        await client.execute(
            "INSERT INTO class_members(class_id,student_record_id,name,town) VALUES (1,1,'Ane','  Bilbao  '),(2,1,'Ane','bilbao'),(1,2,'Iker','Bilbao'),(2,2,'Iker','Donostia'),(1,3,'Miren',NULL),(2,NULL,'New person','Eibar')",
        );
        await migrateDatabase(client);
        const rows = (
            await client.execute(
                'SELECT id,term_time_town,term_time_town_source,term_time_town_updated_at FROM student_records ORDER BY id',
            )
        ).rows;
        expect(rows[0]).toMatchObject({
            id: 1,
            term_time_town_source: 'roster',
            term_time_town_updated_at: null,
        });
        expect(String(rows[0].term_time_town).toLowerCase()).toBe('bilbao');
        expect(rows[1]).toMatchObject({
            id: 2,
            term_time_town: null,
            term_time_town_source: 'roster',
        });
        expect(rows[2]).toMatchObject({
            id: 3,
            term_time_town: null,
            term_time_town_source: 'unknown',
        });
        expect(rows[3]).toMatchObject({
            term_time_town: 'Eibar',
            term_time_town_source: 'roster',
        });
        await client.execute(
            "UPDATE student_records SET term_time_town=NULL,term_time_town_source='teacher',term_time_town_updated_at='2026-10-14' WHERE id=1",
        );
        await migrateDatabase(client);
        expect(
            (
                await client.execute(
                    'SELECT term_time_town,term_time_town_source FROM student_records WHERE id=1',
                )
            ).rows[0],
        ).toEqual({ term_time_town: null, term_time_town_source: 'teacher' });
        expect(
            (
                await client.execute(
                    'SELECT town FROM class_members WHERE student_record_id=2 ORDER BY class_id',
                )
            ).rows,
        ).toEqual([{ town: 'Bilbao' }, { town: 'Donostia' }]);
        expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual(
            [],
        );
    } finally {
        client.close();
        await rm(dir, { recursive: true, force: true });
    }
});
