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

it('shows degree-first browse and edit views only after a real login', async () => {
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
    } finally {
        if (server && server.exitCode === null && server.signalCode === null) {
            server.kill();
            await once(server, 'exit');
        }
        db.close();
        await rm(dir, { recursive: true, force: true });
    }
}, 20_000);
