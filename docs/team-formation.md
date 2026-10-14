# Teams without a survey

Teachers create an activity from the maintained degree/class roster, then open its teams page. Repeated selections of the same durable student identity produce one participant; concurrent enrollments remain intact. Module groups remain in #12 and do not introduce a second assignment-history system.

Choose **Ausaz** (random), **Irakasleak eskuz** (manual), or **Gaitasunak eta hobespenak** (survey-informed). Random formation uses a Fisher–Yates shuffle, balanced team capacities and mandatory teacher separations. It ignores assessments, optional preferences and previous assignments. Constraint repair can change the initial shuffle; this is not a claim of uniform sampling of all feasible allocations. A bounded search reports failure without dropping constraints.

Manual formation starts with every active student unassigned. Choose the number of teams and select each student's team. Every active identity must appear once; teams have floor/ceiling-balanced sizes and mandatory separations must hold. Validation retains selections. Existing drafts can be adjusted separately. Attendance exclusions belong to the activity, not to the student's durable identity.

Saving any draft leaves confirmed history unchanged. Explicit confirmation retains the method in the immutable input snapshot, members, author, date and revision. Manually adjusting a generated draft retains its original method and records the manual-adjustment source. Old snapshots without a method remain survey-informed. Algorithm versions remain the existing v1/v2 storage slots, rather than masquerading as formation methods.

Independent update requests and later project surveys remain available. Their answers attach to durable students in the original collection context; they do not alter earlier draft inputs or confirmed memberships. Pair history counts each pair once per activity across revisions and every method. It describes recorded assignment, not proof of actual collaboration.

Random/manual formation needs no schema migration. Town-based formation additionally requires the location migration described below. Validation covers zero-response random/manual allocation, attendance, hard restrictions, stale drafts, permission scope, overlapping memberships, later answers and unchanged history; authenticated HTTP checks cover the method endpoints and teams page.

## Town-based formation

Jon chose **term-time town**, with the aim of keeping same-town students together (#16). The optional field belongs to the durable student record and is edited under “Ikasturteko bizilekua editatu” on the student page. Each currently responsible teacher can update or clear it; concurrent enrollments share it. Values have a 120-character limit. Ordinary teachers cannot edit inaccessible students.

Choose **Ikasturteko herriaren arabera** on the activity's teams page. Review the known/unknown counts and the linked student locations before generating. The `same-term-time-town-v1` policy packs larger town clusters into balanced capacities, repairs mandatory separations, then performs up to 50 improving member swaps that preserve those separations and capacities. This is a best-effort heuristic, not a guarantee of the global optimum. Unknowns fill remaining spaces without being considered a shared town. Skills, optional preferences and past teams do not influence it.

Town equality ignores case and whitespace and normalizes Unicode representation. Different spellings, bilingual names, and distinct municipalities are not inferred to be nearby. This mode does not use addresses, coordinates, geocoding, travel times or a distance limit. Use a consistent town name; manual adjustment remains available.

Draft cards show the towns captured for their members. The current location list and the confirmed allocation's retained locations are labeled separately. Snapshots retain the original town value, source and confirmation date plus the grouping policy, even when locations change before confirmation or after a project is deleted. Confirmation preserves the draft's inputs and rechecks current mandatory restrictions. Drafts create no confirmed pairing history.

### Migration and existing roster towns

Before deployment, back up the target database and apply `npm run db:migrate -- --remote`. The runner applies `0004_student_location.sql` (three additive columns) and reconciles roster suggestions after existing identity backfill. No production migration has been run as part of development.

A durable identity whose nonempty roster towns agree after case/whitespace normalization receives a **roster suggestion**, not a confirmed term-time residence. Conflicting towns leave the shared location empty; original roster values remain unchanged. Teachers must verify and save suggestions before they affect grouping. Reruns do not overwrite teacher edits or clears. Missing towns remain unknown. This avoids silently treating a historical home town as a current term-time residence.

Tests cover an existing pre-location database, fresh/legacy setup, conflicts, idempotence, shared enrollment, unknown suggestions, mandatory separation, permissions, length validation, immutable locations and authenticated edit/generate/confirm routes.
