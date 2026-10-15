# Original component CSS and speaking portraits

Implemented on 2026-10-08 in response to the user's request to restore BeautifulUI's original styling, change only its colours, reduce animal pixelation, and add a green glowing boundary with slight movement while speaking.

## Source restoration

The saved official `foundation-foundation.css` is imported as `src/app/beautifului/foundation.css`. It retains the original typography, spacing, radii, shadows, keyframes, and dark theme rules. One malformed orphan gallery fragment (`.records-footer-hint` followed by an unmatched closing brace) was removed to make the CSS valid. The raw source snapshot remains unchanged.

`src/app/beautifului/yama-colors.css` contains colour overrides only. Button uses the saved official variants with pill corners and original press scaling. Its missing `cn` helper remains replaced with a direct class-string join. The foundation requires `shadow-plugin/unprefixed`; `shadow-plugin@2.1.1` is installed and its MIT notice is saved in `licenses/Shadow-Plugin-MIT.txt`.

The eleven imported supplied primitives restore their original class values for component typography, padding, geometry, and motion. For example, the Tall prompt has 22 px corners and 14 px padding, ChatComposer has 14 px corners, and the foundation body is 14 px. The previous imported-component 15–18 px type, 44 px controls, and boxy Button overrides are superseded. The twelve supplied source files and their hashes remain unchanged under `../beautifului-supplied/`.

Functional adaptations remain: controlled messages and drafts, explicit confirmation, native accessible inputs, application-driven work state, truthful fixture results, source controls, and local file/report actions. The chat workspace fills the available application height rather than retaining a gallery demo's fixed dimensions; responsive layout belongs to the application shell. No gallery timers fabricate completed work, dictation, or successful approvals. AgentScreen remains reserved for an actual capture workflow.

## Artwork and speaking state

| Agent | Current asset | Unchanged original |
| --- | --- | --- |
| Saathi | `public/agents/saathi-eagle-fine.png` | `assets/agents/2026-10-08/saathi-eagle-source.png` |
| Drishti | `public/agents/drishti-wolf-fine.png` | `assets/agents/2026-10-08/drishti-wolf-source.png` |
| Disha | `public/agents/disha-elephant-fine.png` | `assets/agents/2026-10-08/disha-elephant-source.png` |

These finer portraits were already generated earlier; they were copied unchanged in this revision. No new generation or raster editing was performed. Smooth browser rendering replaces the coarse pixelated rendering. Monochrome angular texture remains visible. The three source PNGs total about 5.4 MB; production asset delivery can be optimized separately. Previous coarse exports and recipes remain preserved.

`AgentPortrait` is shared by the rail, transcript, and voice preview. Speaking adds a green 1.5 px outer boundary and two soft glow layers. The initial uniform bob and tilt has subsequently been replaced by [distinct animal motion](../animal-motion/README.md): a slow float, head yaw, trunk movement, and beak/feather movement. The boundary stays still, and the artwork moves inside it.

- Voice: the playing caption-preview state activates the selected agent. Pause, stop, and handoff clear the cue. Resuming activates only the newly selected agent.
- Text: an actually delivered agent reply gets a 2.4 second presentation cue, including its latest transcript portrait. The initial greeting and language changes do not replay it. This does not claim live streaming or speech.
- Reduced motion: application CSS disables movement and transitions while retaining the static green boundary and glow. Decorative portraits remain hidden from assistive technology; names and status labels remain readable.

## Verification

`npm run check` passed: TypeScript, ESLint, 48 tests across six files, and the production build. Three new tests cover selection versus speaking, preview pause/stop/handoff/resume, and delivered-text expiry without stealing composer focus or replaying on language changes. Existing provenance, correction, confirmation, file validation, transcript following, and fixture tests pass.

Browser checks verified keyboard acknowledgement, explicit confirmation with focus retention, and voice handoff/resume. At 320 × 720, Hindi wraps without horizontal page overflow; measured prompt geometry is 22 px corners, 14 px padding, and 14 px input type. Reduced-motion CSS was inspected; manual OS/browser emulation, physical-phone keyboards, screen-reader review, and live provider audio remain outstanding. Voice is still a caption preview with the microphone off.

Saved evidence: `approval-desktop.png`, `speaking-desktop.png`, and `voice-hindi-mobile.png`. These are implementation evidence, not user approval of the visual design. Temporary browser viewport overrides are reset after verification.

The previously retained `.acknowledgement`, `.acknowledgement input`, `.approval-footer .small-muted`, and `.voice-speaker > svg` rules were completely removed in the subsequent animal-motion revision after the user explicitly authorized deletion. Both desktop and mobile copies of the SVG rule were removed.
