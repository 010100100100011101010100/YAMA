# Agent addressing and shared coordination

The composer selector chooses the recipient of the next text message and defaults to Saathi. It is separate from the currently speaking agent; automatic handoffs do not change this selection. The adjacent information button describes that selected role. Manual selection retains the existing ability to cancel a pending response or pause a voice preview.

## Routing rules

| Message | First speaker | Continuation |
| --- | --- | --- |
| `@Drishti, explain similar cases.` | Drishti | Role-appropriate handoffs when enabled |
| `Disha, help with next steps.` | Saathi | An explicit `@Disha` bridge, then Disha |
| No agent address | Selected recipient, initially Saathi | Role-appropriate handoffs when enabled |

Explicit handles take priority over plain names and the picker. When multiple handles occur, the first recognized handle chooses the initial recipient; this is sequential dialogue, not simultaneous output. English and Hindi aliases are recognized, case-insensitively for Latin names. Code excerpts, blockquotes, URLs, email addresses, partial names and unknown handles do not select a role. Original messages are saved without removing or rewriting addressing text.

Typing `@` opens the agent list with each role's nature. Hindi aliases also filter the list. Arrow keys select, Enter inserts a canonical handle without sending, and Escape dismisses the list. Completion works at the caret and preserves following text. The plus menu remains for files and sources; slash commands remain separate. The list exposes its active option to assistive technology and follows viewport changes.

## Server ownership

`src/lib/agent-addressing.ts` supplies the common resolver, but the server independently resolves the latest owned, saved message. A caller cannot submit a different message body or invent a role. Request receipts retain existing idempotency checks. Routing context stays with the persisted turn and follows its handoff.

For a plain-name request, the first Saathi reply must contain the requested handoff intent. The fixture produces a localized bridge; a configured live model receives the same routing instruction and its returned target/reason are checked. The specialist is queued only after delivery acknowledgement, or acknowledged voice playout. A named user transfer is explicit and can proceed with automatic handoffs off; that preference remains off for the specialist's subsequent reply. Stop, corrections, revision checks and language/selection controls still revoke pending output.

All three roles can coordinate while retaining their specialist permissions. Saathi clarifies and organizes; Drishti explains permitted graph comparisons; Disha offers practical options. They may request another role, but cannot acquire its tools or write its reply. Chains permit at most two handoffs and one visit per role in a request. A fresh request starts a fresh bound. History, report revision, approved sources and user language continue across the handoff.

Reviewed voice text uses the same addressing resolver. Voice retains the current conversational speaker as its fallback, with the existing explicit transcript-review and audio-playout gates. Raw, unreviewed transcription cannot trigger a handoff.

## Read recovery

Background read failures retain the last good conversation and retry after five seconds. A manual loading retry also performs only a read. Read failures are separate from generation-command failures, so recovering a connection cannot regenerate a delivered reply or repeat its handoff. A failed generation request still retains its original idempotency key for an explicit retry.

## Verification and limits

Tests cover parsing, multilingual aliases, false positives, picker information, caret/keyboard/IME behavior, accessible listbox state, source-menu separation, server-authoritative routing, retries, explicit transfers with automatic handoffs off, cancellation, cycle rejection and reviewed voice input. Browser verification observed `Saathi → Disha` for the plain-name request and only `Disha` for a direct `@Disha` request; evidence is in `docs/design/agent-addressing/`.

The running localhost adapter remains the authored fixture; no paid model calls were made during verification. Live OpenAI responses require the existing provider configuration. Shared orchestration does not enable extra web, submission, payment or report-write tools in the dialogue model. Existing report-revision and confirmation rules still apply to new text: routing does not confirm an incident or bypass Drishti's confirmation gate.
