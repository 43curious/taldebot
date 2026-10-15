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

| Operation                      | Queries before → after | Median before → after | p95 before → after |
| ------------------------------ | ---------------------- | --------------------- | ------------------ |
| Ordinary-teacher authorization | 6 → 1                  | 306 → 51 ms           | 371 → 91 ms        |
| Ordinary-teacher dashboard     | 8 → 3                  | 365 → 109 ms          | 402 → 186 ms       |
| Master dashboard               | 2 → 2                  | 49 → 51 ms            | 81 → 109 ms        |
| Master year-2 graph profiles   | 9 → 9                  | 252 → 194 ms          | 310 → 247 ms       |
| Master individual profile      | 9 → 9                  | 204 → 161 ms          | 272 → 218 ms       |

The ordinary teacher has no access to this selected class, so their empty graph/report measurements are intentionally excluded from the comparison. Isolation is tested with synthetic authorized class/degree scenarios, including concurrent enrollment and revocation. Master dashboard timings show normal network variation rather than an improvement.

Serialized row JSON for ordinary authorization fell from 137,368 to 1,201 bytes (391 rows to 43 scope IDs). Master graph rows fell from 222,682 to 131,255 bytes with the same row count and retained report data. These are payload estimates, not HTTP wire-byte measurements.

Repeat the read-only measurement with:

```sh
npm run benchmark:remote -- --remote --class 2 --samples 20
```

The command reads `.env`, prints aggregate counts/timings, and does not print names, responses, SQL parameters or credentials. Choose a class the tested teacher can read for meaningful ordinary-teacher profile measurements. Do not compare a local run to these remote timings.

## Application startup comparison

`npm run benchmark:startup` starts five fresh Node processes per dynamic route against the actual Netlify build. It asserts HTTP 200 for login and 302 for the anonymous dashboard, and measures a subsequent warm request. It does not simulate Netlify container provisioning or an authenticated session.

| Route                                | Before: fresh-process median | After                             |
| ------------------------------------ | ---------------------------- | --------------------------------- |
| `/`                                  | 294 ms                       | Static HTML; zero SSR invocations |
| `/en/`                               | 303 ms                       | Static HTML; zero SSR invocations |
| `/admin/login` GET                   | 308 ms                       | 239 ms cold / 1 ms warm           |
| `/admin/dashboard` without a session | 304 ms                       | 321 ms cold / <1 ms warm          |

The dashboard redirect did not improve: Astro loads its route module before middleware, including its own database imports. Do not claim that delaying middleware's import eliminates startup for all teacher routes. Authenticated teacher requests still need SSR and session storage.

