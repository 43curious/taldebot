# Public homepage mobile layout

Issue #19 changes the shared `StudentLanding.astro` used by `/` and `/en/`. The existing survey and admin layouts remain the reference for typography, spacing, borders and teal accents.

The fixed-width code row is now a six-column grid with five flexible fields and a narrow separator. Field height, font size and gaps scale with available width, using defined CSS dimensions. Each field has an accessible label; digits request a numeric keyboard and the letter requests text/uppercase. The start button stays in place and becomes enabled when the complete code is valid. The compact header keeps language and admin access reachable; on narrow screens admin access uses a labeled icon. The header, content and footer participate in normal flow so short screens can scroll rather than clipping controls.

`studentLanding.ts` retains uppercase normalization, whole-code paste (including separators), partial digit paste, forward focus, backspace correction, arrow navigation, invalid-code feedback, localized routing and language switching. Layout/validation requires no database calls. Both homepage routes remain prerendered in the production build.

## Verification

A Chromium browser checked both languages at 320, 390, 430 and 1280px. Code fields remained within the viewport, at least 44px tall and 40px wide, with no horizontal page overflow; the footer did not overlap the form. A 390×360 short viewport remained scrollable with usable controls. Functional checks covered invalid input, complete-code paste, lowercase-letter normalization, backspace correction, project routing, invalid-code feedback and switching language.

Before screenshots of the current public deployment were captured anonymously at 320px and 390px on 17 October 2026. The 320px baseline clips the outer code fields and admin-access link. Local after screenshots at 320px and 390px in both languages show the whole control/header within the viewport. These are viewport-emulation checks, not physical-device Safari/Android or software-keyboard tests. Those real-device checks remain pending. The production build confirms `/index.html` and `/en/index.html`; this layout change adds no schema migration.
