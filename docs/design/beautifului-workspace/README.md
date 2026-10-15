# BeautifulUI workspace revision — 2026-10-08

Implemented after the 5/10 review and the request for actual BeautifulUI components. No claim of visual approval. The requested conversation, composer, task, source-card and button rendering comes from official registry source, with controlled application state replacing gallery simulations. The sidebar is a small application-owned composition to avoid the registry's paid icon dependency.

Current screenshots: `chat.png`, `voice.png`, `handoff.png`, `sources.png`, `comparison.png`, and Hindi phone views. `verification.json` records checks and remaining limits; `contrast.json` contains the measured token pairs. Raw upstream source and hashes are in `../beautifului-2026-10-08/`.

Validation: `npm run check` passed type checking, lint, 34 tests and production build. Contrast passed 19/19 token pairs. Browser checks verified real interaction states, correction, handoff, reading position, focus return, native modal behavior and 320/390 px layouts. Preview controls, microphone-off information and composer fit the measured short voice layout. Backend and live providers are unchanged.

## Unused legacy elements retained pending approval

The user's AGENTS.md asks for approval before removing unused elements. No cleanup of these legacy items was included in the redesign:

- Font dependencies: `@fontsource-variable/archivo`, `@fontsource-variable/newsreader`, `@fontsource-variable/hanken-grotesk`. Their notices remain with historical font artifacts.
- Legacy CSS in `src/app/globals.css`: `.context-heading`, `.context-heading h3`, `.count`, `.context-card`, `.context-card header`, `.context-card p`, and `.task-status p` / its phone override. Shared `.approval-heading`, `.state-tag` and `.source-button` remain used.
- Unused copy fields: `assistance`, `available`, `connections`, `emptyOutline`, `footer`, `privacy`, `reviseLabel`, `sourceCount`, `storyLead`, `selected`, `ready`, `previewTag`. `storyTitle` is used again by the current start view.

Historical mockups, screenshots, original artwork, registry snapshots and the unimported foundation installation artifact are provenance records, not cleanup candidates for this change.
