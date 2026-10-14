# Project archive, restoration and deletion

## Actions and access

Project rows show **Ezabatu betiko** (trashcan, master only) and **Artxibatu** directly beneath it. Archived rows show **Leheneratu** in the same position. The teacher must be able to read the whole project to archive or restore it; permanent deletion checks the current master role again inside its transaction. Every action gives confirmation and success/error feedback. The deletion endpoint also requires `confirmed: true`, so an old frontend calling the formerly archival endpoint cannot silently delete a project.

Archive removes the project from the active list and preserves its participants, answers, student knowledge, drafts and assignments. Survey, attendance and team mutations reject either an archival timestamp or `status=archived`. Pending project invitations are revoked atomically with archive; independent period invitations are unaffected.

Restoration uses `status_before_archive` to return to `setup`, `active` or `completed`, then clears the saved state. Projects archived before this feature may have lost their earlier status; those restore to **setup**, rather than inferring completion from responses or teams. Existing unknown archival dates stay unknown. Restoration revokes any remaining unconsumed project invitations, including legacy invitations, and never clears expiry, consumption or prior revocation. The normal teacher workflow can issue fresh links.

## Permanent deletion boundary

Deletion is one transaction. The following project-local records are physically removed:

| Table | Removed data |
| --- | --- |
| `projects` | Working project, access code, admin email, description and lifecycle fields |
| `students` | Its project participant snapshots and completion/attendance flags |
| `responses` | Its raw project response rows |
| `teams` | Its current draft/team display rows |
| `team_history` | Its legacy project pairing rows; these never established confirmed history |

The following remain:

| Records | Retained meaning |
| --- | --- |
| Students, email aliases, enrollments and class rosters | Durable identity and current/historical memberships, unchanged |
| Assessments, preference submissions and choices | Dated answers, original collection period/year, questionnaire version, project-name snapshot, source IDs and existing raw legacy data |
| Confirmed assignments and assignment members | Adopted allocation, revisions, author/date, captured inputs and `origin_project_id`; pair counts remain unchanged |
| Immutable team drafts | Historical allocation/decision inputs and authorship; retaining a draft does not confirm it |
| Pairing restrictions | Original rule, reason, author, scope and dates; deleted-project rules are never promoted to period rules |
| Update requests | Respondent, issuer, period, creation/expiry/consumption/revocation; pending source-project requests are revoked |
| Identity reviews | Review outcome, original IDs and source snapshot; no identities are merged by deletion |

Foreign keys to the removed project and its participant snapshots become null on these retained records. `deleted_project_sources` keeps the original project ID, name, type, academic period, collection year, creation date, deletion author/date, and IDs of its retained assessments, submissions, requests, restrictions, drafts, assignments and reviews. This immutable source record lets the retained history be reconciled after live foreign keys disappear. It is provenance, not a restorable working project; it contains no access code, admin email or replacement survey token. The deleting author's account is protected from deletion.

Before deletion, every remaining response must have both copied assessment/preference history or an explicit retained response-review case with original data. Unimported answers block deletion instead of being discarded. Unresolved participant identity reviews also block deletion, because their correction still needs the working participant. A master can resolve those cases or use reversible archive. Resolved participant reviews without a source snapshot receive their existing participant snapshot before removal. Other projects and their records are untouched.

## Migration and verification

Back up the installation and apply **0003_project_lifecycle** before deploying this code:

```sh
npm run db:migrate -- --remote
```

Use `--local` for a local installation. The migration adds the saved status and provenance table, normalizes existing archive flags, and revokes unconsumed invitations for existing archives. It does not guess a missing pre-archive status or original archive date, rewrite student answers, end enrollments or alter confirmed assignment history. A second migration run leaves the applied changes intact.

Focused tests exercise archive/restore, link expiry/consumption/revocation, independent invitations, archived mutation rejection, retained knowledge and pair counts, deletion permissions, review/import boundaries, foreign keys and rollback. The existing authenticated page test exercises separate endpoints, confirmation requirements, master-only deletion and ordinary-teacher archive/restore. Migration tests upgrade a database with the first three migrations and existing archived invitations. Production data is not changed during implementation.
