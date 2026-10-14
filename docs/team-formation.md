# Teams without a survey

Teachers create an activity from the maintained degree/class roster, then open its teams page. Repeated selections of the same durable student identity produce one participant; concurrent enrollments remain intact. Module groups remain in #12 and do not introduce a second assignment-history system.

Choose **Ausaz** (random), **Irakasleak eskuz** (manual), or **Gaitasunak eta hobespenak** (survey-informed). Random formation uses a Fisher–Yates shuffle, balanced team capacities and mandatory teacher separations. It ignores assessments, optional preferences and previous assignments. Constraint repair can change the initial shuffle; this is not a claim of uniform sampling of all feasible allocations. A bounded search reports failure without dropping constraints.

Manual formation starts with every active student unassigned. Choose the number of teams and select each student's team. Every active identity must appear once; teams have floor/ceiling-balanced sizes and mandatory separations must hold. Validation retains selections. Existing drafts can be adjusted separately. Attendance exclusions belong to the activity, not to the student's durable identity.

Saving any draft leaves confirmed history unchanged. Explicit confirmation retains the method in the immutable input snapshot, members, author, date and revision. Manually adjusting a generated draft retains its original method and records the manual-adjustment source. Old snapshots without a method remain survey-informed. Algorithm versions remain the existing v1/v2 storage slots, rather than masquerading as formation methods.

Independent update requests and later project surveys remain available. Their answers attach to durable students in the original collection context; they do not alter earlier draft inputs or confirmed memberships. Pair history counts each pair once per activity across revisions and every method. It describes recorded assignment, not proof of actual collaboration.

No schema migration is needed for this change. Validation covers zero-response random/manual allocation, attendance, hard restrictions, stale drafts, permission scope, overlapping memberships, later answers and unchanged history; authenticated HTTP checks cover the method endpoints and teams page.
