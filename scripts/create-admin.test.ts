import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compare } from 'bcryptjs';
import { createClient } from '@libsql/client';
import { migrateDatabase } from './migrations';

const exec = promisify(execFile);
it('creates without resetting, resets explicitly, never logs passwords, and fails for missing prerequisites', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'taldebot-admin-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    const env = {
        ...process.env,
        LOCAL_DATABASE_URL: `file:${join(dir, 'test.db')}`,
        INITIAL_ADMIN_USERNAME: 'test-admin',
        INITIAL_ADMIN_PASSWORD: 'synthetic-first-password',
    };
    const command = [
        'node_modules/tsx/dist/cli.mjs',
        'scripts/create-admin.ts',
    ];
    try {
        await migrateDatabase(client);
        const created = await exec(process.execPath, [...command, '--local'], {
            env,
        });
        expect(created.stdout + created.stderr).not.toContain(
            env.INITIAL_ADMIN_PASSWORD,
        );
        const account = (
            await client.execute('SELECT hashed_password, role FROM users')
        ).rows[0];
        expect(
            await compare(
                env.INITIAL_ADMIN_PASSWORD,
                String(account.hashed_password),
            ),
        ).toBe(true);
        env.INITIAL_ADMIN_PASSWORD = 'synthetic-second-password';
        const repeated = await exec(process.execPath, [...command, '--local'], {
            env,
        });
        expect(repeated.stdout).toContain('password unchanged');
        expect(
            (await client.execute('SELECT hashed_password FROM users')).rows[0]
                .hashed_password,
        ).toBe(account.hashed_password);
        const reset = await exec(
            process.execPath,
            [...command, '--local', '--reset-password'],
            { env },
        );
        expect(reset.stdout + reset.stderr).not.toContain(
            env.INITIAL_ADMIN_PASSWORD,
        );
        const updated = (
            await client.execute('SELECT hashed_password, role FROM users')
        ).rows[0];
        expect(
            await compare(
                env.INITIAL_ADMIN_PASSWORD,
                String(updated.hashed_password),
            ),
        ).toBe(true);
        expect(updated.role).toBe(account.role);
        await expect(
            exec(process.execPath, command, { env }),
        ).rejects.toMatchObject({ code: 1 });
        await expect(
            exec(process.execPath, [...command, '--local'], {
                env: { ...env, INITIAL_ADMIN_PASSWORD: '' },
            }),
        ).rejects.toMatchObject({ code: 1 });
        await expect(
            exec(
                process.execPath,
                [...command, '--local', '--reset-password'],
                { env: { ...env, INITIAL_ADMIN_USERNAME: 'missing' } },
            ),
        ).rejects.toMatchObject({ code: 1 });
    } finally {
        client.close();
        await rm(dir, { recursive: true, force: true });
    }
}, 15_000);
