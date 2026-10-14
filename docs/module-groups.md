# Class enrollments and reusable module groups

Issue #12 builds on the existing durable identity and enrollment history. Jon confirmed one optional Sormena/Digitala specialty **per class**, groups reusable within one class, overlapping memberships, and creating random module groups by saving **confirmed activity teams** from the existing formation workflow.

The class roster remains the primary view. Its student editing disclosure distinguishes adding another enrollment from ending the source enrollment and transferring. Additions check current responsibility and explicit durable identity; they never end another membership. Ending one class enrollment also ends active memberships in that class's module groups, leaving other classes and earlier knowledge intact. Existing conservative name/email import and identity review remain unchanged.

The class's “Moduluko taldeak kudeatu” link opens degree-first class and group controls with the roster immediately below. Manual creation/editing and import from confirmed teams are secondary disclosures. Groups can be empty, renamed, have members added/removed or be archived. Members must be current, identity-reviewed students of the selected class. Group edits recheck current grants inside the transaction; mixed-class groups are rejected.

## Ownership and history

- `class_members.division` keeps the optional current specialty for that enrollment. Another concurrent class can have its own specialty.
- `class_groups` owns current group/module labels and its class scope, original class name, author/date and optional source confirmed-assignment ID. A module label is sufficient here; there is no new university/module administration system.
- `class_group_members` stores dated membership periods and addition author/source. Changes end rows and add rows; unchanged members keep their start date. Partial unique indexes allow one active membership per student/group while retaining earlier periods. Different groups may overlap.
- A module group is an **audience**, not proof of a working assignment or actual collaboration. Saving confirmed teams retains their original assignment ID and revision through that record. Import never creates another confirmation or changes pair-history counts. Only subsequent teacher-confirmed activity assignments add assignment evidence.
- A new activity can select a group's current members or a subset. Creation validates explicit durable IDs against both active group membership and the current class roster. Its `audienceSnapshot` retains class/name/year, module/group labels, group ID, selected IDs and capture date. Existing project participants still own that activity's roster/survey state.
- Later membership or label changes do not change a prior activity audience. Formation snapshots copy this audience; permanent deletion copies it to `deleted_project_sources`. Source group membership rows and confirmed assignments remain intact. Class deletion clears the current group/class reference while retaining original group class names and dated rows.

Archiving ends active group memberships and removes the group from current selectors; it preserves its stored membership history. Removing a group member does not end their class enrollment. Teachers see historical group names only with their current class scope, and no student names from outside the current roster are fetched for the history disclosure. Activity access continues to follow existing current teaching responsibility.

The current activity/survey workflow accepts a group audience. General independently configurable questionnaires and standalone survey instances remain #13. This change does not infer student-reported collaboration from assignments.

## Migration and validation

Back up the deployment database, then run `npm run db:migrate -- --remote` **before deploying**. `0005_class_groups.sql` creates two tables with restrictive identity/author/source references and adds nullable audience snapshots to projects and deletion audits. Existing activities have no invented group context. No production migration was run during development.

Tests cover concurrent enrollment and ending only one membership, overlapping groups, membership history, unchanged earlier activity audiences, stale/unknown identities, cross-class rejection, permission revocation, duplicate-name rollback across imported teams, unchanged pair counts and retained context after deletion. Authenticated HTTP checks exercise enrollment, group creation/editing, group audience creation and unauthorized edits. Type checks and the production build complete validation.
