# Chat components used

- **StreamingText**: adapted the user's supplied BeautifulUI source from `c3be5b60-aedb-4c07-b1ec-ae68b462ec00/Pasted text.txt`. A newly validated reply reveals words once, with the supplied typography/caret treatment. History stays fully visible. Reduced motion and Show full reply bypass the reveal. Delivery and the next handoff wait until completion. This is a presentation reveal after whole-response validation, not an unvalidated provider-token stream.
- **Message dividers**: a full-width subtle rule between every pair of messages, including user messages and agent-to-agent handoffs.
- **Rare UI Web Search**: installed with `npx shadcn@latest add swamimalode07/rare-ui/web-search`. Used under replies with actual server-returned public sources. Links are supplied by the existing source receipt, not invented by the component. Search-only links explicitly say the page was not read. No external favicon requests are made. Inline source links retain the existing keyboard/hover preview.
- **Rare UI Voice Note**: installed with `npx shadcn@latest add swamimalode07/rare-ui/voice-note`. Used for current agent audio in the voice-call area. The waveform is calculated from decoded audio, and position comes from the real Web Audio clock. Pause/resume controls the existing player. Seeking and speed changes are disabled so audio-bound handoff receipts cannot be bypassed. There is no simulated playing clock when no audio/transport is supplied. This adds agent playback controls, not a new asynchronous microphone-message recorder.

Rare UI's shapes and motion remain; colours and font inheritance use the existing Yama theme. Reduced-motion handling from the source is preserved. `src/lib/utils.ts` was inspected and retained during CLI installation. The copyright and the existing `licenses/RareUI.txt` notice remain, with visible attribution in README.

The final browser pass fixed the agent-message width so the source cards fit the mobile transcript. Simple comparison tables now have semantic column headers, escaped cell content and a keyboard-scrollable region on narrow screens. This does not enable arbitrary model HTML or unsourced links.

Verified at desktop (1440 × 1000) and mobile (390 × 844), with 12 dividers for 13 messages in the live walkthrough. [Desktop](graphrag-chat-desktop.png) · [Mobile sources](graphrag-chat-mobile.png). The production build, type checking and lint passed. SDK and candidate-review results are in [the verification artifact](graphrag-sdk-verification.json). The active-audio waveform/clock/pause flow is covered by player tests; a live Sarvam call was not exercised in this pass.

The private maps and reviewed PDF/DOCX exports remain deferred. No mascot-animation redesign is included in this pass.
