# Yama — Storyroom, v3

2026-10-07. The user rated v2 6/10 and found it generic, then suggested BeautifulUI for AI components. This pass establishes an inspectable proposal. It is not an approved production design.

## What changes

The current preview explores a dark plum story room with a folded ribbon companion. The user subsequently said they also liked the birds: retain them as a direction for the three distinct agent identities alongside this ribbon study. The same account opens into a source-and-correction view, a comparison with explicit limits, and optional next actions. The expression sits in the artwork and opening type; fields, checkboxes, and confirmations remain familiar.

The signature is **a story unfolding into a reviewable account**. The artwork is an exploration of that idea, not a finalized mascot. No police, surveillance, guilt, or omniscient-AI imagery.

## Visual system

The physical scene remains a person at home in subdued light, trying to explain an incident in their own words. The user explicitly chose dark, expressive, dithered.

| Role | Proposed token |
| --- | --- |
| Ink-plum background | `oklch(.22 .038 325)` |
| Component surface | `oklch(.275 .037 325)` |
| Raised control | `oklch(.32 .032 325)` |
| Main text | `oklch(.96 .008 325)` |
| Secondary text | `oklch(.78 .022 325)` |
| Structural border | `oklch(.42 .026 325)` |
| Interactive field edge | `oklch(.60 .026 325)` |
| Pale blue action | `oklch(.90 .035 230)` |
| Action text | `oklch(.22 .034 230)` |
| Coral agent/art accent | `oklch(.84 .07 35)` |

Archivo carries navigation, body copy, fields, and report headings. Newsreader italic appears only in the initial invitation and a few reflective phrases. IBM Plex Sans Devanagari carries Hindi. These are loaded font families in the preview; the v2 images only illustrated typography. Sources: [Archivo](https://fonts.google.com/specimen/Archivo), [Newsreader](https://fonts.google.com/specimen/Newsreader), [IBM Plex](https://github.com/IBM/plex).

Controls use 6–7px corners; bounded source/composer/approval surfaces use 10–12px. Most content is unboxed. Contrast checks are recorded separately; browser checks cover fitting at 320px and 1024px viewports.

## AI component source

**BeautifulUI is preferred for AI-specific interactions.** beUI remains a candidate for controlled evidence upload and image viewing. ForgeUI remains visual reference under the earlier licence decision.

[BeautifulUI's official repository](https://github.com/slev12397/beautiful-ui) publishes React/TypeScript components and a shadcn registry. Its [MIT licence](https://www.beautifului.dev/license) permits adaptation and redistribution with the notice. The registry source, dependency closure, hashes, and licence have been saved in `design/beautifului-source/`. These are inspection snapshots, not installed application components.

| BeautifulUI primitive | Yama adaptation |
| --- | --- |
| Prompt Bar | Voice/text intake and attachments. Remove demo dictation, model switching, fake integrations, and self-running drafts. Retain text on failed delivery. |
| Approval Card | Review and explicitly confirm assertions. Include custom text in the payload; remove automatic advancement/submission. |
| Context Cards | Original sources and evidence excerpts with provenance. Sources appear immediately and open an authorized original. |
| Task Rows + Loading State | Actual processing phases, failures, and retries. Never use timer-driven success; prefer pixel-grid variants with plain status text. |
| Streaming Text | Explanations with correct per-citation source references. Append real data and preserve reading position; no looping or artificial stream replay. |

Registry installation is per component during the frontend stage, for example:

```sh
npx shadcn add https://www.beautifului.dev/r/approval-card.json
```

Inspect the imported foundation and shared helpers before merging. The registry foundation is a separate CSS file; do not overwrite Yama's global system with the entire gallery stylesheet. The selected closure uses `glimm` and `class-variance-authority`; it does not select the paid Central Icons sidebar. A simplified composer may omit the unused shader dependency after source adaptation.

## Clickable flow

1. **Your story:** a dithered companion beside readable original words and a compact composer. Additional notes stay in the conversation. The voice preview states that the microphone is off.
2. **Check details:** original words remain visible next to proposed assertions. The fixture intentionally extracts ₹18,000 from an account that says ₹8,000, so the user can inspect and correct a failure. Saving records the correction separately; edits invalidate confirmation. Leaving out an item preserves the original and moves focus to the next included detail. Missing date remains missing.
3. **Connections:** gated by explicit confirmation. A synthetic shared sequence is explained with supporting material, a difference, and what remains unknown. Incident pattern and entity linkage are separate. No graph database or private reports are accessed.
4. **Next steps:** the user's account and essential assistance remain free. Deeper intelligence is secondary: about 30% free, then $10 for ten extra details. Preview checkout states that no payment or entitlement is created.

On mobile, the artwork becomes a small identity beside Saathi's name. Review and explanations stack at full width rather than squeezing a sidebar. English and Hindi intake copy, journey labels, and headings can be compared; this is **partial localization**, not a completed Hindi interface.

The next conversation design must support all three agents in one voice/text transcript: a compact bird selector, visible speaker attribution, meaningful background-work states, and handoffs that preserve reading position and focus. The current v3 preview does not implement that interaction. See `agent-orchestration.md` for the example flow and tested coordinator contracts.

## Artwork and motion

Built-in image generation produced the transparent folded-ribbon source. ASCII Magic's free Dither style rendered it with Bayer 4, original palette, 3px cells, contrast 100, and chromatic post-effects disabled. Transparent alpha was preserved in the source, full render, and 410×512 preview.

Files: `design/saathi-fold-source-v3.png`, `design/saathi-fold-dither-v3.png`, `design/saathi-fold-preview-v3.png`. The exact generation prompt is in `design/art-prompt-v3.json`; the ASCII recipe and editor link are in `design/ascii-recipe-v3.txt`.

Starting the explicit voice preview causes a short, bounded 2° companion posture shift and pixel-grid status animation. Pause stops the animation. Reduced-motion CSS keeps both static. This is a CSS motion study around a static asset, not a verified animated artwork export. The three agents' bird silhouettes, related ribbon alternatives, and pose frames remain to be designed after direction review.

## Scope and verification

The conversation preview adapts the inspected BeautifulUI interaction patterns into semantic HTML. It does **not** run the downloaded React components, voice models, persistence, upload handling, graph queries, safeguarding assistance, or payment checkout. Sources and comparison content are fictional fixtures. Typed notes are not re-extracted. Only presentation choices are saved to conversation state; typed notes and confirmation data are not persisted there.

Browser checks record validation, correction provenance, removal/focus, confirmation gating/invalidation, composer keyboard behavior, partial Hindi wrapping, voice-preview truthfulness, and geometry. A full screen-reader audit, reduced-motion browser emulation, production security checks, and integration tests remain required during implementation.

Evidence: `design/storyroom-verification-v3.json` records 14 local interaction checks and 12 layout checks. `design/storyroom-contrast-v3.json` records eleven token contrast pairs. Screenshots are `design/storyroom-intake-v3.png`, `design/storyroom-review-v3.png`, and `design/storyroom-mobile-hi-v3.png`. These checks establish prototype behavior only.

The v1 and v2 files remain historical references. No existing source or tool configuration was removed.
