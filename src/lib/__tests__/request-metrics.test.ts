import { expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/libsql';
import { testDatabase } from './testDatabase';
import * as schema from '../../../db/schema';
import { measuredClient, measuredRequest, timed } from '../requestMetrics';
it('isolates concurrent request metrics and never includes SQL, parameters or row values', async () => {
    const f = await testDatabase();
    try {
        await f.db
            .insert(schema.degrees)
            .values({ name: 'private-degree-value' });
        const db = drizzle(measuredClient(f.client), { schema });
        const response = (queries: number) =>
            measuredRequest(async () => {
                for (let i = 0; i < queries; i++)
                    await timed('handler', async () => {
                        await db.select().from(schema.degrees);
                    });
                return new Response('ok');
            });
        const [first, second] = await Promise.all([response(1), response(2)]);
        expect(first.headers.get('server-timing')).toContain(
            'db_queries;desc="1"',
        );
        expect(second.headers.get('server-timing')).toContain(
            'db_queries;desc="2"',
        );
        expect(second.headers.get('server-timing')).toContain(
            'db_rows;desc="2"',
        );
        expect(first.headers.get('server-timing')).not.toMatch(
            /private|select|degrees/i,
        );
        const transaction = await measuredRequest(async () => {
            await db.transaction(async (tx) => {
                await tx.select().from(schema.degrees);
            });
            return new Response('ok');
        });
        expect(transaction.headers.get('server-timing')).toContain(
            'db_queries;desc="1"',
        );
    } finally {
        await f.close();
    }
});
