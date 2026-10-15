import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
interface Metrics {
    startedAt: number;
    phases: Map<string, number>;
    databaseMs: number;
    queries: number;
    rows: number;
    failure?: { code: string; query?: string };
}
const requests = new AsyncLocalStorage<Metrics>();
export async function timed<T>(
    name: 'session' | 'user' | 'password' | 'access' | 'handler',
    run: () => Promise<T>,
): Promise<T> {
    const metrics = requests.getStore();
    if (!metrics) return run();
    const start = performance.now();
    try {
        return await run();
    } finally {
        metrics.phases.set(
            name,
            (metrics.phases.get(name) ?? 0) + performance.now() - start,
        );
    }
}
export async function measuredRequest(
    run: () => Promise<Response>,
): Promise<Response> {
    const metrics: Metrics = {
        startedAt: performance.now(),
        phases: new Map(),
        databaseMs: 0,
        queries: 0,
        rows: 0,
    };
    return requests.run(metrics, async () => {
        let original: Response;
        try {
            original = await run();
        } catch {
            original = new Response('Internal Server Error', { status: 500 });
        }
        const response = new Response(original.body, {
            status: original.status,
            statusText: original.statusText,
            headers: original.headers,
        });
        const timings = [
            `app;dur=${(performance.now() - metrics.startedAt).toFixed(1)}`,
            ...[...metrics.phases].map(
                ([key, value]) => `${key};dur=${value.toFixed(1)}`,
            ),
            `db;dur=${metrics.databaseMs.toFixed(1)}`,
            `db_queries;desc="${metrics.queries}"`,
            `db_rows;desc="${metrics.rows}"`,
        ];
        response.headers.set('Server-Timing', timings.join(', '));
        if (response.status >= 500) {
            const id = randomUUID();
            const failure = metrics.failure ?? { code: 'SERVER_ERROR' };
            response.headers.set('Cache-Control', 'private, no-store');
            response.headers.set('X-Taldebot-Error-ID', id);
            response.headers.set('X-Taldebot-Error', failure.code);
            if (failure.query)
                response.headers.set('X-Taldebot-Query', failure.query);
            console.error('[taldebot-request-failure]', {
                id,
                status: response.status,
                ...failure,
                timing: timings.join(', '),
            });
        }
        return response;
    });
}
// Diagnostics contain counts, timings, error codes and SQL-template hashes, never SQL or values.
export function measuredClient(client: Client): Client {
    const wrap = <T extends object>(target: T): T =>
        new Proxy(target, {
            get(object, key) {
                const value = Reflect.get(object, key);
                if (typeof value !== 'function') return value;
                if (key === 'transaction')
                    return async (...args: unknown[]) => {
                        const transaction = await operation(
                            () => value.apply(object, args),
                            0,
                        );
                        if (!transaction || typeof transaction !== 'object')
                            throw new Error('Database transaction unavailable');
                        return wrap(transaction);
                    };
                if (
                    ['execute', 'batch', 'commit', 'rollback'].includes(
                        String(key),
                    )
                )
                    return (...args: unknown[]) =>
                        operation(
                            () => value.apply(object, args),
                            key === 'execute'
                                ? 1
                                : key === 'batch' && Array.isArray(args[0])
                                  ? args[0].length
                                  : 0,
                            args[0],
                        );
                return value.bind(object);
            },
        });
    async function operation<T>(
        run: () => Promise<T>,
        queries: number,
        statement?: unknown,
    ): Promise<T> {
        const metrics = requests.getStore();
        if (!metrics) return run();
        const start = performance.now();
        try {
            const result = await run();
            const countRows = (value: unknown) =>
                value &&
                typeof value === 'object' &&
                'rows' in value &&
                Array.isArray(value.rows)
                    ? value.rows.length
                    : 0;
            metrics.rows += Array.isArray(result)
                ? result.reduce((n, value) => n + countRows(value), 0)
                : countRows(result);
            return result;
        } catch (error) {
            metrics.failure ??= {
                code: databaseErrorCode(error),
                query: queryFingerprint(statement),
            };
            throw error;
        } finally {
            metrics.databaseMs += performance.now() - start;
            metrics.queries += queries;
        }
    }
    return wrap(client);
}

function databaseErrorCode(error: unknown): string {
    let current = error;
    for (let depth = 0; depth < 5; depth++) {
        if (!current || typeof current !== 'object') break;
        if (
            'code' in current &&
            typeof current.code === 'string' &&
            /^[A-Z][A-Z0-9_]{0,63}$/.test(current.code)
        )
            return current.code;
        current = 'cause' in current ? current.cause : undefined;
    }
    return 'DATABASE_ERROR';
}

function queryFingerprint(statement: unknown): string | undefined {
    const sql = (value: unknown): string | undefined =>
        typeof value === 'string'
            ? value
            : value &&
                typeof value === 'object' &&
                'sql' in value &&
                typeof value.sql === 'string'
              ? value.sql
              : undefined;
    const templates = Array.isArray(statement)
        ? statement.map(sql)
        : [sql(statement)];
    if (!templates.length || templates.some((value) => value === undefined))
        return undefined;
    return createHash('sha256')
        .update(JSON.stringify(templates))
        .digest('hex')
        .slice(0, 12);
}
