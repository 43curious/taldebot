# Architecture and maintenance

TaldeBot is an Astro SSR application with React islands, Tailwind/shared teacher styles, Drizzle ORM and LibSQL. The production adapter is Netlify. Local development uses Astro and a file database; there is no maintained standalone Node deployment.

## Ownership

| Area                                            | Source                                                                                                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema and generated migration history          | [`db/schema.ts`](../db/schema.ts), [`db/migrations/`](../db/migrations/)                                                                                                                |
| Application/CLI configuration                   | [`src/lib/config.ts`](../src/lib/config.ts), [`src/lib/db.ts`](../src/lib/db.ts), [`scripts/database.ts`](../scripts/database.ts)                                                       |
| Typed request parsing and atomic project writes | [`input.ts`](../src/lib/input.ts), [`projectOperations.ts`](../src/lib/projectOperations.ts)                                                                                            |
| Dashboard loading and team presentation data    | [`projectData.ts`](../src/lib/projectData.ts)                                                                                                                                           |
| Shared student views and browser behavior       | [`StudentLanding.astro`](../src/components/StudentLanding.astro), [`StudentSurvey.astro`](../src/components/StudentSurvey.astro), [`studentSurvey.ts`](../src/scripts/studentSurvey.ts) |
| Locale copy, skill definitions and scale        | [`i18n.ts`](../src/lib/i18n.ts), [`skills.ts`](../src/lib/skills.ts)                                                                                                                    |
| Roster imports and identity matching            | [`roster.ts`](../src/lib/roster.ts), [`rosterGraph.ts`](../src/lib/rosterGraph.ts)                                                                                                      |
| Graph layout and student reports                | [`ClassGraph.tsx`](../src/components/ClassGraph.tsx), [`graphLayout.ts`](../src/lib/graphLayout.ts), [`studentReport.ts`](../src/lib/studentReport.ts)                                  |
| Allocation policies                             | [`teamMatcher.ts`](../src/lib/teamMatcher.ts), [`teamMatcherV1.ts`](../src/lib/teamMatcherV1.ts)                                                                                        |

The public routes `/`, `/en/`, `/student/form/:accessCode`, `/en/student/form/:accessCode` and both confirmation URLs remain stable. Survey route wrappers load the project and delegate rendering. Browser behavior is implemented once; language is explicit in the view, HTML document and submission. The form prevents implicit Enter submission and retains answers on failed requests.

## Data boundaries

