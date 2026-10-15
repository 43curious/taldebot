import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { config } from 'dotenv';

config({ quiet: true });
if (!existsSync('.netlify/build/entry.mjs'))
    throw new Error('Run npm run build before measuring startup');

// Fresh processes measure application startup, not Netlify container provisioning.
for (const path of ['/', '/en/', '/admin/login', '/admin/dashboard']) {
    const staticFile = `dist/${path === '/' ? '' : path.slice(1) + '/'}index.html`;
    if (existsSync(staticFile)) {
        console.log(
            JSON.stringify({ path, static: true, functionInvocations: 0 }),
        );
        continue;
    }
    const samples: number[] = [];
    const warmSamples: number[] = [];
    for (let i = 0; i < 5; i++) {
        const result = spawnSync(
            process.execPath,
            [
                '--input-type=module',
                '-e',
                `
            const start = performance.now();
            const { createHandler } = await import('./.netlify/build/entry.mjs');
            const handler = createHandler({});
            const cold = await handler(new Request('https://taldebot.eus${path}'), { ip: '127.0.0.1' });
            await cold.text();
            if (cold.status !== ${path === '/admin/dashboard' ? 302 : 200}) process.exit(1);
            const coldMs = performance.now() - start;
            const warmStart = performance.now();
            const warm = await handler(new Request('https://taldebot.eus${path}'), { ip: '127.0.0.1' });
            await warm.text();
            console.log(JSON.stringify({ coldMs, warmMs: performance.now() - warmStart }));
        `,
            ],
            { encoding: 'utf8', env: process.env },
        );
        if (result.status !== 0)
            throw new Error(
                `Startup probe failed for ${path}; no credentials logged`,
            );
        const measured = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
        samples.push(measured.coldMs);
        warmSamples.push(measured.warmMs);
    }
    samples.sort((a, b) => a - b);
    warmSamples.sort((a, b) => a - b);
    console.log(
        JSON.stringify({
            path,
            static: false,
            samples: samples.length,
            medianColdMs: Math.round(samples[2]),
            medianWarmMs: Math.round(warmSamples[2]),
            maxColdMs: Math.round(samples[4]),
        }),
    );
}
