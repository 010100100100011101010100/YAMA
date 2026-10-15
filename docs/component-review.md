# Component source review

## Current implementation — selected buttons, Folder, and Matrix Orb

The user's latest component choices supersede the original pill-button styling described below. The shared Button now uses Aceternity's inner demo button style without its magnetic wrapper. Rare UI's Folder opens the local file chooser in Files; Matrix Orb shows actual running fixture comparison. Fraud and OTP remain unselected pending their source links. Only `clsx` and `tailwind-merge` were added as direct dependencies. Application adapters, licence notices, source hashes, exact usage, and verification are documented in [the component mapping](design/action-components/README.md). The unused LoadingState runtime and legacy native action-button CSS were removed; historical source snapshots remain.

The animal animation was rejected by the user. Further animal motion work is deferred, and the existing implementation is unchanged in this pass.

## Previous implementation — original CSS and speaking portraits, 2026-10-08

Original BeautifulUI foundation CSS, component sizes, spacing, pill buttons, shadows, and motion now supersede the earlier geometry and typography overrides below. Colours are isolated in `src/app/beautifului/yama-colors.css`. The foundation's malformed orphan gallery fragment was repaired; the raw snapshot remains unchanged. Its required `shadow-plugin` CSS dependency is installed with its MIT notice preserved. Eleven supplied primitives and the existing source-based Button, ContextCards, and TaskRows retain controlled application actions. See [restoration details and screenshots](design/beautifului-original-css/README.md).

Finer original animal portraits replace the coarse exports. A shared portrait component ties the green boundary, glow, and gentle motion to voice preview playing or a short delivered-text presentation cue. Pause, stop, and voice handoff clear the speaking state; selection alone does not activate it. Reduced-motion CSS keeps the outline static. TypeScript, lint, 48 tests, and the production build pass. Browser review covers keyboard confirmation, focus retention, source prompt dimensions, 320 px Hindi wrapping, pause/resume, and handoff. Live provider audio and manual reduced-motion browser emulation remain unverified.

## Latest implementation — user-supplied components, 2026-10-08

The user's twelve pasted files are saved unchanged under `design/beautifului-supplied/`, with hashes and a [component-to-screen mapping](design/beautifului-supplied/README.md). Eleven are now used as source-derived application components: LoadingState, ThinkingState, StreamingText, ApprovalCard, ToolChips, ChatComposer, PromptBar, RecommendationCard, FilterTable, SidebarNav, and InsightCards. AgentScreen is reserved for a future actual capture workflow.

This revision supersedes the selection notes below. SidebarNav is now selected with existing Lucide icons replacing its paid Central Icons dependency. GlideMenu is copied from the saved official source. No new packages were needed. The original source snapshots, MIT notice, and earlier registry reviews remain available for comparison.

The supplied rendering patterns are adapted to the controlled draft, revision-bound confirmation, fixture work, sourced results, local report download, and real panel actions. Autonomous demo completion, fake capture/dictation, fictional sales charts, and model-upgrade effects are omitted. Live provider text streaming and voice are not connected. TypeScript, lint, 45 tests, and production build passed; browser checks and implementation screenshots are recorded in the mapping above.

## Earlier review — BeautifulUI as the preferred AI interaction source

Inspected the live Prompt Bar and Approval Card plus downloaded the official shadcn registry items on 2026-10-07. The complete selected dependency closure and MIT notice are saved under `design/beautifului-source/`; `manifest.json` records URLs and SHA-256 hashes. These are review snapshots, not application imports. The current conversation preview adapts the interaction patterns with its own semantic HTML and Yama tokens.

| Primitive | Finding | Required adaptation |
| --- | --- | --- |
| Prompt Bar | Defaults to `demo=true`, runs synthetic drafts and model selection. Dictation inserts a hard-coded sentence after 2200ms; attachment picking adds filenames from fixtures. `send` calls the callback then immediately clears draft and attachments. Uses `glimm` for a model-change shader. | Disable/remove demo behavior, connect actual voice and upload events, use controlled state and retain text on failure. Omit model/integration menus and shader unless users have a meaningful reason to choose them. |
| Approval Card | `custom` answers live in separate local state; `send` passes only `answers` to `onSubmitted`. Radio selection schedules advancement or submission after 480ms; `send` reads state captured by that callback. | Submit both custom and selected values in one explicit, validated payload. Remove automatic advancement/submission; wait for backend acknowledgement before confirming durable state. |
| Context Cards | Accepts chunks and labels, but source chips are styled spans and initially invisible for 700ms. The default count is 32 independently of supplied chunk length. | Make authorized sources actual accessible links/buttons. Keep citations immediately visible, derive counts from data, and remove automatic delayed entrances for essential content. |
| Task Rows | `sequence` status follows an internal timer from pending to failed to done. Public status types are done/running/sequence, without controlled error/cancelled states. | Remove simulated sequence and accept explicit pending/running/failed/cancelled/done states from application events. Supply real retry handlers. |
| Streaming Text | Defaults to looping a timer-driven token replay; every `cite` token renders `sources[0]`. | Render incoming stream data with stable source IDs per citation, correct follow-ups, cancellation, and no replay/loop. Keep screen-reader announcements at useful message boundaries. |
| Loading State | Has a pixel grid, shimmer text, elapsed time, and a Surfer video variant hosted remotely. | Use pixel-grid variants with plain, readable status. Omit the video, shimmer, and repeated elapsed-time announcements. Bind visibility to actual work and keep motion static when reduced motion is requested. |

