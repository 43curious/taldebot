# Loading and startup investigation (#6)

Measured on 2026-10-14 against `https://taldebot.eus` and the configured remote LibSQL database. Jon identified the first visit after inactivity as the main symptom. No production writes or deployment were performed.

The first homepage request took 3.53 seconds to its first byte (DNS 0.06 s, TLS complete at 0.26 s). Subsequent homepage requests took 0.22–0.24 s; the English page took 0.41 s and login 0.29 s. Public HTML reported Netlify cache bypass/miss and was rendered through the SSR function even though it needs no database. This is consistent with startup overhead, but these HTTP timings alone do not prove Netlify's container initialization time. Function logs are needed to distinguish provisioning, application startup and session storage.

## Changes

- Prerender both landing pages, the privacy page and both generic confirmation pages. Their built HTML can be served without invoking SSR. Landing-page query feedback already runs in the browser, so it still works. Private teacher pages, personal links and submissions remain dynamic.
- Defer login's database/password imports until POST. Middleware resolves the session before importing the database client.
- Read ordinary-teacher responsibility in one SQL statement, returning only accessible scope IDs. It preserves class-only grants, simultaneous enrollments, unenrolled collecting-teacher access, full-project visibility and immediate revocation. It also removes inconsistent snapshots between successive authorization queries. No access cache was added.
- Scope dashboard counts to authorized projects. Skip empty profile loads, run the independent choice/assignment reads concurrently, and exclude unused raw legacy answers and private roster snapshots from profile queries. Historical originals remain stored for import and identity review.

## Remote database comparison

Both runs used the same database and client location, 20 samples per operation and an already connected client. The dataset contains 178 roster rows across four classes, six projects, 162 participants, 131 responses and 1,041 choices. The selected year-2 roster has 49 members. These timings include authorization and the named data loader; they exclude hosting startup, session reads, HTML rendering and browser work.

| Operation | Queries before → after | Median before → after | p95 before → after |
| --- | --- | --- | --- |
| Ordinary-teacher authorization | 6 → 1 | 306 → 51 ms | 371 → 91 ms |
| Ordinary-teacher dashboard | 8 → 3 | 365 → 109 ms | 402 → 186 ms |
| Master dashboard | 2 → 2 | 49 → 51 ms | 81 → 109 ms |
| Master year-2 graph profiles | 9 → 9 | 252 → 194 ms | 310 → 247 ms |
| Master individual profile | 9 → 9 | 204 → 161 ms | 272 → 218 ms |

The ordinary teacher has no access to this selected class, so their empty graph/report measurements are intentionally excluded from the comparison. Isolation is tested with synthetic authorized class/degree scenarios, including concurrent enrollment and revocation. Master dashboard timings show normal network variation rather than an improvement.

Serialized row JSON for ordinary authorization fell from 137,368 to 1,201 bytes (391 rows to 43 scope IDs). Master graph rows fell from 222,682 to 131,255 bytes with the same row count and retained report data. These are payload estimates, not HTTP wire-byte measurements.

Repeat the read-only measurement with:

```sh
npm run benchmark:remote -- --remote --class 2 --samples 20
```

The command reads `.env`, prints aggregate counts/timings, and does not print names, responses, SQL parameters or credentials. Choose a class the tested teacher can read for meaningful ordinary-teacher profile measurements. Do not compare a local run to these remote timings.

## Application startup comparison

`npm run benchmark:startup` starts five fresh Node processes per dynamic route against the actual Netlify build. It asserts HTTP 200 for login and 302 for the anonymous dashboard, and measures a subsequent warm request. It does not simulate Netlify container provisioning or an authenticated session.

| Route | Before: fresh-process median | After |
| --- | --- | --- |
| `/` | 294 ms | Static HTML; zero SSR invocations |
| `/en/` | 303 ms | Static HTML; zero SSR invocations |
| `/admin/login` GET | 308 ms | 239 ms cold / 1 ms warm |
| `/admin/dashboard` without a session | 304 ms | 321 ms cold / <1 ms warm |

The dashboard redirect did not improve: Astro loads its route module before middleware, including its own database imports. Do not claim that delaying middleware's import eliminates startup for all teacher routes. Authenticated teacher requests still need SSR and session storage.

Run the startup benchmark after `npm run build`; the development adapter may clear the build during tests/checks. The final artifacts contain all five static HTML pages, no private static teacher pages, and Netlify's generated function uses `preferStatic: true`. This behavior follows [Astro's prerendering](https://docs.astro.build/en/guides/on-demand-rendering/#prerendering-individual-routes) and [Netlify adapter behavior](https://docs.astro.build/en/guides/integrations-guide/netlify/).

## Remaining production verification

After Jon pushes and the deployment completes, repeat the first request following inactivity and several warm requests for the homepage, login and authenticated teacher pages. Compare Netlify function initialization/execution metrics with session and database timings. Monitoring, team loading and survey submission still need authenticated end-to-end measurements; no real survey was submitted for benchmarking. Agree on a practical target from these results. Keep #6 open until the deployed cold/warm comparison verifies the improvement; local startup and remote loader results are not a production cold-start guarantee.

Validation: all 55 tests pass, including real login/student submission and permission boundaries; the Astro/TypeScript check and production build pass. Existing adapter deprecation messages and the class-page hint are unrelated to these changes.