Degrees/classes hold roster members. Projects have their own participant snapshots, responses, team allocations and team history. Cleanup does not add a persistent student identity or cross-project history model; that belongs to [issue #3](https://github.com/43curious/taldebot/issues/3).

Roster matching requires exact normalized email or an unambiguous name. Name ambiguity is checked across the entire roster even when displaying one class. Multiple participant snapshots resolving to the same member are skipped. Graph loading groups participants once per project and keeps the global ambiguity lookup.

Request schemas validate positive integer IDs, roster JSON, the 1–10 integer scale and relationship selection rules. Survey peer IDs are checked against the project inside the transaction. Project creation, survey submission, reset and replacement of one algorithm's team allocation use Drizzle/LibSQL transactions. Replacement preserves the other algorithm's allocation. Errors return JSON with validation errors as 400, missing records as 404 and unexpected persistence errors as 500. Authentication and session checks remain in middleware.

Dashboard statistics use two queries including grouped counts; nullable absence flags count as present, and projects with no students remain visible. The teams page loads project, allocation, participants and responses once, then prepares card props. Team cards render without querying. Generation and summaries index responses by participant ID. No allocation policy was changed by cleanup.

## Database workflow

[`scripts/migrate.ts`](../scripts/migrate.ts) is the only maintained migration entry point. It requires `--local` or `--remote`. Both fresh and existing installations use `npm run db:migrate -- <target>`; never use an implicit remote target or `drizzle-kit push` against an installation.

The versioned `0000_baseline.sql` and snapshot capture the current schema. On first application, the runner creates absent tables, applies the known legacy class transformation and adds the historically optional columns. It checks required column names/types and foreign keys before recording the baseline in `__drizzle_migrations`. Existing installations with additional columns such as `projects.class_id` keep them. Unsupported legacy layouts fail with a rollback; inspect them and write a reviewed compatibility migration rather than deleting the database. This check does not certify every possible historical constraint layout.

The class transformation retains class IDs, class members and legacy project/class references, removes the old global name/year restrictions and allows repeated year names across degrees. Its preservation/rerun tests remain in [`migrate-classes.test.mjs`](../scripts/migrate-classes.test.mjs). `migrate-classes.mjs` is now an internal compatibility function, not a separate CLI command.

Only teams whose schema predates `algorithm_version` are marked `v1`. Existing v2 values remain unchanged. Successfully applied migrations are journaled; the runner verifies the baseline hash and Drizzle applies later generated SQL migrations. Do not edit applied SQL. Generate future schema changes with `npm run db:generate`, review their SQL (especially SQLite table rebuilds), test fresh and existing paths, then apply to a backed-up target before deployment. Drizzle's workflow is described in its [migration documentation](https://orm.drizzle.team/docs/migrations).

Administrator setup is [`create-admin.ts`](../scripts/create-admin.ts). Initial creation leaves an existing account unchanged; `--reset-password` requires an existing account and changes only its hash. Passwords are supplied via environment and never printed. [`seed-demo.ts`](../scripts/seed-demo.ts) is optional, deterministic, local-only and transactional. It does not overwrite an existing demo project.

Retired commands and their purposes:

- `db/apply-schema.ts` created only the users table; replaced by complete migrations.
- `db/seed-admin.ts` and the old `create-admin.ts` had conflicting create/reset behavior; consolidated.
- `db/seed.ts` and `seed-exclusion.ts` were random scenario fixtures; replaced by explicit synthetic demo source and focused algorithm tests.
- `migrate-teams-version.ts` added the version column and labeled pre-version teams; preserved in baseline adoption.
- `migrate-turso-v1.ts` relabeled existing v2 teams and swallowed failures. Retired; never replay that transformation.

## Deployment, sessions and email

Netlify runs `npm run build`; migrations are an explicit pre-deployment operation. Production/Netlify runtime requires remote URL and token. Missing remote configuration fails clearly instead of opening a local database. CLI environment loading is explicit; application DB imports no longer call dotenv or use suppressed types.

Sessions expire after eight hours. Astro development uses filesystem storage under `.astro/sessions`; the Netlify adapter uses Blobs. Login regenerates the session and stores administrator ID/name. Middleware checks the administrator still exists for protected pages and API routes; legacy `admin_session` cookies provide no access. Logout destroys the session. Browser requests keep Astro's origin checks.

SMTP configuration is optional. Without a host, notifications are simulated; with a host, the port and credentials must be valid. No real SMTP or Turso credentials are needed in CI.

## Verification and formatting

`npm run check` checks TypeScript and Astro templates with directly declared tooling, as recommended by [Astro](https://docs.astro.build/en/guides/typescript/). `npm test` includes data-boundary, migration, graph/identity and authenticated SSR checks. Test databases are temporary files populated with synthetic data. CI uses the same commands followed by `npm run build`.

Prettier with the Astro plugin defines formatting for TypeScript, Astro, CSS, scripts and Markdown. Use `npx prettier --write <changed-files>` for focused changes. `npm run format -- <changed-files>` formats selected files, and `npm run format -- .` / `format:check` cover the whole repository; a bulk formatting pass should be a separate change, not mixed with behavior changes. CI does not currently require a whole-repository formatting pass.

The graph keeps camera and continuous geometry updates outside React state, batches SVG updates with animation frames and stops when idle. Cleanup leaves this rendering loop intact. See [AGENTS.md](../AGENTS.md) for the design constraints.
