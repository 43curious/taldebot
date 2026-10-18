# Direct teacher survey entry

Issue #18 replaces teacher-facing link generation/copy with **Bete inkesta ikaslearen partez** in project monitoring, class surveys and student-profile updates. The action opens `/admin/survey-entry` without creating an invitation. Profile updates retain the selected academic period and requested sections. Forms reuse `CollectionSurvey`, the existing question catalogue and validation; class surveys retain their launched questionnaire version and audience. Project forms retain the original required skill scale and student email.

`teacherSurveyTarget.ts` defines the three valid contexts and their return paths. `teacherSurvey.ts` loads the represented person and permitted peers; saves recheck the current account/role and responsibility. Project and collection submissions reuse their existing transactions, completion state and dated-knowledge writes. An answered collection or project cannot be submitted again without its supported reset flow. Independent period updates add dated knowledge and preserve unrequested sections. Opening a form makes no writes.

Student project self-completion remains available separately: enter the project code on the homepage, choose your name and complete the four-step survey. The server checks the code against the submitted project inside the save transaction and rejects archived projects, excluded/completed participants and outside-project choices. These answers record student authorship. An explicitly supplied invalid personal token is rejected rather than falling back to the code. The shared code does not verify individual identity; it grants only this project's roster and submission access. Class-survey and independent-update access still require their existing tokens or authenticated teacher entry.

Teachers acknowledge entry on the student's behalf. `entryProvenance` records `{ kind: 'teacher', teacherId, teacherName }` using the authenticated server-side account; the teacher name is a historical snapshot. New student-token submissions record `{ kind: 'student' }`. This identifies the operator without turning entered self-assessments into teacher observations. Older rows retain null/unknown authorship. Attribution appears in monitoring, student/source labels, collection responses, CSV and project Excel exports. Existing issued student links retain their original access, expiry and consumption checks; the teacher UI no longer generates/shares them.

## Deployment

**Apply `0007_teacher_entry_provenance.sql` to a backed-up database before deploying this application.** It adds one nullable JSON/text column to `responses`, `assessments`, `preference_submissions`, `survey_responses` and `collaboration_reports`. It does not replace tables, alter old answers or invent old authorship. The generated snapshot and journal are committed; do not edit applied SQL.

```sh
npm run db:migrate -- --local
# After backing up the intended live database, before deployment:
npm run db:migrate -- --remote
```

This development task tested isolated databases, including an installation migrated only through 0006 and then upgraded twice. Production data and schema were not changed.

## Verification

All 90 tests pass. Focused cases cover direct project/collection/period completion, teacher attribution, frozen versions, invalid peers, acknowledgment, duplicates, closure, access revocation, unknown skills and preservation of unrequested preferences. The migration test retains old answer values and null authorship and checks foreign keys.

A local browser with synthetic records exercised all three entry points, a failed submission followed by successful retry with values retained, return navigation, CSV attribution, Basque/English, a 390px teacher form, inaccessible students, grant revocation between opening and saving, and anonymous API rejection. No invitations were created. Browser checks used Chromium viewport emulation; real iOS/Android device verification remains pending. Astro/TypeScript and the Netlify production build pass.

On 18 October 2026, a synthetic project reproduced the help-only screen reached from a valid homepage code. The cause was the token-only rendering/submission gate introduced with ongoing tracking, not the project name or state. The restored project-code flow passed the original reproduction, HTTP checks in both languages and a browser run from homepage code through all four steps to saved answers and confirmation (390px Basque, desktop English). HTTP checks also cover wrong/missing codes, a mismatched project, excluded participants, duplicate submissions, archived-status-only projects and invalid personal tokens. The full 90-test suite passes; all writes during verification used disposable local databases.
