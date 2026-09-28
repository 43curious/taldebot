import { it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { hash } from 'bcryptjs';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { migrateClasses } from '../../../scripts/migrate-classes.mjs';

it('keeps class and dashboard actions available after a real login', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'taldebot-page-'));
    const db = createClient({ url: `file:${join(dir, 'test.db')}` });
    let server;
    try {
        await db.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, hashed_password TEXT, role TEXT DEFAULT 'admin', full_name TEXT, email TEXT, created_at TEXT)");
        await db.execute({ sql: 'INSERT INTO users(username, hashed_password) VALUES (?, ?)', args: ['test', await hash('test-pass', 4)] });
        await migrateClasses(db);
        await db.execute("INSERT INTO degrees(name) VALUES ('Media')");
        await db.execute("INSERT INTO classes(name, year, degree_id) VALUES ('1. maila', 1, 1)");
        await db.execute("INSERT INTO class_members(class_id, name, division) VALUES (1, 'Ane', 'sormena')");
        await db.execute("CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, num_teams INTEGER, target_team_size INTEGER, project_type TEXT NOT NULL, created_at TEXT, status TEXT, admin_email TEXT, access_code TEXT)");
        await db.execute("CREATE TABLE students (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT NOT NULL, email TEXT, has_completed INTEGER, is_excluded INTEGER)");
        await db.execute("INSERT INTO projects (id, name, project_type, status, access_code) VALUES (1, 'Film lab', 'balanced', 'active', '1234A')");
        await db.execute("INSERT INTO students (project_id, name, has_completed) VALUES (1, 'Ane', 1), (1, 'Iker', 0)");
        const port = await new Promise((resolve) => {
            const listener = createServer().listen(0, '127.0.0.1', () => {
                const port = listener.address().port;
                listener.close(() => resolve(port));
            });
        });
        const base = `http://127.0.0.1:${port}`;
        server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--ignore-lock', '--port', String(port), '--host', '127.0.0.1'], {
            env: { ...process.env, NODE_ENV: 'development', VITEST: '', VITEST_WORKER_ID: '', TURSO_CONNECTION_URL: `file:${join(dir, 'test.db')}`, TURSO_AUTH_TOKEN: '' },
            stdio: 'ignore',
        });
        let ready = false;
        for (let i = 0; i < 90; i++) {
            try { ready = (await fetch(`${base}/admin/login`, { signal: AbortSignal.timeout(500) })).ok; } catch { /* server starting */ }
            if (ready) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(ready).toBe(true);
        expect((await fetch(`${base}/admin/classes`, { headers: { cookie: 'admin_session=active' }, redirect: 'manual' })).status).toBe(302);
        expect((await fetch(`${base}/admin/users`, { headers: { cookie: 'astro-session=ad96f327-3f16-4615-9ff0-65e6152c586f' }, redirect: 'manual' })).status).toBe(302);
        const login = await fetch(`${base}/admin/login`, {
            method: 'POST', redirect: 'manual', headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded' },
            body: 'username=test&password=test-pass',
        });
        expect(login.status).toBe(302);
        const cookie = login.headers.get('set-cookie')?.split(';')[0];
        expect(cookie).toMatch(/^astro-session=/);
        const browse = await (await fetch(`${base}/admin/classes`, { headers: { cookie } })).text();
        expect(browse).toContain('Media');
        expect(browse).toContain('Ane');
        expect(browse).toContain('Sormena');
        const edit = await (await fetch(`${base}/admin/classes?mode=edit`, { headers: { cookie } })).text();
        expect(edit).toContain('4. maila');
        expect(edit).toContain('Klasea gehitu');
        const dashboard = await (await fetch(`${base}/admin/dashboard`, { headers: { cookie } })).text();
        expect(dashboard).toContain('Film lab');
        expect(dashboard).toContain('lg:grid-cols-[minmax(0,1fr)_15rem_11rem]');
        expect(dashboard).toContain('aria-valuenow="50"');
        expect(dashboard.indexOf('Film lab')).toBeLessThan(dashboard.indexOf('Kodea:'));
        expect(dashboard.indexOf('1234A')).toBeLessThan(dashboard.indexOf('aria-valuenow="50"'));
        expect(dashboard).toContain('/admin/create-project');
        expect(dashboard).toContain('/admin/monitor/1');
        expect(dashboard).toContain('/admin/teams/1');
        expect(dashboard).toContain('data-project-id="1"');
    } finally {
        if (server && server.exitCode === null && server.signalCode === null) {
            server.kill();
            await once(server, 'exit');
        }
        db.close();
        await rm(dir, { recursive: true, force: true });
    }
}, 20_000);