Run the startup benchmark after `npm run build`; the development adapter may clear the build during tests/checks. The final artifacts contain all five static HTML pages, no private static teacher pages, and Netlify's generated function uses `preferStatic: true`. This behavior follows [Astro's prerendering](https://docs.astro.build/en/guides/on-demand-rendering/#prerendering-individual-routes) and [Netlify adapter behavior](https://docs.astro.build/en/guides/integrations-guide/netlify/).

## Remaining production verification

After Jon pushes and the deployment completes, repeat the first request following inactivity and several warm requests for the homepage, login and authenticated teacher pages. Compare Netlify function initialization/execution metrics with session and database timings. Monitoring, team loading and survey submission still need authenticated end-to-end measurements; no real survey was submitted for benchmarking. Agree on a practical target from these results. Keep #6 open until the deployed cold/warm comparison verifies the improvement; local startup and remote loader results are not a production cold-start guarantee.

Validation: all 55 tests pass, including real login/student submission and permission boundaries; the Astro/TypeScript check and production build pass. Existing adapter deprecation messages and the class-page hint are unrelated to these changes.

## Follow-up, 2026-10-15

Public requests to the current deployment still show a slow first login request. A fresh curl request measured `/admin/login` at 2,935 ms to first byte, followed by 501–550 ms; the first homepage request measured 657 ms and the next 373 ms. These are observations after a period without this client's traffic, not proof that a particular hosting container was cold.

The new read-only command was also run against that deployment (five requests per route, one Node fetch client with connection reuse):

| Route                                 | First request | Median | p95      |
| ------------------------------------- | ------------- | ------ | -------- |
| `/`                                   | 1,013 ms      | 39 ms  | 1,013 ms |
| `/admin/login`                        | 2,494 ms      | 243 ms | 2,494 ms |
| Anonymous `/admin/dashboard` redirect | 715 ms        | 257 ms | 715 ms   |

These two probes use different connection behavior; do not treat their medians as a before/after comparison. They separate initial HTTP cost from repeated requests but cannot attribute it to hosting, route startup or session storage. No production writes, push or deployment were performed.

### Measured query reduction

Project invitation validation previously loaded a full historical profile just to compute prefilled preferences which the project survey and submission handlers never consumed. A focused real-database query-budget test observed **16 queries** for that path and failed its seven-query budget. Validation-only callers now skip the unused historical-profile load, while keeping issuer, responsibility, identity, expiry, project, participant and attendance checks. Independent update form GETs retain their prefilled preferences; their POST validation skips the unused prefill read. This is a query reduction at the actual authorization seam, not a claim about deployed cold-start latency.

### Post-push measurement

Private dynamic responses now include aggregate `Server-Timing` entries:

- `app`: time inside the request measurement boundary.
- `session`, `user`, `access`: measured authentication/responsibility phases.
- `handler`: downstream page/API work, including its database reads and rendering.
- `db`: sum of measured database operation time; parallel operations may sum to more than wall time.
- `db_queries`, `db_rows`: aggregate counts, without SQL, parameter values, names, response content or cookies.

The timings do not include hosting provisioning, imports before middleware, browser work or all adapter/session finalization after middleware. They do not replace Netlify initialization/execution logs. Concurrent request metrics are isolated with AsyncLocalStorage; no access/data cache was introduced.

After pushing/deploying, run:

```sh
npm run benchmark:http -- --samples 20
# Set TALDEBOT_BENCHMARK_COOKIE privately in the environment for an authenticated session.
# Repeat separately for a master and a teacher with the selected class/project grants.
npm run benchmark:http -- --samples 20 \
  --path /admin/dashboard --path /admin/classes --path /admin/graph \
  --path /admin/students/1 --path /admin/monitor/1 --path /admin/teams/1
```

Replace IDs with authorized representative records. The command only GETs page paths, prints no body or cookie, and fails on unexpected HTTP statuses. `--budget-ms <n>` optionally makes it fail when first-byte latency exceeds an agreed target. The first sample is explicitly labeled “first request”, rather than falsely guaranteed cold. For submission timing, inspect `Server-Timing` on a legitimate, intended submission; the benchmark never submits artificial production answers. Synthetic end-to-end tests cover submission correctness separately.

Compare first requests after inactivity and warm medians/p95 under the same remote conditions. Record representative sizes, permissions and the final agreed latency target. **Jon requested that authenticated production verification remain pending until he pushes. #6 stays open for that comparison; these changes do not assert that deployed cold starts are resolved.**

Final local validation on 2026-10-15: all 80 tests pass, Astro/TypeScript reports no errors or warnings, the production build passes, and the isolated browser workflow passes without browser errors. The built application's five-process startup probe measured login at a 250 ms fresh-process median / 1 ms warm and the anonymous dashboard redirect at 325 ms / <1 ms. Both landing pages remain static. These measurements verify local behavior and are not the pending deployment comparison.

## Authenticated investigation and further fixes, 2026-10-15

After deployment of `048395d` and application of migration 0006, Jon authorized temporary master/teacher accounts for production measurements. The teacher received the four current class grants: 178 accessible students and one fully accessible project. The master could see all six projects, so dashboard payloads differ by design. The database contained 230 durable students, 178 roster memberships, 162 project participants, 131 legacy responses/assessments and 1,041 preference choices. The selected year-2 class contained 49 students.

### Deployed baseline

Twenty sequential requests per measured route used the same Node fetch client, manual redirects, private session cookies and complete body consumption. Values below are time to response headers, in milliseconds. They include network and hosting overhead; first requests are not guaranteed cold. Server-Timing separates measured application, session, authorization and database work.

| View                       | Master median / p95 | Teacher median / p95                |
| -------------------------- | ------------------- | ----------------------------------- |
| Dashboard                  | 492 / 511           | 522 / 655                           |
| Selected class roster      | 532 / 625           | 585 / 723                           |
| Year-2 graph               | 1,195 / 1,701       | HTTP 500; no valid percentile       |
| Individual report          | 785 / 888           | 886 / 1,116                         |
| Activity monitoring        | 512 / 677           | Not measured in the interrupted run |
| Activity teams             | 1,379 / 1,572       | 1,534 / 1,635                       |
| Fictional trial submission | 356 / 411           | 412 / 511                           |

The graph's first measured master request took 2,044 ms; the teams request took 1,743 ms. Typical measured session reads were approximately 25–50 ms; the current-user lookup took approximately 80–90 ms, and ordinary-teacher access added another approximately 84 ms. The teams page issued 22 queries for the master and 23 for the teacher, with roughly 1,000 ms inside its handler even on later requests. These results support reducing dependent database reads rather than introducing an access cache.

A separate anonymous probe measured the first login GET at 2,787 ms with only 6.1 ms of measured application work and zero database queries (five-sample median: 220 ms). Its delay was predominantly outside the middleware measurement boundary. This does not identify Netlify provisioning as the sole cause; it establishes that the empty login form needlessly depends on dynamic rendering.

The first benchmark attempt stopped on a trial-data harness error; its accounts were removed. The corrected run exposed the ordinary-teacher graph failure, removed its accounts, and a final targeted run completed the remaining teacher report/teams/trial measurements. All temporary accounts and grants were removed. The final targeted run compared every non-account application table before and after and found no changes. Passwords and session cookies were generated in memory and were never printed. Only the fictional, validation-only trial endpoint received submissions; these numbers do **not** measure persisted student survey submissions.

### Changes supported by these measurements

- Prerender `/admin/login`. Its unchanged form posts to dynamic `/admin/login/submit`; successful login still regenerates the session, and failed login renders the same form with its username retained and password omitted. No JavaScript is required. The shared login component contains no request/session data when prerendered. Private submission responses remain uncached. This uses [Astro's per-route prerendering](https://docs.astro.build/en/guides/on-demand-rendering/#server-mode).
- Read applicable preference choices and confirmed assignments using uncorrelated SQL subqueries in the initial profile batch. This removes an ID-only membership query and one dependent round trip. The original privacy checks, dates, unknown values, questionnaire versions and assignment/collaboration meanings remain intact. Source-project metadata is fetched alongside the other independent reads.
- Fetch class counts without transferring every class member's identity. Fetch names only for the selected class; load its participants and survey options in parallel. Accessible degrees/classes/project options remain scoped to current responsibility.
- Start independent team-page reads together. Fetch formation participants alongside their project; fetch profiles, restrictions and confirmed pair history together after validating participant identity/access. Pair-history membership IDs stay inside one SQL query.
- Repair the teacher graph/survey filter discovered by the benchmark: its correlated query referred to the physical `survey_collections` name while Drizzle's relational query used a different outer alias. An uncorrelated exclusion of collections containing inaccessible audience members preserves the same rule and works through the actual relational query. A focused test reproduces the original `no such column: survey_collections.id` failure and checks immediate audience-access revocation; the authenticated HTTP test also covers teacher graph/survey pages.
- Add password-verification timing to the dynamic login handler, without logging account names or credentials.

### Same-remote-database loader comparison

The loaders at `048395d` and these changes ran against the same live database from the same client, alternating their order over 20 samples. This is read-only database work, without hosting, sessions or HTML rendering. The teacher comparison uses the same scope IDs as the temporary account. Complete graph/report results and formation inputs matched; only the formation snapshot's new capture timestamp was excluded from equality. The graph query-budget test went red at ten queries and passes at nine while retaining preferences and confirmed peers.

| Role / loader              | Queries before → after | Median before → after | p95 before → after |
| -------------------------- | ---------------------- | --------------------- | ------------------ |
| Master graph profiles      | 10 → 9                 | 203 → 131 ms          | 243 → 190 ms       |
| Teacher graph profiles     | 10 → 9                 | 203 → 132 ms          | 261 → 166 ms       |
| Master individual profile  | 10 → 9                 | 164 → 103 ms          | 224 → 169 ms       |
| Teacher individual profile | 10 → 9                 | 181 → 105 ms          | 222 → 159 ms       |
| Master formation inputs    | 15 → 13                | 420 → 178 ms          | 434 → 223 ms       |
| Teacher formation inputs   | 15 → 13                | 421 → 183 ms          | 450 → 243 ms       |

These are improvements to the actual remote query paths, not deployed page before/after figures. Page-level parallelism and selected-roster scoping require deployment before comparing their HTTP effect. Existing `benchmark:remote` remains available for repeated current-loader measurements; compare the same access and selected data, excluding inaccessible/empty views.

### Validation and remaining deployment step

All 82 tests pass, including real login, failed-password retention, teacher graph/survey access, historical answers, query budgets and immediate permission revocation. Astro/TypeScript reports no errors or warnings (one existing class-page hint); the isolated desktop/mobile browser workflow and production build pass. `benchmark:startup` confirms `/admin/login` is now a built static HTML page with zero SSR invocations. The anonymous dashboard redirect remains dynamic (297 ms fresh-process median locally); no claim is made that all private cold starts have been eliminated.

No new schema migration is required for these performance changes. After Jon pushes this commit, repeat the authenticated HTTP comparison, including teacher monitoring and the repaired teacher graph, first requests after inactivity and a legitimate intended student submission. Agree the final latency target against those results; a proposed working budget is a warm page median below 1,000 ms and p95 below 1,500 ms for this dataset. Netlify initialization/execution logs are still needed to attribute hosting time. **Keep #6 open until that deployed comparison is complete; local/static and remote-loader results do not substitute for it.**

## Deployed comparison and remaining intermittent failure, 2026-10-15

The deployed `b2ecb67` was verified with the same representative class/project and temporary account scopes. Twenty requests per route and role completed successfully. The benchmark compared every non-account application table before and after: unchanged. Both accounts and their grants were removed. As before, the only POST of survey answers targeted the fictional, zero-write trial endpoint; persisted student submission latency remains unmeasured.

| View                       | Master median / p95 | Teacher median / p95 |
| -------------------------- | ------------------- | -------------------- |
| Dashboard                  | 490 / 534 ms        | 513 / 612 ms         |
| Selected class roster      | 595 / 629 ms        | 605 / 674 ms         |
| Year-2 graph               | 949 / 1,332 ms      | 995 / 1,151 ms       |
| Individual report          | 742 / 808 ms        | 818 / 846 ms         |
| Activity monitoring        | 517 / 607 ms        | 613 / 689 ms         |
| Activity teams             | 739 / 820 ms        | 803 / 1,023 ms       |
| Fictional trial submission | 327 / 435 ms        | 472 / 524 ms         |

The biggest page improvement is teams: master median 1,379 → 739 ms; teacher 1,534 → 803 ms. The master graph improved from 1,195 → 949 ms. The earlier deterministic teacher SQL-alias failure no longer prevents the 20-sample run. Dashboard, roster and trial measurements vary; these results do not establish improvements on every route. Private access checks remain uncached. The sampled team pages now issue 20/21 queries for master/teacher versus 22/23 previously.

The static login introduces Netlify's canonical `/admin/login` → `/admin/login/` redirect. The CLI previously rejected its HTTP 301; it now follows only same-origin 301/308 redirects that add/remove a trailing slash, with a bounded chain and unchanged query. Authentication redirects and cross-origin redirects still fail. Tests exercise actual HTTP requests and ensure cookies are not forwarded to another origin. Public five-sample results including that canonical redirect: login first 189 ms, median 197 ms, p95 281 ms, no SSR timing; homepage first 845 ms, median 40 ms; anonymous dashboard redirect first 209 ms, median 244 ms. These first requests are not guaranteed cold starts.

### Browser evidence

An authenticated desktop browser completed master dashboard/graph/trial views without rendering errors, then received **one teacher graph HTTP 500 around 13:02 UTC**. The run removed both accounts in its cleanup. A separate three-visit graph probe for each role completed all six requests, also with no rendering errors and with both accounts removed. That probe nevertheless measured a master first graph TTFB of **5,504 ms**, with graph ready at 6,616 ms; its repeats were about 1,313–1,325 ms TTFB. Teacher graph TTFB was 1,248 ms first and 1,036–1,134 ms repeated. Browser, HTTP client, connection and asset-cache behavior differ; the 20-sample HTTP table does not bound all first visits.

A subsequent 40-visit browser loop (20 per role) passed every graph request with no rendering errors. Master TTFB was 2,484 ms first, median 893 ms, p95 1,303 ms; teacher TTFB was 1,264 ms first, median 894 ms, p95 1,048 ms. Every non-account application table remained unchanged, and both temporary accounts/grants were removed (zero remaining). This failed to reproduce the intermittent error and does not establish its cause or resolution.

Chrome's same-origin encoded-transfer counters measured roughly 100–106 KB on first graph loads, including assets, and 21–23 KB on cached repeat visits. They include response headers and exclude external fonts. HTTP body counts are decompressed and must not be used as billed bandwidth. See [operating-costs.md](operating-costs.md) for provider quotas and the explicit monthly usage model.

### Failure diagnostics for the next deployment

The intermittent 500 cannot be attributed to the database, session store, rendering or hosting from the captured evidence. Netlify function logs were unavailable; Jon confirmed he could not supply them. No automatic database retries, permission caches or speculative infrastructure changes were added.

Private failed requests now retain aggregate Server-Timing even when downstream code throws. They receive a random `X-Taldebot-Error-ID`, a validated database error code in `X-Taldebot-Error` (or `SERVER_ERROR` without a recorded database failure), and, when available, `X-Taldebot-Query`: the first 12 hex characters of SHA-256 over a JSON array of parameterized SQL templates. Bound values never enter the fingerprint. A failed batch fingerprints its templates together; it does not identify an individual failing statement. The fingerprint is a correlation aid, not proof of root cause. A matching `[taldebot-request-failure]` server log contains only those identifiers, status and aggregate timing/counts. SQL, parameters, student identities, URLs, cookies and raw exception messages are omitted. An unhandled exception returns a generic 500; failed responses remain private/no-store. Failures before middleware or after streaming begins remain outside this boundary.

The HTTP CLI prints only validated failure identifiers, never response bodies, so an agent-run probe can capture evidence without access to platform logs. Real missing-table tests cover thrown and already-handled failures, fingerprint stability across different bound values, private caching and omission of private values. These diagnostics require Jon's push/deployment before they can identify another production failure. **#6 stays open:** the intermittent failure and first-request outlier are not claimed fixed, and a legitimate persisted submission still needs timing during normal use.

Follow-up validation: all 84 tests pass, Astro/TypeScript reports zero errors and warnings (one existing class-page hint), and the Netlify production build succeeds. No migration is required. The follow-up is committed locally for Jon to push; production still runs `b2ecb67` during these measurements.
