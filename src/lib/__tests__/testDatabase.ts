import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as schema from '../../../db/schema';
import { migrateDatabase } from '../../../scripts/migrations';

export async function testDatabase() {
    const dir = await mkdtemp(join(tmpdir(), 'taldebot-data-'));
    const client = createClient({ url: `file:${join(dir, 'test.db')}` });
    let queries = 0;
    const db = drizzle(client, {
        schema,
        logger: {
            logQuery() {
                queries++;
            },
        },
    });
    await migrateDatabase(client);
    return {
        db,
        client,
        queryCount: () => queries,
        clearQueryCount: () => {
            queries = 0;
        },
        close: async () => {
            client.close();
            await rm(dir, { recursive: true, force: true });
        },
    };
}
