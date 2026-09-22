import { it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateClasses } from './migrate-classes.mjs';

it('creates the tables on a fresh database', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'taldebot-classes-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    try {
        await migrateClasses(client);
        await client.execute("INSERT INTO degrees (name) VALUES ('A'), ('B')");
        await client.execute("INSERT INTO classes (name, year, degree_id) VALUES ('1. maila', 1, 1), ('1. maila', 1, 2)");
        await client.execute("INSERT INTO class_members (class_id, name) VALUES (1, 'Ane')");
        expect((await client.execute('SELECT COUNT(*) AS n FROM class_members')).rows[0].n).toBe(1);
    } finally {
        client.close();
        await rm(dir, { recursive: true, force: true });
    }
});

it('preserves existing class members and project links while allowing repeated mailak across degrees', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'taldebot-classes-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    try {
        await client.batch([
            'CREATE TABLE degrees (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)',
            "INSERT INTO degrees VALUES (1, 'A'), (2, 'B')",
            'CREATE TABLE classes (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, year INTEGER NOT NULL UNIQUE CHECK(year BETWEEN 1 AND 4), capacity INTEGER NOT NULL DEFAULT 50, created_at TEXT DEFAULT CURRENT_TIMESTAMP, degree_id INTEGER REFERENCES degrees(id))',
            "INSERT INTO classes (id, name, year, degree_id) VALUES (10, '1. maila', 1, 1)",
            'CREATE TABLE class_members (id INTEGER PRIMARY KEY, class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE, name TEXT, email TEXT, division TEXT, created_at TEXT, national_id TEXT, tutor TEXT, town TEXT, academic_status TEXT, erasmus TEXT, dual TEXT, notes TEXT)',
            "INSERT INTO class_members (id, class_id, name) VALUES (20, 10, 'Ane')",
            'CREATE TABLE projects (id INTEGER PRIMARY KEY, class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL)',
            'INSERT INTO projects VALUES (30, 10)',
        ], 'write');
        await migrateClasses(client);
        await migrateClasses(client);
        await client.execute("INSERT INTO classes (name, year, degree_id) VALUES ('1. maila', 1, 2)");
        await client.execute("INSERT INTO classes (name, year, degree_id) VALUES ('5. maila', 5, 1)");
        expect((await client.execute('SELECT id, class_id, name FROM class_members')).rows).toMatchObject([{ id: 20, class_id: 10, name: 'Ane' }]);
        expect((await client.execute('SELECT class_id FROM projects WHERE id = 30')).rows[0].class_id).toBe(10);
        expect((await client.execute('PRAGMA foreign_key_check')).rows).toHaveLength(0);
    } finally {
        client.close();
        await rm(dir, { recursive: true, force: true });
    }
});
