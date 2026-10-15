import { expect, it, vi } from 'vitest';
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

it('keeps aggregate diagnostics on failed database requests without exposing SQL or parameters', async () => {
    const f = await testDatabase();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        const client = measuredClient(f.client);
        const response = await measuredRequest(async () => {
            await client.execute({
                sql: 'SELECT * FROM missing_private_table WHERE name = ?',
                args: ['private-student-value'],
            });
            return new Response('ok');
        });
        expect(response.status).toBe(500);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('server-timing')).toContain(
            'db_queries;desc="1"',
        );
        expect(response.headers.get('x-taldebot-error')).toMatch(/^SQLITE_/);
        expect(response.headers.get('x-taldebot-query')).toMatch(
            /^[a-f0-9]{12}$/,
        );
        expect(response.headers.get('x-taldebot-error-id')).toBeTruthy();
        // Astro can turn a route exception into a response before middleware sees it.
        const caught = await measuredRequest(async () => {
            try {
                await client.execute({
                    sql: 'SELECT * FROM missing_private_table WHERE name = ?',
                    args: ['different-private-value'],
                });
            } catch {
                return new Response('generic failure', { status: 500 });
            }
            throw new Error('Expected missing-table failure');
        });
        expect(caught.headers.get('x-taldebot-error')).toBe('SQLITE_ERROR');
        expect(caught.headers.get('x-taldebot-query')).toBe(
            response.headers.get('x-taldebot-query'),
        );
        expect(caught.headers.get('x-taldebot-error-id')).not.toBe(
            response.headers.get('x-taldebot-error-id'),
        );
        const diagnostics =
            JSON.stringify([...response.headers]) +
            (await response.text()) +
            JSON.stringify(log.mock.calls);
        expect(diagnostics).not.toMatch(
            /missing_private_table|private-student-value|different-private-value|SELECT|WHERE/,
        );
        const handled = await measuredRequest(
            async () => new Response('generic failure', { status: 500 }),
        );
        expect(handled.headers.get('x-taldebot-error')).toBe('SERVER_ERROR');
    } finally {
        log.mockRestore();
        await f.close();
    }
});
