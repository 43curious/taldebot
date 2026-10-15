import { config } from 'dotenv';
config({ quiet: true });
const args = process.argv.slice(2);
const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i < 0 ? undefined : args[i + 1];
};
const origin = new URL(value('--url') || 'https://taldebot.eus');
if (origin.protocol !== 'https:' && origin.hostname !== '127.0.0.1')
    throw new Error('Use HTTPS or local test origin');
const samples = Number(value('--samples') || 10),
    budget = Number(value('--budget-ms') || 0);
if (
    !Number.isInteger(samples) ||
    samples < 2 ||
    samples > 100 ||
    !Number.isFinite(budget) ||
    budget < 0
)
    throw new Error('Use --samples 2–100 and optional --budget-ms');
const paths = args.flatMap((arg, i) => (arg === '--path' ? [args[i + 1]] : []));
if (!paths.length) paths.push('/', '/admin/login', '/admin/dashboard');
const cookie = process.env.TALDEBOT_BENCHMARK_COOKIE;
for (const path of paths) {
    if (
        !path?.startsWith('/') ||
        path.startsWith('//') ||
        path.includes('?') ||
        path.includes('/api/')
    )
        throw new Error(
            'Only page paths without query strings are supported; no API mutations or tokens',
        );
    const timings: number[] = [],
        servers: string[] = [];
    let bytes = 0,
        redirects = 0;
    for (let i = 0; i < samples; i++) {
        const start = performance.now();
        let target = new URL(path, origin);
        const options: RequestInit = {
            headers: cookie ? { cookie } : {},
            redirect: 'manual',
            signal: AbortSignal.timeout(15000),
        };
        let response = await fetch(target, options);
        redirects = 0;
        while ([301, 308].includes(response.status)) {
            const location = response.headers.get('location');
            const next = location ? new URL(location, target) : undefined;
            if (
                !next ||
                next.origin !== origin.origin ||
                next.search !== target.search ||
                next.hash ||
                next.pathname === target.pathname ||
                next.pathname.replace(/\/$/, '') !==
                    target.pathname.replace(/\/$/, '') ||
                redirects >= 2
            )
                throw new Error(
                    'Unexpected canonical redirect; credentials were not forwarded',
                );
            await response.arrayBuffer();
            target = next;
            redirects++;
            response = await fetch(target, options);
        }
        const firstByteMs = performance.now() - start;
        const body = await response.arrayBuffer();
        bytes = body.byteLength;
        if (
            response.status !== 200 &&
            !(response.status === 302 && path === '/admin/dashboard' && !cookie)
        ) {
            const diagnostics = [
                ['x-taldebot-error', /^[A-Z][A-Z0-9_]{0,63}$/],
                ['x-taldebot-query', /^[a-f0-9]{12}$/],
                ['x-taldebot-error-id', /^[a-f0-9-]{36}$/],
            ] as const;
            const failure = diagnostics.flatMap(([name, pattern]) => {
                const value = response.headers.get(name);
                return value && pattern.test(value) ? [`${name}=${value}`] : [];
            });
            throw new Error(
                `Unexpected HTTP ${response.status}; verify session/access without logging credentials${failure.length ? `; ${failure.join(', ')}` : ''}`,
            );
        }
        timings.push(firstByteMs);
        servers.push(response.headers.get('server-timing') ?? 'not deployed');
    }
    const sorted = timings.slice().sort((a, b) => a - b);
    console.log(
        JSON.stringify({
            path,
            session: cookie ? 'provided' : 'anonymous',
            samples,
            firstRequestMs: Math.round(timings[0]),
            medianMs: Math.round(sorted[Math.floor(samples / 2)]),
            p95Ms: Math.round(sorted[Math.ceil(samples * 0.95) - 1]),
            lastHtmlBytes: bytes,
            canonicalRedirectsPerSample: redirects,
            firstServerTiming: servers[0],
            lastServerTiming: servers.at(-1),
            note: 'First request is not proof of a cold container; repeat after inactivity and compare hosting logs.',
        }),
    );
    if (budget && timings.some((t) => t > budget)) process.exitCode = 1;
}
