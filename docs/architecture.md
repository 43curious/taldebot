# Architecture and maintenance

TaldeBot is an Astro SSR application with React islands, Tailwind/shared teacher styles, Drizzle ORM and LibSQL. The production adapter is Netlify. Local development uses Astro and a file database; there is no maintained standalone Node deployment.

## Ownership

| Area                                            | Source                                                                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema and generated migration history          | [`db/schema.ts`](../db/schema.ts), [`db/migrations/`](../db/migrations/)                                                                                                                                     |
| Application/CLI configuration                   | [`src/lib/config.ts`](../src/lib/config.ts), [`src/lib/db.ts`](../src/lib/db.ts), [`scripts/database.ts`](../scripts/database.ts)                                                                            |
| Typed request parsing and atomic project writes | [`input.ts`](../src/lib/input.ts), [`projectOperations.ts`](../src/lib/projectOperations.ts)                                                                                                                 |
| Dashboard loading and team presentation data    | [`projectData.ts`](../src/lib/projectData.ts)                                                                                                                                                                |
| Shared student views and browser behavior       | [`StudentLanding.astro`](../src/components/StudentLanding.astro), [`StudentSurvey.astro`](../src/components/StudentSurvey.astro), [`studentSurvey.ts`](../src/scripts/studentSurvey.ts)                      |
| Locale copy, skill definitions and scale        | [`i18n.ts`](../src/lib/i18n.ts), [`skills.ts`](../src/lib/skills.ts)                                                                                                                                         |
| Roster imports and identity matching            | [`roster.ts`](../src/lib/roster.ts), [`studentIdentity.ts`](../src/lib/studentIdentity.ts), [`identityMatching.ts`](../src/lib/identityMatching.ts), [`migrate-tracking.ts`](../scripts/migrate-tracking.ts) |
| Account roles and teaching responsibilities     | [`userManagement.ts`](../src/lib/userManagement.ts), [`access.ts`](../src/lib/access.ts)                                                                                                                     |
| Project archive, restoration and deletion       | [`projectLifecycle.ts`](../src/lib/projectLifecycle.ts), [retention boundary](project-lifecycle.md)                                                                                                          |
| Graph layout and student reports                | [`ClassGraph.tsx`](../src/components/ClassGraph.tsx), [`graphLayout.ts`](../src/lib/graphLayout.ts), [`studentReport.ts`](../src/lib/studentReport.ts)                                                       |
| Allocation policies                             | [`teamMatcher.ts`](../src/lib/teamMatcher.ts), [`teamMatcherV1.ts`](../src/lib/teamMatcherV1.ts)                                                                                                             |

The public routes `/`, `/en/`, `/student/form/:accessCode`, `/en/student/form/:accessCode` and both confirmation URLs remain stable. Survey route wrappers load the project and delegate rendering. Browser behavior is implemented once; language is explicit in the view, HTML document and submission. The form prevents implicit Enter submission and retains answers on failed requests.

## Data boundaries

Durable student records own dated assessments, scoped preference submissions, enrollment history and confirmed assignment memberships. Projects retain explicitly linked participant snapshots, survey completion and attendance. `studentIdentity.ts` manages identity/enrollment operations; `studentProfiles.ts` loads cohorts in bulk; `access.ts` applies current responsibility; `studentUpdates.ts` authorizes personal updates; `formation.ts` captures draft inputs and confirms assignments. Its methods reuse `allocationRules.ts` for mandatory separation and capacity-preserving repair; `locationFormation.ts` groups by verified term-time town. `studentLocations.ts` owns shared town edits and conservative roster suggestions. `classGroups.ts` manages reusable, class-scoped module groups with dated memberships and confirmed-assignment provenance. Group audience snapshots belong to activity creation and are retained in formation inputs and the deletion audit. See [student tracking](student-tracking.md) for boundaries and migration behavior.

Request schemas validate positive integer IDs, roster JSON, the 1–10 integer scale and relationship selection rules. Survey peer IDs are checked against the project inside the transaction. Project creation, survey submission and reset use Drizzle/LibSQL transactions. `formation.ts` owns generation, adjustment and confirmation: persisting a draft saves its allocation and input snapshot and changes only that algorithm's current team rows. Confirmation records the adopted assignment separately. Errors return JSON with validation errors as 400, missing records as 404 and unexpected persistence errors as 500. Authentication and session checks remain in middleware.

Dashboard data loading uses two queries including grouped counts, scoped to authorized projects; authorization is measured separately. Nullable absence flags count as present, and projects with no students remain visible. The teams page loads project, current allocation, participants and responses, then loads the draft, latest confirmation and applicable formation inputs. Team cards render without querying. Legacy project monitoring and exports still use original responses; current formation uses applicable dated student records and confirmed pair history, with hard teacher restrictions and teacher-selected continuity versus variety. Draft cards render captured input values when available. See the [remaining cleanup audit](cleanup-audit.md) for the ownership and consumer inventory.

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

`npm run check` checks TypeScript and Astro templates with directly declared tooling, as recommended by [Astro](https://docs.astro.build/en/guides/typescript/). `npm test` includes data-boundary, migration, graph/identity and authenticated SSR checks. The dashboard script test transpiles its inline TypeScript with the declared `typescript` dependency. Test databases are temporary files populated with synthetic data. CI uses the same commands followed by `npm run build`.

Prettier with the Astro plugin defines formatting for TypeScript, Astro, CSS, scripts and Markdown. Use `npx prettier --write <changed-files>` for focused changes. `npm run format -- <changed-files>` formats selected files, and `npm run format -- .` / `format:check` cover the whole repository; a bulk formatting pass should be a separate change, not mixed with behavior changes. CI does not currently require a whole-repository formatting pass.

The graph keeps camera and continuous geometry updates outside React state, batches SVG updates with animation frames and stops when idle. Cleanup leaves this rendering loop intact. See [AGENTS.md](../AGENTS.md) for the design constraints.
