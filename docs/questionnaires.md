# Questionnaires, class surveys and actual collaboration

The class remains the workspace; the student remains a durable person across concurrent enrollments. **Inkestak** collects versioned answers for a recorded class audience without requiring a project. The original four-step project questionnaire and independent profile updates remain available.

## Teacher workflow

1. Choose degree and class in **Klaseak**, then **Inkestak**. The same class links to module groups, the graph and activity/team preparation.
2. Open **Galdera-sortak kudeatu**. Select and order the existing questions; edit their Basque/English titles and explanations. The initial catalogue contains the 15 existing audiovisual/soft skill self-assessments, the three working-preference questions and actual collaboration. Skill identifiers and the integer 1–10 scale retain their meanings. Wording edits must not repurpose an identifier as a different skill. This is deliberately a limited editor, rather than an arbitrary form builder.
3. Save and use **Galdera-sorta probatu (daturik gorde gabe)**. The authenticated preview uses fictional students and a validation-only endpoint, including for actual collaboration. It creates no invitations, responses, knowledge or assignment records. The existing **Inkesta probatu** still previews the original four-step survey.
4. Create/open a survey: choose a saved questionnaire, class, optional Sormena/Digitala specialty and zero or more module groups. Groups are combined as a union, then intersected with the specialty, with one audience row per durable student. Zero groups means the whole class. An optional project requires the audience to be active participants in that project; project motivation requires a linked project.
5. Generate each student's personal link and share that link with that student. Links last 30 days, are stored only as hashes and are single use. Reissuing affects only that student in that collection. It does not revoke another collection or the original project questionnaire.
6. Inspect completion and the original answers in the survey. **Erantzunak CSV** exports each answered version’s actual wording, stable keys, unknown/empty values and provenance; it is private teacher data, with spreadsheet formula escaping. Open **Harremanen mapa** for its scoped responses and the linked activity's team results. Close collection when finished; the links stop working and responses remain available.

## Preservation and ownership

| Record | Owns |
| --- | --- |
| Student and enrollment | Continuing identity and dated, possibly simultaneous class memberships. Current roster metadata and optional specialty remain class-specific. |
| Questionnaire | The teacher's named definition. Its ordered version content can be edited while unused. |
| Questionnaire version | The exact questions, order, types and bilingual wording answered. Launch locks a version even before the first response; editing then creates another version. Existing survey/version references do not move. |
| Survey collection | One fixed version, collection period, class/year and optional group/project context. Project identity/name are preserved when a project is later deleted. |
| Survey participant | One durable identity plus the original name, class/year, specialty and groups at inclusion, with inclusion date/author. Later roster/group changes do not remove or rewrite this row. Newly eligible students may be explicitly added; additions are dated. |
| Survey response | One immutable answer set for a named student in that survey and version. Completion is local to the collection, never a global student flag or the legacy project's completion flag. |
| Assessments/preferences | Normalized dated knowledge with the survey and questionnaire version, retaining stable skill keys and unknowns. Each preference submission records the kinds actually asked. New formation snapshots retain the contributing submission/survey/version/date for each kind. An unasked kind preserves prior applicable knowledge; an explicit empty answer clears only the asked kind in that scope. |
| Collaboration report | Only explicit peer answers: worked together or never worked together. Respondent, peer, survey, version and date remain available. Missing peer answers are unknown, never negative evidence. |
| Confirmed assignment | A teacher-adopted team revision. It is independent evidence and never creates or overwrites a collaboration report. |

Student reports show original survey/version links and separately sourced collaboration/assignment histories, including differing accounts. The graph's selected-survey view uses that survey's actual responses, without falling back to another survey's assessment or preferences. General current-period/history views can combine the latest applicable answer for each preference kind, with its own original source/date. Missing skills remain unknown rather than zero or five.

In a project-linked graph, **Mapa iragazi → Taldeen emaitza** compares confirmed teams with the latest saved v1/v2 draft results, including imported legacy results. Date filtering applies to both. Drafts require explicit selection and are labeled as saved, unconfirmed results; viewing them never changes assignment or collaboration history. Results include only the selected class's currently accessible students, without formation inputs or justifications. Skill highlighting fills the actual bubble blue and temporarily takes precedence over team colours; clearing it restores those colours. No database import is needed for the existing production results: all nine legacy drafts (47 teams, 255 memberships) were checked against their original team rows on 16 October 2026 with no discrepancies.

When showing an answered collection, `/admin/surveys/:id` renders questions from each response's actual version and peers present by its submission date. Definition edits, current names and later additions do not rewrite the original wording or turn absent answers into negative reports.

## Access and lifecycle

Templates are editable by their owner and masters. Survey creation requires class access, access to every selected student and, when linked, full project access. Overlapping group membership never creates duplicate invitations. Reading a collection and using its invitation rechecks current teaching responsibility for its class and all audience members; a revoked grant is effective on the next request. A master can inspect retained historical collections whose class has been deleted.

Student links recheck the issuing account, current access, expiry, revocation, consumption, student identity and collection state. Project archival revokes linked invitations; restoring a project does not reactivate those links. Closing a collection or deleting its project prevents further submissions. Permanent project deletion retains questionnaire versions, audience snapshots, responses, normalized knowledge and actual-collaboration evidence.

All teacher/token responses remain private and uncached. Token pages use `Referrer-Policy: no-referrer`. Preview validation and public submission are separate endpoints; public submissions always require a valid invitation.

## Migration and validation

`0006_clear_moonstone.sql` is additive: it creates questionnaire/collection/response/collaboration tables and adds nullable survey provenance and asked-kind metadata to existing knowledge/invitations. Existing preference submissions default to all three kinds, preserving their complete-submission semantics. Existing answers remain `skills-v1`; new comparable versions keep the same skill identifiers and 1–10 integer scale.

Apply migrations to a backed-up target **before deploying the new application**:

```sh
npm run db:migrate -- --local
# For the backed-up deployment database, explicitly choose the remote target:
npm run db:migrate -- --remote
```

No production migration is performed by development tests or these changes. Fresh/adopted databases, reruns, foreign keys, frozen versions, concurrent enrollment, overlapping groups, partial/empty preferences, invitation scope/revocation, preview isolation and project-deletion retention are covered by focused tests. Browser checks cover the teacher editor, real response flow, original-version display and graph filters.
