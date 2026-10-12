import { expect, it } from 'vitest';
import { databaseConfig } from '../config';

it('requires remote credentials in deployed runtimes and keeps local commands local', () => {
    expect(databaseConfig({})).toEqual({ url: 'file:sqlite.db' });
    expect(
        databaseConfig(
            {
                TURSO_CONNECTION_URL: 'libsql://remote',
                TURSO_AUTH_TOKEN: 'token',
            },
            'local',
        ),
    ).toEqual({ url: 'file:sqlite.db' });
    for (const env of [
        { NODE_ENV: 'production' },
        { NETLIFY: 'true' },
        { NODE_ENV: 'production', TURSO_CONNECTION_URL: 'file:test.db' },
    ]) {
        expect(() => databaseConfig(env)).toThrow('Remote database requires');
    }
    expect(() => databaseConfig({}, 'remote')).toThrow(
        'Remote database requires',
    );
    expect(() =>
        databaseConfig({ LOCAL_DATABASE_URL: 'libsql://remote' }, 'local'),
    ).toThrow('must use file:');
});
