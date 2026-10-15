# BeautifulUI components supplied by the user

Integrated into the Yama frontend on 2026-10-08. These are application adaptations of the pasted source, with the supplied rendering patterns retained and gallery behaviors replaced by controlled Yama state. The twelve original files are preserved unchanged as `.tsx.txt`; `manifest.json` records SHA-256 hashes and application paths. The BeautifulUI MIT notice remains in `licenses/BeautifulUI-MIT.txt`.

**Current revision:** the user subsequently requested original component CSS with colour changes only. Original typography, spacing, shadows, radii, and motion have been restored. The 15–18 px imported-component overrides described below are superseded, and `shadow-plugin` is now installed for the official foundation CSS. See [CSS restoration and speaking portraits](../beautifului-original-css/README.md). The original files and this earlier verification record remain preserved.

| # | Supplied component | Application file | Where to see it |
| --- | --- | --- | --- |
| 1 | Loading State | `src/components/primitives/LoadingState.tsx` | Pixel-grid status and elapsed time while the fixture comparison runs. |
| 2 | Thinking | `src/components/primitives/ThinkingState.tsx` | Expand the work status in the transcript for disclosed steps and limitations. |
| 3 | Streaming Text | `src/components/primitives/StreamingText.tsx` | Every agent reply uses its prose rendering. It accepts stream updates; live provider streaming is not connected. |
| 4 | Approval Card | `src/components/primitives/ApprovalCard.tsx` | Check your notes, acknowledge the account, then explicitly confirm. Corrections reset confirmation. |
| 5 | Tool Chip | `src/components/primitives/ToolChips.tsx` | Expand “Two fictional examples” after a matching fixture comparison; expand individual source/pattern/identity rows. |
| 6 | Chat / Side Chat | `src/components/primitives/ChatComposer.tsx` | Shared chat/voice header, message composition, user bubbles, and workspace. |
| 7 | Prompt Bar | `src/components/primitives/PromptBar.tsx` | Tall composer, plus menu, agent selector, caption-preview control, send button, `@` sources and `/` shortcuts. |
| 8 | Recommendation Card | `src/components/primitives/RecommendationCard.tsx` | Next steps: download your local report or choose the files alternative. |
| 9 | Filter Table | `src/components/primitives/FilterTable.tsx` | “Detail status” in Your notes; counts derive from included/excluded details. |
| 10 | Side Nav | `src/components/primitives/SidebarNav.tsx` | Collapsible agent/tool rail; horizontal agent controls on phones. |
| 11 | Insight Cards | `src/components/primitives/InsightCards.tsx` | “A closer look” in comparison results: pattern and identity-limit pages. |
| 12 | Agent Screen | `AgentScreen.tsx.txt` | Preserved for a future actual capture workflow; not compiled or displayed. |

## Adaptations

- Source geometry, surfaces, pixel loader, disclosure rows, chips, cards, pager, and prompt/menu composition are used with shared Yama tokens and readable 15–18 px text. Agent artwork remains the requested dithered eagle, wolf, and elephant.
- The existing source-based Button, ContextCards, and TaskRows remain. GlideMenu is copied from the saved official registry source and reused in navigation, approval options, and prompt menus.
- Original gallery timers, sample sales data, fabricated tool sequences, autoplay media, fake dictation/capture, model upgrades, and no-op actions are not application behavior. Status comes from the existing fixture adapter and reducer. No inference calls or web searches are implied.
- Approval submits the current answer only after an explicit action. Confirmation is tied to the report revision and preserves focus. Streaming text never delays critical content or rewrites the user's account.
- Tool rows for the authored examples appear only when the reviewed account matches the comparison fixture. Changing a custom account does not fabricate a successful match.
- SidebarNav uses existing Lucide icons instead of the paid Central Icons package. `glimm` and `liveline` are not needed: there is no model-upgrade shader or unrelated sales chart. No packages were added in this increment.
- Supporting panels reset their reading position when a different panel opens; updates within a panel retain position. Expanded work lives inside the transcript scroller; the composer remains outside it. Reduced-motion CSS disables decorative animation.

## Verification

`npm run check`: TypeScript, ESLint, 45 frontend/state tests, and the production build passed. Added checks cover explicit approval payloads and focus, controlled work states, immediate mixed-script text, tool disclosures, filter counts, selected recommendation actions, shortcut/IME behavior, fixture eligibility, transcript following, and supporting-panel scroll position. Existing correction, provenance, handoff, retry, cancellation, report-download, and file-validation tests still pass.

Browser review covered the corrected fictional amount, explicit confirmation, comparison handoff, expanded work, source details, insight paging, report/file alternatives, `/review` with draft retention, Escape, desktop collapse with focus retention, the 320 px table scroller, Hindi chat and caption preview at 320 px, and Hindi prompt menus at 390 px. Page width matched the viewport in the narrow checks. Temporary viewport overrides were reset.

Saved previews: `approval-desktop.png`, `work-desktop.png`, `comparison-desktop.png`, `recommendation-desktop.png`, `voice-hindi-mobile.png`, and `prompt-hindi-mobile.png`. These are implementation evidence, not user approval of the visual design. Physical phone keyboards, manual screen-reader review, and live provider voice/streaming remain outstanding.

The previously retained `.acknowledgement`, `.acknowledgement input`, and `.approval-footer .small-muted` CSS rules were subsequently deleted after the user's explicit cleanup instruction. The `.approval-footer` layout and its comparison button still have live uses.
