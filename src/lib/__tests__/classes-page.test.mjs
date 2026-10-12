import { it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { hash } from 'bcryptjs';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { migrateDatabase } from '../../../scripts/migrations';
import { skillGroups } from '../skills';

it('keeps class and dashboard actions available after a real login', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'taldebot-page-'));
    const db = createClient({ url: `file:${join(dir, 'test.db')}` });
    let server;
    try {
        await migrateDatabase(db);
        await db.execute({ sql: 'INSERT INTO users(username, hashed_password) VALUES (?, ?)', args: ['test', await hash('test-pass', 4)] });
        await db.execute("INSERT INTO degrees(name) VALUES ('Media'), ('Engineering'), ('Arts')");
        await db.execute("INSERT INTO classes(name, year, degree_id) VALUES ('1. maila', 1, 1), ('Lab class', 2, 2), ('Unassigned class', 3, NULL)");
        await db.execute("INSERT INTO classes(name, year, degree_id) VALUES ('4. maila', 4, 1)");
        await db.execute("INSERT INTO class_members(class_id, name, email, tutor, division) VALUES (1, 'Ane', 'ane@example.com', 'Maite', 'sormena'), (1, 'Iker', NULL, NULL, 'digitala'), (2, 'Leire', NULL, NULL, NULL)");
        await db.execute("INSERT INTO class_members(class_id, name) VALUES (4, 'Miren')");
        await db.execute("INSERT INTO projects (id, name, project_type, status, access_code) VALUES (1, 'Film lab', 'balanced', 'active', '1234A')");
        await db.execute("INSERT INTO students (project_id, name, has_completed) VALUES (1, 'Ane', 1), (1, 'Iker', 0)");
        await db.execute("INSERT INTO students (project_id, name, has_completed, is_excluded) VALUES (1, 'Absent Student', 1, 1)");
        await db.execute("INSERT INTO responses (student_id, project_id, skills_narrative, skills_technical, skills_management, skills_soft, prefer_with, prefer_avoid, comfort) VALUES (1, 1, '{}', '{}', '{}', '{}', '[]', '[]', '[2]')");
        await db.execute("INSERT INTO projects (id, name, project_type, status) VALUES (2, 'New project', 'balanced', 'setup')");
        const port = await new Promise((resolve) => {
            const listener = createServer().listen(0, '127.0.0.1', () => {
                const port = listener.address().port;
                listener.close(() => resolve(port));
            });
        });
        const base = `http://127.0.0.1:${port}`;
        server = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--ignore-lock', '--port', String(port), '--host', '127.0.0.1'], {
            env: { ...process.env, NODE_ENV: 'development', VITEST: '', VITEST_WORKER_ID: '', LOCAL_DATABASE_URL: `file:${join(dir, 'test.db')}`, TURSO_CONNECTION_URL: '', TURSO_AUTH_TOKEN: '' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let serverOutput = '';
        server.stdout.on('data', chunk => { serverOutput += chunk; });
        server.stderr.on('data', chunk => { serverOutput += chunk; });
        let ready = false;
        for (let i = 0; i < 90; i++) {
            try { ready = (await fetch(`${base}/admin/login`, { signal: AbortSignal.timeout(500) })).ok; } catch { /* server starting */ }
            if (ready) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(ready, serverOutput).toBe(true);
        expect((await fetch(`${base}/admin/classes`, { headers: { cookie: 'admin_session=active' }, redirect: 'manual' })).status).toBe(302);
        expect((await fetch(`${base}/admin/users`, { headers: { cookie: 'astro-session=ad96f327-3f16-4615-9ff0-65e6152c586f' }, redirect: 'manual' })).status).toBe(302);
        const login = await fetch(`${base}/admin/login`, {
            method: 'POST', redirect: 'manual', headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded' },
            body: 'username=test&password=test-pass',
        });
        expect(login.status).toBe(302);
        const cookie = login.headers.get('set-cookie')?.split(';')[0];
        expect(cookie).toMatch(/^astro-session=/);
        const malformedDeletion = await fetch(`${base}/api/admin/delete-project`, {
            method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ projectId: true }),
        });
        expect(malformedDeletion.status).toBe(400);
        expect((await db.execute('SELECT COUNT(*) AS n FROM projects')).rows[0].n).toBe(2);
        const malformedReset = await fetch(`${base}/api/admin/reset-student?projectId=1&studentId=2x`, {
            method: 'POST', headers: { cookie, origin: base },
        });
        expect(malformedReset.status).toBe(400);
        const entry = await (await fetch(`${base}/admin/classes`, { headers: { cookie } })).text();
        expect(entry).toContain('id="scope-degree"');
        expect(entry).toContain('Leire');
        expect(entry).not.toContain('Miren');
        const browse = await (await fetch(`${base}/admin/classes?degree=1`, { headers: { cookie } })).text();
        expect(browse).toContain('Media');
        expect(browse).toContain('Ane');
        expect(browse).toContain('Sormena');
        expect(browse).toContain('id="scope-degree"');
        expect(browse).toContain('id="scope-class"');
        expect(browse).not.toContain('Miren');
        expect(browse).not.toContain('Leire');
        const edit = await (await fetch(`${base}/admin/classes?mode=edit`, { headers: { cookie } })).text();
        expect(edit).not.toContain('Klase gabe');
        expect(edit).toContain('Klasea gehitu');
        expect(edit).toContain('Gorde aldaketak');
        expect(edit).toContain('aria-describedby="csv-help"');
        expect(browse).toContain('role="search"');
        expect(browse).toContain('ane@example.com');
        expect(browse).toMatch(/\/admin\/classes\?mode=edit(?:&amp;|&#38;|&)class=1#class-1/);

        const classPage = async (query) => {
            const params = new URLSearchParams(query);
            if (!params.has('degree') && !params.has('mode')) params.set('degree', '1');
            return (await fetch(`${base}/admin/classes?${params}`, { headers: { cookie } })).text();
        };
        for (const query of ['q=aNe', 'q=ane%40example.com', 'q=maite', 'q=ane&degree=1&year=1']) {
            const results = await classPage(query);
            expect(results).toContain('1 klase · 1 ikasle');
            expect(results).toContain('Ane');
            expect(results).not.toContain('Iker');
            expect(results).not.toContain('Leire');
        }
        const degreeResults = await classPage('degree=2&year=2');
        expect(degreeResults).toContain('Lab class');
        expect(degreeResults).toContain('Leire');
        expect(degreeResults).not.toContain('Ane');
        const unassigned = await classPage('degree=none');
        expect(unassigned).toContain('Unassigned class');
        expect(unassigned).not.toContain('Lab class');
        const fourthYear = await classPage('degree=1&class=4');
        expect(fourthYear).toContain('Miren');
        expect(fourthYear).not.toContain('ane@example.com');
        // Both public locales render the shared survey and use the same validated route.
        for (const lang of ['eu', 'en']) {
            const prefix = lang === 'en' ? '/en' : '';
            const survey = await fetch(`${base}${prefix}/student/form/1234A?studentId=2`);
            expect(survey.status).toBe(200);
            const html = await survey.text();
            expect(html).toContain(`lang="${lang}"`);
            expect(html).toContain(`name="lang" value="${lang}"`);
            expect(html).toMatch(/value="2" selected/);
            expect(html.match(/<select[^>]*id="studentSelect"[\s\S]*?<\/select>/)[0]).not.toContain('Absent Student');
            expect(html).toContain(lang === 'en' ? 'Who are you?' : 'Nor zara?');
            const missing = await fetch(`${base}${prefix}/student/form/9999Z`, { redirect: 'manual' });
            expect(missing.headers.get('location')).toBe(`${prefix}/?error=not_found`);
            const data = new URLSearchParams({
                projectId: '1', studentId: '2', lang, email: 'iker@example.com', comfort: '[1]', preferWith: '[]', preferAvoid: '[]',
                ...Object.fromEntries(skillGroups.flatMap(group => group.keys.map(key => [`${group.prefix}_${key}`, '5']))),
            });
            const malformed = new URLSearchParams(data);
            malformed.set('comfort', '[999]');
            const invalid = await fetch(`${base}/api/student/submit-form`, { method: 'POST', headers: { origin: base }, body: malformed, redirect: 'manual' });
            expect(invalid.status).toBe(400);
            expect(invalid.headers.get('content-type')).toContain('application/json');
            const submitted = await fetch(`${base}/api/student/submit-form`, { method: 'POST', headers: { origin: base }, body: data, redirect: 'manual' });
            expect(submitted.status).toBe(302);
            expect(submitted.headers.get('location')).toBe(`${prefix}/student/confirmation`);
            const duplicate = await fetch(`${base}/api/student/submit-form`, { method: 'POST', headers: { origin: base }, body: data, redirect: 'manual' });
            expect(duplicate.status).toBe(400);
            const reset = await fetch(`${base}/api/admin/reset-student?projectId=1&studentId=2`, { method: 'POST', headers: { cookie, origin: base } });
            expect(reset.status).toBe(200);
        }

        const standaloneGraph = await (await fetch(`${base}/admin/graph?degree=1&class=1`, { headers: { cookie } })).text();
        expect(standaloneGraph).toContain('Klasearen harremanen mapa');
        expect(standaloneGraph).toContain('Film lab');
        expect(standaloneGraph).toContain('Ane');
        expect(standaloneGraph).toContain('Iker');
        expect(standaloneGraph).not.toContain('Leire');
        const otherGraph = await (await fetch(`${base}/admin/graph?degree=2&class=2`, { headers: { cookie } })).text();
        expect(otherGraph).toContain('Leire');
        expect(otherGraph).not.toContain('Film lab');
        expect(otherGraph).toContain('inkesta-daturik ez dago');
        const empty = await classPage('q=not-found');
        expect(empty).toContain('Ez da emaitzarik aurkitu');
        expect(empty).toContain('Garbitu iragazkiak');
        const filteredEdit = await classPage('mode=edit&q=ane');
        expect(filteredEdit).toContain('value="Ane"');
        expect(filteredEdit).not.toContain('value="Iker"');
        expect(filteredEdit).toContain('name="mode" value="edit"');
        const directEdit = await classPage('mode=edit&class=1');
        expect(directEdit).toMatch(/<details[^>]*id="degree-1"[^>]* open/);
        expect(directEdit).toMatch(/<details open[^>]*id="class-1"/);
        const importPage = await classPage('mode=edit&class=3&import=1');
        expect(importPage).toMatch(/<details[^>]*id="import-students"[^>]* open/);
        expect(importPage).toMatch(/<option value="3" selected/);

        const saved = await (await fetch(`${base}/admin/classes?mode=edit`, {
            method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ action: 'save-student', id: '1', classId: '1', name: 'Ane Updated', email: 'ane@example.com', tutor: 'Maite', division: 'sormena' }),
        })).text();
        expect(saved).toContain('Ikaslea eguneratu da.');
        expect(saved).toContain('value="Ane Updated"');
        expect(saved).toMatch(/<details[^>]*id="degree-1"[^>]* open/);
        expect(saved).toMatch(/<details open[^>]*id="class-1"/);
        expect(saved).toMatch(/<details[^>]*id="student-1"[^>]* open/);
        const postClass = async (data) => (await fetch(`${base}/admin/classes?mode=edit`, {
            method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(data),
        })).text();
        expect(await postClass({ action: 'add-student', classId: '1', name: 'New Student', email: 'new@example.com' })).toContain('Ikaslea gehitu da.');
        expect(await postClass({ action: 'import', classId: '1', csv: 'izena,email\nNew Student,new@example.com\nAnother Student,another@example.com' })).toContain('1 ikasle inportatu dira. 1 errepikatu saltatu dira.');
        const exported = await fetch(`${base}/api/admin/export-roster?classId=1`, { headers: { cookie } });
        expect(exported.headers.get('content-type')).toContain('text/csv');
        expect(await exported.text()).toContain('"New Student","new@example.com"');
        const monitor = await (await fetch(`${base}/admin/monitor/1`, { headers: { cookie } })).text();
        expect(monitor).toContain('aria-valuenow="50"');
        expect(monitor).toContain('1 / 2');
        expect(monitor).toContain('data-action="restore"');
        expect(monitor).toContain('Inkestaren esteka kopiatu');
        const pendingMonitor = await (await fetch(`${base}/admin/monitor/1?status=pending`, { headers: { cookie } })).text();
        expect(pendingMonitor).toContain('Iker');
        expect(pendingMonitor).not.toContain('Absent Student');
        expect(pendingMonitor).not.toContain('data-action="reset"');
        const graph = await (await fetch(`${base}/admin/monitor/1?view=map`, { headers: { cookie } })).text();
        expect(graph).toContain('Klasearen harremanen mapa');
        expect(graph).toContain('Ane');
        expect(graph).toContain('Iker');
        expect(graph).not.toContain('Absent Student');
        const dashboard = await (await fetch(`${base}/admin/dashboard`, { headers: { cookie } })).text();
        expect(dashboard).toContain('Film lab');
        expect(dashboard).toContain('xl:grid-cols-[minmax(0,1fr)_14rem_11rem]');
        expect(dashboard).toContain('aria-valuenow="50"');
        expect(dashboard).toContain('1 / 2 ikaslek erantzun dute');
        expect(dashboard).toContain('Ez dago ikaslerik oraindik');
        expect(dashboard).toContain('data-access-code="1234A"');
        expect(dashboard.match(/class="copy-code-btn /g)).toHaveLength(1);
        expect(dashboard).toContain('aria-label="Kopiatu Film lab proiektuaren kodea: 1234A"');
        expect(dashboard).toContain('role="status" aria-live="polite" aria-atomic="true"');
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
