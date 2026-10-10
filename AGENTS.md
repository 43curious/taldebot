# TaldeBot

Jon is an audiovisual university lecturer. Design for a teacher preparing a class, following up on students, and forming teams.

## Design direction

Preserve the minimal design established in `src/pages/admin/classes.astro`, `src/pages/admin/monitor/[projectId].astro`, and `src/components/ClassGraph.tsx`. Reuse the shared styles in `src/styles/teacher.css` for teacher-facing pages.

- Use a pale slate background, white surfaces, thin slate borders, and restrained teal accents. Panels have a 12px radius; controls have an 8px radius. Keep surfaces flat and reserve color for actions, selection, and meaningful status.
- Build hierarchy with spacing and typography: one concise page title, quiet labels and metadata, readable student names. Keep copy in Basque unless a page explicitly supports another language.
- Prefer compact student rows and simple selectors. Choose the degree first, including when there is only one, then the year/class. Keep the roster immediately below its controls.
- Show the main teacher task first. Put editing, explanations, and secondary actions behind a labeled disclosure or menu. Keep the existing student-list design when changing navigation or filtering.
- Give the class graph its own sidebar entry. Fill the available viewport beneath compact degree/year controls with a floating node graph. Show only nodes by default; reveal only the selected student's connections, and hide them when selection clears. Identify the source project quietly; show student reports in a floating overlay on the right, adapted to a bottom sheet on small screens. Use green for working preferences and comfort-zone links, red for avoidance; omit arrows. Abbreviate canvas names to “Name S.” while keeping full names in reports and accessible labels. Focus and zoom on selection; use a spacious floating report with project-scoped soft and hard skill self-assessments. Support dragging, pan, and zoom. Treat working preferences as private teacher information.
- Give controls visible labels, keyboard access, clear focus, and practical touch targets. Keep mobile pages within the viewport; pan and zoom the graph inside its canvas without scrolling the page. Respect reduced-motion preferences.
- Use specific empty states and useful action feedback. Retain entered data after validation errors. Confirm actions that delete responses or replace team assignments.

## Implementation

- Keep modules simple and use TypeScript types to express valid states.
- Keep continuous graph animation and camera movement outside React state; batch SVG geometry updates with animation frames and stop the loop when idle.
- Prefer existing components and styles before introducing another abstraction or dependency.
- Keep comments concise and current; explain behavior or intent where it needs clarification.
- Test meaningful behavior and data boundaries. Use focused tests and appropriate build checks; avoid repetitive smoke tests and tests that merely mirror markup.
- Preserve unrelated workspace changes. Ask before destructive actions beyond the user's request.
- Match survey participants to roster members using exact email or an unambiguous name. Preserve project boundaries and skip ambiguous matches rather than inventing relationships.

## Requests

Questions are read-only. Answer questions such as “how hard would it be,” “what are your thoughts,” or “is it possible” before offering changes, and ask before editing in response to a question. Explicit instructions to build or change something authorize implementation.
