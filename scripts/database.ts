import { config } from 'dotenv';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../db/schema';
import { databaseConfig, type DatabaseTarget } from '../src/lib/config';

export async function withDatabase(
    run: (
        db: ReturnType<typeof drizzle<typeof schema>>,
        client: ReturnType<typeof createClient>,
        args: string[],
    ) => Promise<void>,
) {
    config({ quiet: true });
    const [flag, ...args] = process.argv.slice(2);
    if (flag !== '--local' && flag !== '--remote') {
        throw new Error('Choose exactly one target: --local or --remote');
    }
    const target: DatabaseTarget = flag === '--local' ? 'local' : 'remote';
    const client = createClient(databaseConfig(process.env, target));
    try {
        await run(drizzle(client, { schema }), client, args);
    } finally {
        client.close();
    }
}

export function reportFailure(error: unknown) {
    console.error(
        error instanceof Error ? error.message : 'Database command failed',
    );
    process.exitCode = 1;
}
