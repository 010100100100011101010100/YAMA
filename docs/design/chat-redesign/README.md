# Chat/conference redesign — 2026-10-08

The running frontend now centers a conversation with Saathi, Drishti, and Disha. This is a revision for review, not a claim of user approval.

- `chat.png`: desktop chat, 1280 × 720, Hanken Grotesk, 18 px messages.
- `voice.png`: desktop three-agent conference preview at the same viewport.
- `notes.png`: supporting notes/correction panel beside the conversation.
- `mobile-hindi-chat.png`: Hindi chat at 390 × 844.
- `mobile-hindi-voice.png`: Hindi conference preview at 320 × 640. On short screens the call area scrolls; the composer remains visible.
- `browser-measurements.json`: observed viewport dimensions, element rectangles, font styles, and modal/focus results.
- `verification.json`: verification scope and limits.
- `contrast.json`: all 19 enabled text/control token checks.
- `check.log`: successful TypeScript, lint, 30 frontend tests, and production build.

Native browser review also exercised correction from ₹18,000 to ₹8,000, confirmation, Saathi → Disha → Drishti handoffs, desktop modeless and mobile modal panels, Escape/focus return, Hindi layout, local file selection from the composer, and reading-position preservation. New messages stayed pending while the reader was at the beginning of the transcript, with “See new messages (2)” offered explicitly.

Backward tab wrapping from the first modal control returned document focus to BODY in the in-app browser. Forward Tab stayed inside a populated panel, modal state remained active, and Escape restored the opener. Backward wrapping and manual screen-reader use are not claimed as verified. Native downloaded-file review, physical mobile keyboards, reduced-motion emulation, and live audio remain separate checks. The implemented reduced-motion CSS and Motion handling are unchanged.

Voice is a caption-only preview: no microphone, audio, Sarvam, OpenAI, database, auth, or payments are connected. `upload-fixture.txt` is synthetic test input; the app selected only its name/type/size and uploaded no bytes.

Unused items retained under the user's explicit ask-before-removal rule:

- `@fontsource-variable/archivo` and `@fontsource-variable/newsreader` dependencies. They are no longer imported or loaded by the app; their historical license notices remain preserved.
- Legacy copy keys: `assistance`, `available`, `connections`, `emptyOutline`, `footer`, `privacy`, `reviseLabel`, `sourceCount`, `storyLead`, `storyTitle`.
- The two `.task-status p` CSS rules, after compacting the task status to a single line.

These can be removed in a small cleanup after authorization. Historical designs, provider documents, the state reducer, graph/backend scaffolding, and Python coordinator were deliberately preserved.
