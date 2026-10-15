# Wireframe brief

This is the input brief. On 2026-10-07, the user authorized a different sketching MCP because tldraw remained unavailable. The official Excalidraw MCP passed creation, edit, and read-back checks. The first board now contains twelve desktop frames, a mobile intake companion, an interrupted-voice example, and a journey map. See `ux-direction.md` and `design/yama-wireframes.excalidraw`. The remaining alternate states below are design requirements, not claims of implemented behavior.

## Shared structure

Visible demo/synthetic-data label; language control; clear current step; one primary action per stage; persistent access to free safety assistance and a way to leave. Use plain language and comfortable reading widths. On mobile, collapse secondary context below the current task rather than compressing the transcript.

Proposed visual direction for exploration: warm neutral surfaces, dark readable text, one restrained accent, clear bordered controls, and dithered character artwork. This is a proposal to evaluate on the board, not a locked colour or font specification. Validate English and Devanagari together before selecting typography.

## Frames and interactions

| Frame | Primary task and content | States to place beside it |
| --- | --- | --- |
| 01 Onboarding | Explain synthetic demo, privacy limits and the three-stage assistance. Choose English/Hindi/Hinglish and voice/text. Start a synthetic example. | Keyboard focus, narrow screen, account/session unavailable |
| 02 Saathi: live intake | Visible live transcript, explicit microphone state, mute/end controls, editable text fallback, concise contextual prompt. Avatar conveys listening/speaking without replacing the status label. | Permission denied, connecting, listening, thinking, speaking, interrupted, reconnecting, disconnected |
| 03 Saathi: text intake | Message history and composer with predictable submission behavior. Preserve reading position when streamed output arrives. | Empty, typing, sending, error/retry, cancelled, new-message indicator when scrolled away |
| 04 Transcript correction | Correct an utterance without losing the original source. Distinguish interim from final transcription and show changed fields. | Hindi wrapping, long identifiers, duplicate partial/final events, failed save, conflict |
| 05 Evidence | Select files, show upload and extraction status separately, preview supported files, remove/retry, explain why evidence is requested. | Upload progress, rejected type/size, failure, quarantined, unsupported extraction, safe image preview |
| 06 Review and confirm | Review extracted assertions grouped by topic. Each assertion offers edit/remove and a source reference. Clearly describe what confirmation saves and what it does not verify. | Missing required context, uncertain assertion, all removed, stale revision, saving, failed confirmation |
| 07 Processing | Small beUI dither/dot-matrix loader with meaningful phase text. Keep the confirmed summary readable. | Slow service, retry, partial result, cancellation, reduced-motion static state |
| 08 Drishti: results | Separate entity-linkage from incident-pattern findings, with supporting and contradictory evidence. Offer an accessible list alongside the graph. | No connections, weak support, partial graph response, unavailable service |
| 09 Connection explanation | Explain an individual connection/path using authorized evidence references and limitations. Distinguish an exact identifier match from a similar narrative. | Negative evidence, retracted assertion, inaccessible source, insufficient evidence |
| 10 Disha: next actions | Clear actions, rationale, and optional export. Keep immediate safety/evidence-preservation assistance free and visible. | Action saved, export failure, no appropriate action, human escalation needed |
| 11 Checkout | Explain the free advanced-detail allowance and $10 / ten additional details. Show hosted test checkout and the unlocked-detail counter. | Cancelled, payment failed, awaiting verified webhook, verified purchase, duplicate event, already unlocked |
| 12 Public exploration | Synthetic/public/approved aggregate patterns with readable provenance and accessible filtering. Keep public data separate from private reports. | No matches, unavailable source, loading, empty dataset |

## beUI candidates to evaluate

- Intake: `message`, `message-scroller`, `prompt-input`.
- Evidence: `file-upload`, `image-viewer`.
- Review: `input`, `collapsible`, `tabs` only where the content actually benefits.
- Processing: `loader` dither or dot-matrix variant plus visible status text.

Imported controls must share the same tokens. Avoid hiding critical evidence inside collapsed sections by default. Do not force smooth scrolling on a reader who has moved away from the live edge. Motion must never move keyboard focus or announce every streaming token.

## Agent artwork brief

- **Saathi:** approachable intake companion; idle/listening/speaking/static poses.
- **Drishti:** attentive observation and careful comparison; thinking/result/static poses.
- **Disha:** calm guidance and orientation; presenting/acknowledging/static poses.

Use a consistent silhouette language and limited palette across the three. Avoid police badges, judgement imagery, surveillance eyes aimed at people, or animations implying a factual verification that has not occurred. Each export needs a static fallback. Artwork is decorative; agent names and states remain available as text.

## Review annotations

For every frame, annotate focus entry/return, reading order, status announcements, reduced-motion fallback, error recovery, mobile overflow, and whether the displayed data is private or public. Mark proposed interactions separately from approved ones. Record unresolved decisions before implementing their contracts.
