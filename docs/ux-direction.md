# Yama UX proposal

**Visual treatment rejected on 2026-10-07.** The user selected dark, expressive, dithered instead. See `visual-direction-v2.md` for the new direction studies. This document preserves the first proposal and its user-flow reasoning; its colours, type, and component appearance are not the current recommendation.

Proposed on 2026-10-07, before frontend implementation. The user authorized a sketching MCP fallback when tldraw was unavailable. The official Excalidraw MCP is configured and verified; the board has twelve editable desktop screens, a mobile companion, and an interrupted-voice example. The clickable walkthrough is a design preview with synthetic examples, not a running Yama application.

[Open the editable board](https://excalidraw.com/#json=P3wlM2tzSDCHSxWdh02tR,MutCLeCV1WVNzeWimd0WlA). A portable copy is in [design/yama-wireframes.excalidraw](design/yama-wireframes.excalidraw). The link contains only synthetic design examples. Anyone with the link can load the design; no incident records, credentials, or personal evidence were uploaded. This is an editable snapshot, not a live collaborative room.

## The central idea

One report, with a changing task. Saathi, Drishti, and Disha hand the user along a continuous journey. The report summary stays in the same place rather than making users learn three separate chat interfaces. Navigation reads **Narrate → Confirm → Connect → Understand → Act**. On narrow screens the same steps read Tell / Review / Links / Why / Act.

Start with the story and the next useful action. A large graph would demand interpretation before giving the user an answer, so connections open as readable findings. The graph is an optional explanation of the same findings. Essential assistance is always reachable and never sits behind checkout.

## What each visual step looks like

| Step | What the user sees | Primary interaction |
| --- | --- | --- |
| Welcome | A quiet, open page with a large, plain-language invitation. English / Hindi choice, two clear voice/text routes, small introductions to the three agents. Explicit synthetic-demo label. | Talk to Saathi or Write instead. No account wall for trying the synthetic demo. |
| Narrate | Saathi above a comfortable transcript column. Small dithered avatar, visible microphone state, one follow-up question at a time. A narrow “Your report so far” ledger beside the conversation. | Pause, switch to text, reply, or review details. Interim speech and final statements will have separate presentation and announcements. |
| Correct | The original utterance remains readable above a simple correction field. “Corrected by you” appears in the ledger and review row. | Save a correction without overwriting the original source. Return focus to the edited assertion. |
| Evidence | A modest file picker with accepted types/limits in the application, followed by individual file rows. Upload and extraction get separate labels. No theatrical success animation. | Attach, preview, remove, retry, or skip. The design preview attaches only an authored local sample. |
| Confirm | A vertical list of extracted statements. Each row carries its source and edit/remove control. Uncertainty appears as an explicit value. | Confirm these details. The copy distinguishes user review from independent verification. |
| Processing | The confirmed ledger stays readable. A small dot-matrix loader sits beside meaningful phases: entity links, incident patterns, explanations. | Cancel, retry, or continue with a partial result in the application. The preview explicitly opens synthetic results. |
| Connections | Two clearly separated sections: entity linkage and incident patterns. The example deliberately shows a similar sequence with no supported identity link. | Read an explanation or continue to next steps; open the graph only if useful. |
| Understand | Supporting facts and limits appear together, with source references. The desktop application can open this as a side panel; mobile uses a full-width detail screen with an obvious return action. The preview uses a full screen for readable review. | Inspect why a connection was suggested, including differences, missing information, and contradictory evidence. |
| Act | Disha introduces three manageable actions. A free checklist and access to the user's own report occupy the main column. Optional deeper intelligence sits in a quieter secondary area. | Choose an action, review/export the report, or request assistance. Optional purchases never replace essential assistance. |
| Checkout | Plain price, explicit ten-detail entitlement, hosted checkout, cancellation route. Pending verification is its own state. | Continue to Dodo test checkout in the application. The preview only demonstrates the pending state and never purchases anything. |
| Public exploration | A separate navigation destination with visible dataset provenance. Authored synthetic patterns appear as readable examples, with no invented prevalence statistics. | Explore approved public information; return to the private report. No private graph traversal becomes public by implication. |

Voice and text are two intake variants, giving the editable board twelve principal screens. The walkthrough combines both in one switchable screen. Evidence is optional and can precede confirmation or be revisited later. Confirmed changes invalidate prior derived results until recalculated; this behavior belongs in the forthcoming contracts and backend.

## Visual language

**Signature:** a small dithered companion next to clean type, plus a persistent report ledger. The artwork carries personality; the incident text carries authority. Do not dither instructions, transcripts, sources, or evidence previews.

Light appearance uses fog `#f4f7f6`, paper `#ffffff`, ink `#163b3a`, petrol `#165f56`, muted text `#536965`, and ochre `#77510b` for uncertainty. Dark appearance uses opaque corresponding surfaces and readable paired foregrounds. Colour is restrained: petrol for the current action, ochre with explicit text for uncertainty, error colour only for actionable failures. Agent identities use names and silhouettes, not three competing application themes.

Space Grotesk supplies the wordmark and headings; Inter supplies Latin body/control text; Noto Sans Devanagari supports Hindi. These are proposed fonts, to be validated together in the real frontend. Body text remains at least 16px in editable fields. Layout uses an 8px rhythm, approximately 28px desktop page padding, 18px mobile padding, 6–9px control/surface radii, and a 60–72-character reading measure. Prefer rules and whitespace over a dashboard full of enclosed cards.

```text
Desktop
┌ yama. ── Your report / Explore patterns / Free assistance ┐
│ Narrate ─ Confirm ─ Connect ─ Understand ─ Act            │
│                                                        │
│ agent + current task             Your report so far     │
│ transcript / review / reason     amount + uncertainty    │
│ one primary next action          original source        │
└────────────────────────────────────────────────────────┘

Mobile
┌ yama. + navigation ┐
│ Tell / Review / …  │
│ agent + task       │
│ readable content   │
│ primary action     │
│ report summary     │
└────────────────────┘
```

Decorative listening/speaking poses will be localized to the avatar. Processing does not move the report. Avoid entrance effects on evidence or instructions, long staggered text, forced transcript scrolling, and animations implying factual verification. Reduced motion uses static avatar/loader poses. The current walkthrough intentionally uses static artwork: the verified ASCII Magic sample for Saathi and temporary letter marks for Drishti/Disha. Final characters and animated exports remain to be designed.

## Component implementation map

- Intake: beUI `message`, `message-scroller`, controlled `prompt-input`. Scroll only at the live edge; separate interim speech from final announcements.
- Evidence: controlled beUI `FileUpload`, with server-reported lifecycle. Do not import `AttachmentUpload`'s timer-driven success behavior. `image-viewer` can handle safe previews after file validation.
- Review: clear inputs and optional collapsible secondary detail. Keep original sources and critical limitations expanded. Tabs are reserved for genuinely parallel content.
- Processing: beUI dither/dot-matrix `loader`, with real phase text and a static fallback.
- Shared tokens adapt every import. Retain beUI MIT notices. ForgeUI remains visual reference; no source has been copied.

## Review boundaries and next milestone

These are proposals ready for review, not implicit approval of production behavior. The sketching integration was verified via its public MCP endpoint; new native chat tool access still requires a session that reloads the MCP configuration. The board opened successfully in Excalidraw's editor. Twelve desktop layouts, responsive walkthrough reflow, Hindi intake, source-preserving correction, assertion removal, confirmation, graph disclosure, and payment-pending presentation are the design scope.

Before implementation, define draft revisions, assertion confirmation, source access, connection measures, voice events, and entitlements. The broader verification matrix still applies: interrupted voice, malicious files, stale confirmation, private graph leakage, duplicate payments, focus/scroll preservation, screen-reader behavior, and reduced motion require actual implementation tests. No live Sarvam request, database, application authentication, evidence upload, graph query, or purchase has been performed.

Preview checks are recorded in `design-preview-verification.json`: all eleven switchable screens fit 320px and 1024px browser viewports; Hindi text, multiline submission, correction/removal focus, local sample attachment, graph disclosure, and payment-pending presentation were inspected. Selected semantic and keyboard checks do not establish a full screen-reader audit. The final board overview is in `design/yama-wireframes-overview.png`.
