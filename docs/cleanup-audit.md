# Remaining repository cleanup (#10)

Audited the current runtime, CLI, tests, configuration and tracked files on 2026-10-14, after the setup refactor and the identity, relationship, access and project-lifecycle changes. This is a consumer audit, not a new storage or grouping policy.

## Delivered changes

| Finding | Consumer evidence and change |
| --- | --- |
| `rosterGraph.ts` | Its two matching functions were imported only by two tests in `class-scope.test.ts`. No route, import command or runtime loader used them. The class graph joins `class_members.studentRecordId` to the durable student and finds participants through `students.studentRecordId`. Removed the module and its matching-only tests; retained the class-selector tests. |
| `replaceTeams` in `projectOperations.ts` | The only calls were its standalone tests and one archived-state assertion. The generation endpoint calls `generateDraft`; adjustment/confirmation call `adjustDraft`/`confirmDraft`. Their `persistDraft` transaction captures inputs and owns current team rows. Removed the unused direct-overwrite writer and its tests. The archival test now checks the actual confirmation service. |
| Dashboard script test's `esbuild` import | `esbuild` was available only through framework/tool dependencies. The project already declares TypeScript directly. The existing clipboard tests now use `typescript.transpileModule` to run the same inline script, with no added dependency. |
| Stale ownership and teacher instructions | Architecture documentation still named the retired graph matcher and team writer. It also described team loading before the ongoing-record workflow. Updated those descriptions and the teacher guide's default historical graph context. Unified user-management and archive/delete wording remains as delivered by #7/#8. |

These removals have no supported runtime consumers. Current identity resolution, conservative historical matching and manual identity review remain in `studentIdentity.ts`, `identityMatching.ts`, `scripts/migrate-tracking.ts` and `identityReview.ts`. Their full-name, ambiguity, project-boundary and migration tests remain.

## Identity and snapshot ownership

| Record | Mutable owner or necessary snapshot |
| --- | --- |
| `student_records` and `student_emails` | Current person identity and retained email aliases. Explicit correction updates the canonical name/email and current roster copies; earlier source values remain historical. |
| `class_members` | Current class membership view and class-specific roster metadata. Name/email are synchronized display copies linked through `student_record_id`; they are not another person's identity. Optional specialty, locality and private notes remain here under current policies. |
| `enrollments` | Dated membership. Ending membership retains its roster snapshot; shared profile loaders exclude private snapshot data. Multiple memberships remain valid. |
| `students` | Project participant snapshot plus project-local completion/attendance. Initial name/email identify the collecting context; a later canonical correction must not silently rewrite that original snapshot. A response may update its project-local contact email. |
| `responses` | Original project survey data. Still consumed by monitoring, Excel export, legacy card fallback, migration and response reset. It is not unused merely because normalized student knowledge exists. |
| `assessments`, `preference_submissions`, `preference_choices` | Dated normalized knowledge with questionnaire/scope/context and original source IDs. Existing raw legacy copies preserve import evidence; incomplete or ambiguous sources are not invented answers. |
| `team_drafts`, `teams`, `confirmed_assignments`, `assignment_members` | Immutable draft inputs, current per-algorithm display rows, and separately confirmed history. The two ID domains (project participant vs durable student) are intentional. Removing live team rows or drafts wholesale would break supported allocation views or provenance. |
| `identity_reviews`, `deleted_project_sources` | Unresolved/corrected source evidence and the retained context for student records whose working project was deleted. Preserve these independently of current membership or navigation. |

The overlap above is compatibility or an intentional historical snapshot, not permission to discard data. Migration matching resolves durable identities once and preserves uncertain cases. The graph does not repeat name/email heuristics on every read. Further specialty, module/group, editable-questionnaire and geographical-location ownership changes belong to #11–#16.

## Scripts, dependencies and artifacts

All maintained commands still have consumers. `migrate-classes.mjs` is an internal compatibility step called by `migrations.ts`; its preservation/rerun tests remain. `migrate-tracking.ts` preserves legacy answers and unresolved links and is called by that same entry point. `project-context.ts`, account setup, demo seeding and the three benchmark commands are documented tools. Generated migration SQL/snapshots/journal are required history, including migration 0003; none were changed or removed by this cleanup.

No declared dependency was proved unused. Runtime imports cover LibSQL/Drizzle, validation, password hashing, React islands/icons, CSV, Excel and email. Astro's React renderer imports `react-dom/client` and `react-dom/server` and declares the React DOM/type peers. Astro check requires its directly declared checker/TypeScript tooling. Tailwind/PostCSS, Drizzle generation, Vitest, tsx, dotenv and Prettier/Astro formatting have configuration or command consumers. A framework's deprecated transitive helper is not itself an unused application dependency.

Tracked-file inspection found no database, environment secret, installed dependency tree, build, session or Netlify runtime artifact. `.env.example` is the maintained configuration template. Public favicons remain intentional assets, including the conventional `/favicon.ico` URL. Personal editor files are addressed separately by #9; local copies remain intact.

## Verification

Focused class selection, clipboard, survey transaction and lifecycle tests pass. All 59 remaining tests pass on the fresh install, including identity matching, migration preservation, authorization, imports/exports and the authenticated teacher/student workflow. Astro/TypeScript reports zero errors/warnings and the production build passes. The three removed tests exercised retired implementations rather than supported behavior; no deletion smoke tests were added.

A standard `npm ci`, the explicit local migration command, check, tests and build all pass in an isolated temporary directory using the unchanged package manifest and lockfile (Node 26.10.0 / npm 11.19.1). No live database or personal `.env` is involved. Dependency versions and the lockfile are not rewritten as part of this bounded cleanup. Existing framework/tool deprecation messages and the class-page diagnostic hint remain outside this removal work.
