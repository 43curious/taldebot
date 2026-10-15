import { AsyncLocalStorage } from 'node:async_hooks';
import type { Client } from '@libsql/client';
interface Metrics {
    startedAt: number;
    phases: Map<string, number>;
    databaseMs: number;
    queries: number;
    rows: number;
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
        const original = await run();
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
        return response;
    });
}
// Only aggregate timing/counts leave the request. SQL, parameters, identities and cookies never do.
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
                        );
                return value.bind(object);
            },
        });
    async function operation<T>(
        run: () => Promise<T>,
        queries: number,
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
        } finally {
            metrics.databaseMs += performance.now() - start;
            metrics.queries += queries;
        }
    }
    return wrap(client);
}
