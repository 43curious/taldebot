import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

it('measures the canonical static-page redirect but rejects login and cross-origin redirects', async () => {
    const cookies: string[] = [];
    const server = createServer((request, response) => {
        cookies.push(request.headers.cookie ?? '');
        if (request.url === '/login') {
            response.writeHead(301, { location: '/login/' }).end();
        } else if (request.url === '/login/') {
            response.end('static login');
        } else if (request.url === '/private') {
            response.writeHead(302, { location: '/login/' }).end();
        } else if (request.url === '/failure') {
            response
                .writeHead(500, {
                    'x-taldebot-error': 'SQLITE_ERROR',
                    'x-taldebot-query': '0123456789ab',
                    'x-taldebot-error-id':
                        '00000000-0000-4000-8000-000000000000',
                })
                .end('private-error-body');
        } else {
            response
                .writeHead(301, { location: 'https://example.com/outside/' })
                .end();
        }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
        throw new Error('Missing test port');
    const probe = (path: string) =>
        new Promise<{ code: number | null; output: string }>((resolve) => {
            const child = spawn(
                process.execPath,
                [
                    'node_modules/tsx/dist/cli.mjs',
                    'scripts/benchmark-http.ts',
                    '--url',
                    `http://127.0.0.1:${address.port}`,
                    '--samples',
                    '2',
                    '--path',
                    path,
                ],
                {
                    env: {
                        ...process.env,
                        TALDEBOT_BENCHMARK_COOKIE:
                            'test-session=private-test-value',
                    },
                },
            );
            let output = '';
            child.stdout.on('data', (chunk) => {
                output += chunk;
            });
            child.stderr.on('data', (chunk) => {
                output += chunk;
            });
            child.on('close', (code) => resolve({ code, output }));
        });
    try {
        const canonical = await probe('/login');
        expect(canonical.code, canonical.output).toBe(0);
        expect(JSON.parse(canonical.output)).toMatchObject({
            samples: 2,
            canonicalRedirectsPerSample: 1,
            lastHtmlBytes: 12,
        });
        expect(cookies).toHaveLength(4);
        expect(
            cookies.every(
                (cookie) => cookie === 'test-session=private-test-value',
            ),
        ).toBe(true);
        const denied = await probe('/private');
        expect(denied.code).toBe(1);
        expect(denied.output).toContain('Unexpected HTTP 302');
        const external = await probe('/outside');
        expect(external.code).toBe(1);
        expect(external.output).toContain('Unexpected canonical redirect');
        const failure = await probe('/failure');
        expect(failure.code).toBe(1);
        expect(failure.output).toContain('x-taldebot-error=SQLITE_ERROR');
        expect(failure.output).toContain('x-taldebot-query=0123456789ab');
        expect(
            canonical.output + denied.output + external.output + failure.output,
        ).not.toMatch(/private-test-value|private-error-body/);
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});