The selected source closure contains foundation CSS, Button, and GlideMenu. Dependencies declared across this closure are `glimm` and `class-variance-authority`. The official repository warns that its SidebarNav uses a paid Central Icons package; that component is not selected. Do not install the entire gallery or copy its analytics/email capture setup. [Official source and installation documentation](https://github.com/slev12397/beautiful-ui) · [MIT licence](https://www.beautifului.dev/license).

## Earlier installation and source adapters — 2026-10-08

The previous simplified adapters lost too much of the component source's visual grammar. The current revision directly uses the official registry's surface/grid rendering, chat section/header composition, task rows, source-card bar/chips, foundation aliases/elevations, and Button variants.

| Application component | Source and installation | Application adaptation |
| --- | --- | --- |
| `ChatComposer.tsx`, `ChatMessageView` | Manual copy/adaptation from `r/chat-composer.json` | Controlled Chat/Voice tabs and application-supplied messages; full-height workspace; no sample replies, timers, blur, or placeholder actions. |
| `PromptBar.tsx` | Manual copy/adaptation from `r/prompt-bar.json`, Tall layout | Same surface/grid and plus/send glyphs; controlled draft, IME handling, real local file action, real agent selector; no shader, fake dictation, sample integrations, or immediate clearing on failure. |
| `TaskRows.tsx` | Manual copy/adaptation from `r/task-rows.json`, List layout | Retains rows and spinner ring; only application-controlled running/ready/failed/canceled/stale states and actual action handlers. No fabricated progress or timed success. |
| `ContextCards.tsx` | Previously installed with shadcn, refreshed from `r/context-cards.json` | Restored card-bar and inset source-chip rendering; derived counts, accessible source buttons, immediate evidence availability. |
| `Button.tsx` | Installed with official shadcn CLI from `r/button.json` | Retains cva variants; 44 px targets, 15–16 px type, 6–8 px radii, no press-scale effect. Missing upstream `cn` helper replaced by a direct class-string join. |
| Foundation | CLI installation artifact plus selected rules in `globals.css` | Shared Yama colour tokens, official hairline elevations and card-bar spacing; no gallery textures, 14 px body reset, global delayed entrances, or analytics. |

Fresh raw registry JSON and extracted source are saved under `design/beautifului-2026-10-08/`. `manifest.json` records upstream URLs, SHA-256 hashes, file paths, and local snapshots. TSX snapshots use `.tsx.txt` so upstream demo code is not compiled as application code. MIT notices remain in `licenses/BeautifulUI-MIT.txt`. Inter's OFL notice is preserved with the locally bundled font.

Only `class-variance-authority` is required by the imported Button; `glimm` and the paid Central Icons package are not installed. The agent rail and voice shell use existing Lucide icons and Yama artwork. This deliberately avoids the gallery's paid SidebarNav dependency. Manual copy/adaptation is supported by the [official installation documentation](https://github.com/slev12397/beautiful-ui). The application-owned approval logic, scrolling, reducer, fixture adapter, and report export remain intact. beUI remains a reviewed supporting source, with no imported component in this increment.

## beUI — supporting controls

Inspected through native beUI MCP calls on 2026-10-07. This is a source review, not browser or accessibility-test evidence. No component source has been installed into the application yet.

| Candidate | Source findings | Yama adaptation |
| --- | --- | --- |
| `message-scroller` | Tracks the live edge and relinquishes following on wheel, touch, and upward-navigation keys. Includes reduced-motion handling. Its log defaults to `aria-live="polite"` and `aria-relevant="additions text"`; `contentProps` can override these. | Preserve reader position, offer an explicit new-message action, and control transcript announcements so interim tokens do not flood a screen reader. Test keyboard scrolling and focus in the actual layout. |
| `prompt-input` | Supports controlled value; Enter submits, Shift+Enter does not, and `isComposing` prevents submitting an IME composition. The uncontrolled value clears immediately after `onSubmit`; focus returns with `preventScroll`. | Use controlled state, retain the user's text on failed delivery, define cancellation/retry behavior, and label the composer in the selected language. Keep the provider/model selector out of the intake task unless users need it. |
| `file-upload` | `FileUpload` supports explicit queued/uploading/success/error items, progress, removal, and retry callbacks. It does not implement a server upload or enforce a file-size limit. The response also includes a different `AttachmentUpload` implementation. | Prefer the controlled `FileUpload` queue for evidence. Drive status from the real upload response, distinguish extraction from upload completion, and enforce type/size/ownership on the server. |
| `image-viewer` | Includes a modal scope with focus management, keyboard navigation, return focus, status announcements, and reduced-motion handling. | Use authorized local previews, descriptive alternatives, and failure states. Test Escape, zoom, focus return, and mobile behavior with actual evidence fixtures. |

## Upload detail that affects truthful states

The retrieved `AttachmentUpload` source starts a simulated upload lifecycle when files are added. A timer changes internal uploading IDs into completed IDs after 900 ms (140 ms under reduced motion), then holds completion for 1000 ms. Those internal flags are combined with the externally supplied item status. The row prioritizes uploading/completed states ahead of failed state.

That lifecycle is unsuitable for evidence uploads without adaptation: a timer can display completion independently of a successful server response and can temporarily mask a failed item. The current recommendation is to use the separate controlled `FileUpload` implementation. If `AttachmentUpload` is chosen during wireframing, replace its simulated lifecycle with application state before use.

## Installation review

MCP responses include dependency files and some previews, beyond the headline component. Inspect the actual shadcn registry item and its dependency changes before installing. Shared `lib/utils.ts` and `lib/ease.ts` occur in multiple component responses; retain one project implementation. Preserve the [beUI MIT notice](https://github.com/starc007/ui-components/blob/main/LICENSE) with any imported source.

The prompt-input source returned with `message-scroller` differed from direct retrieval only by a source-reference comment in this check. No behavioral conflict was found between those two copies. Record source hashes when installing, because registry responses can change.
