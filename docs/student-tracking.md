# Ongoing student records

A student has one durable identity, with email aliases and dated enrollments. Class rosters are current enrollment views; projects keep their own participant snapshots and explicitly reference that identity. Moving or ending enrollment preserves earlier records. An email correction adds an alias rather than changing historical source data.

## Responsibility and privacy

Master administrators assign degree or individual class responsibility in **Erabiltzaileen kudeaketa**. A class grant does not grant its sibling classes. Access follows current enrollment; former teachers lose access after a transfer. A project is visible only when all its participants are accessible. Teachers can follow students they collected before enrollment; master administrators resolve cross-scope links. Existing installations grant no ordinary teacher access automatically: a master must assign responsibility.

Private roster notes stay with their author and masters. Ending enrollment snapshots the original roster metadata, but shared profiles never expose this snapshot. Restriction reasons are also private to their author and masters; the requirement to separate the pair is visible to currently responsible teachers. Peer names outside a teacher's scope are redacted. Graphs, reports, exports and team inputs use the same access boundary. Authenticated responses and token pages are not cached.

The master-only **Erabiltzaileen kudeaketa** panel creates accounts and edits roles and degree/class responsibilities together. Teachers use the existing `admin` role; Jon confirmed that additional `master` accounts can be created or promoted here. Master access is global; their saved responsibility grants are retained for a later teacher role. Role/account and grant writes are atomic. A master cannot demote or delete themselves, and the last master is protected. Accounts referenced as authors of records remain available; revise their responsibilities instead of erasing authorship. The former `/admin/access` page redirects to this panel.

## Dated knowledge and personal links

Profiles show the latest applicable self-assessment, its date and source, and earlier submissions. Missing scores remain unknown; they are not academic grades. Legacy authorship is unverified and synthetic demo records are labeled. Motivation is displayed only in its source project.

Working preferences have either a project or academic-period scope. An explicit project preference overrides that period's general preference only inside the project. Default class graphs and reports show each student's latest complete recorded relationship submission as explicitly labeled history, with its original source and date. Current-period, project and as-of context are secondary controls. This historical display does not make earlier choices current or applicable to a new team allocation. New projects prompt review of reused period preferences. See the [historical visibility investigation](relationship-visibility.md).

From a profile, request only skills, only preferences, or both without creating a project. Monitoring issues a personal project survey link. Links are random, stored only as hashes, valid for 30 days and single-use. Reissuing revokes the earlier pending link. Expiry, consumption, archival, class transfer or loss of the issuer's responsibility invalidates access. The project code remains an entry point, but cannot select another student or authorize writing a record.

An explicitly empty preference submission clears the applicable choices while retaining history; unrequested sections remain unchanged. Incomplete legacy preference data does not count as an explicit empty submission. A project response reset withdraws its copied knowledge and reopens that project's survey; dated source history remains. Archiving a project prevents further survey or team mutation and retains its records.

## Drafts, confirmation and history

Generation produces an immutable draft batch per algorithm; regeneration replaces only the current draft pointer for that algorithm. Teachers can move or swap members before adopting the allocation. Attendance is local to the project: absent students are excluded from formation, without changing their ongoing record.

**Berretsi esleipena** records an adopted assignment revision, author, date, canonical members, configuration and the dated input snapshot. Replacing an adopted allocation requires confirmation and ends the earlier revision without rewriting it. Generating, comparing and editing drafts creates no assignment history. Legacy generated teams are imported as unconfirmed drafts and need fresh input capture before adoption. Notifications use the latest confirmed assignment; exports label the shown draft or confirmed revision.

Pair history counts confirmed co-assignment once per source project across revisions. It describes allocation, not proof that students worked together. A teacher selects continuity, balance or variety. Student avoidance is a soft preference; teacher pairing restrictions are mandatory and have project or period scope plus a review date. An overdue review date does not relax a rule. If capacities cannot satisfy the restrictions, generation fails without replacing the prior draft and asks for a teacher decision.

Unknown input scores use the documented value 5 only inside the algorithm. Captured student assessments remain partial. Confirmation retains the generation inputs and separately captures the restrictions checked at adoption. Later student updates never rewrite an earlier assignment snapshot.

## Migration and retention

Back up the installation, then run `npm run db:migrate -- --local` (or explicitly `--remote`). `0001_ongoing_tracking.sql` adds the model; the transactional backfill preserves legacy tables, source IDs, raw answer values, original dates and project boundaries. Reruns import only unmapped sources. Exact emails and unambiguous roster names can link participants; ambiguity creates distinct provisional records and master review entries. Unknown dates remain unknown. No legacy draft is treated as confirmed history.

In **Identitateak berrikusi**, a master explicitly chooses the matching person or preserves a provisional person as separate. Source-specific correction remaps the participant/roster link and proven local preference targets; it does not merge people by guessing. Responses without a valid source participant are retained for inspection, not assigned an invented author. Review legacy links before forming teams.

The migration checks foreign keys and that every legacy response has a retained assessment or review entry. Verify record counts and test a restored copy before deployment. SQL schema migration and data backfill are separate transactions: a failed backfill leaves the added schema in place and may be safely rerun after the source problem is resolved. Do not delete or rewrite the migration journal.

Archive is reversible, and withdrawal and enrollment ending preserve history. Master-only permanent project deletion removes the working project and its local rows while retaining independent student history and original source provenance. It does not erase the student record or confirmed assignment history. See the [exact lifecycle and retention boundary](project-lifecycle.md). No automatic student-history purge is implemented. Teacher reflections and longitudinal teacher-authored observations are a later increment. Existing private roster notes remain supported.

Domain terminology is in [CONTEXT.md](../CONTEXT.md); the accepted decisions are in [docs/adr](adr/).

## Collection year and historical imports

Collection context is separate from current enrollment. `collectionYear` records the study year in which a survey was answered; unknown years remain null. Profiles and graph reports show the original project, academic period and collection year. Moving a student to second year does not relabel their first-year survey.

Full-name matching normalizes explicit `SURNAME, GIVEN NAME` order, case, spacing and diacritics, then requires a unique identity across the whole roster. It does not match first names, drop surnames, or resolve collisions automatically. Nonmatching emails still require review when the roster already has a different email.

For a known historical project, back up and migrate the explicitly selected database, then record the teacher-confirmed context:

```sh
npm run db:context -- --remote --projects 7,8 --period 2025-2026 --year 1
```

Use `--local` for a local installation. The command changes only project/assessment/preference context; answer values, timestamps, source IDs, current enrollments and confirmed input snapshots remain intact. Historical participants absent from the current roster retain standalone identities until their current enrollment is confirmed. Project preferences remain historical and local, rather than becoming current second-year choices automatically.
