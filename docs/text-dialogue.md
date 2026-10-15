# Three-agent text dialogue and durable handoffs

Implemented 2026-10-10 as increment **3c2**. The saved-report chat now generates a foreground reply for Saathi, Drishti or Disha, persists the conversation in MongoDB, and advances a handoff only after text delivery is acknowledged. English, Hindi and Hinglish preferences, active agent and automatic-handoff preference survive refresh. Authored fixtures remain the default; the existing optional OpenAI configuration also enables generated dialogue. No live provider call was needed for verification.

## Working flow

1. Send fictional narration through the existing report API. Original words and assertion provenance remain separate from generated replies.
2. Enqueue a reply against the current report revision and conversation version. The server assigns the turn ID, freezes provider configuration and binds the selected registered role. Starting again with the same request key cannot create another generation.
3. The existing agent worker claims one extraction or dialogue job at a time. It loads the fixed role `SKILL.md` and shared policy, supplies a minimal owned-report context, and runs bounded Python IPC. No cookies, database credentials, provider-selected file paths or raw database access enter the child process.
4. A ready reply appears through BeautifulUI's existing `StreamingText`. It is fully readable immediately; the interface does not simulate incremental provider tokens. A React effect acknowledges the completed DOM render, deferring delivery in hidden tabs. Delivery does not move keyboard focus or force scroll on a reader who moved away from the end.
5. A validated handoff changes the foreground role only in the delivery transaction. The next reply is then queued using the same frozen provider settings. A chain is limited to **three replies / two handoffs** before returning control to the user.
6. New narration, a report correction, manual role/language selection, stopping the reply or changing the handoff preference invalidates pending work. Late results cannot replace the current turn. Already delivered replies remain in history and show their original revision; earlier revisions are labelled accordingly.

Fixture mode demonstrates Saathi → Drishti → Disha using authored, locale-specific replies. It does not interpret arbitrary narration. OpenAI uses the same persistence and delivery rules, with one strict structured response per speaker: `{ text, handoff }`. Handoff targets are registered roles, cannot be the current speaker, and must use an allowed reason. `connection_ready` is unavailable in this operation because it requires a real completed graph-task receipt.

## Contract and authority

`GET /api/reports/:id/dialogue` returns the owned conversation. `POST` accepts one exact command: `reply`, `delivered`, `select`, `language`, `automatic` or `stop`. Commands carry `expectedRevision` and `expectedVersion`; a reply also carries a UUID request key and the last saved message reference. Commands cannot provide owner IDs, confirmation, model configuration, instructions, arbitrary tool names or report writes. Both routes use the existing session, same-origin mutation checks, bounded JSON bodies, rate limits and private/no-store responses.

A single `dialogues` document owns the foreground role, preferences, current generation, delivery receipts and assistant history for each report. Mongo transactions and a report write fence serialize changes against report edits. Claim tokens and deadlines prevent expired/replaced workers from delivering. The Python coordinator applies registered role and handoff permission policy during generation; Mongo is the durable authority for delivery and the next speaker. No per-agent conversation store or provider-hosted conversation is created.

Replies are **not assertions, evidence, confirmation or independent verification**. They cannot change report truth, publish data, file complaints or grant entitlements. The UI labels actual fixture versus OpenAI provenance. The provider receives the last eight original messages, all current assertion values/original values/inclusion/polarity, and up to six earlier assistant replies. Earlier generated text is explicitly distinguished from evidence. Owner/report/message IDs, upload metadata and credentials are excluded from the provider context.

This text operation connects shared own-report context and controlled handoff intent. Its provider has **no executable search, submission, payment or report-write tools**. [Increment 4](connection-explanations.md) now supplies Drishti with the actual comparison and server-created source receipts; Connections shows original sources and withheld evidence. Disha's existing summary/manifest previews remain in the dispatcher; sourced action guidance is increment 5. Replies may describe only server-supplied comparison findings; they must not claim unexecuted actions or external lookups. Actual Sarvam voice and audio-playout handoffs remain increment 6.

## Bounds and provider setup

| Boundary | Limit |
| --- | --- |
| Per-report starts | 20 lifetime requests, including canceled/failed requests |
| Assistant history | At most 60 delivered replies |
| Automatic chain | At most 3 replies, then user control |
| Reply text | 4,000 UTF-16 code units |
| Serialized provider context | 24,000 UTF-16 code units; oversized context fails before reserving a call |
| Worker lease / process deadline | 45 seconds / 25 seconds |
| Provider deadline | Existing configurable 1–18 seconds; no SDK automatic retries |
| Live cost | Shared lifetime OpenAI reservation budget with extraction; each speaker consumes one reservation |
| Crash recovery | Fixtures may retry up to 3 attempts; an expired live claim fails as uncertain and is never automatically replayed |

Oversized accounts fail closed rather than silently dropping corrected or negative evidence. Chunking long accounts is a later service. A failed/canceled attempt never restores a call reservation because a provider may already have billed it. Turning off automatic handoffs limits a requested reply to the selected speaker. Configuration changes stop queued live work before a provider request.

Use the [existing provider setup](openai-extraction.md) and `.env.example`: `YAMA_TEXT_PROVIDER=fixture` is the default. Live dialogue uses the official installed OpenAI SDK, explicit model/destination, `store:false`, no `previous_response_id`, no provider Conversation, strict JSON schema and the existing explicit synthetic-data gates. `store:false` does not establish zero retention or regional compliance. [OpenAI conversation-state guide](https://developers.openai.com/api/docs/guides/conversation-state) · [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

Optional Langfuse now records fixed-name `yama-text-dialogue` generations for the three registered agents. The existing export allowlist permits only model, tokens, operation, role, language and generic status. No narration, assertions, prompts, replies, source IDs, exception bodies, events or links are exported. In-memory tests exercise the real SDK exporter. Provider access, account billing and a live monitoring endpoint remain unverified until keys are supplied.

## Verification

Run `npm run check`, `.venv/bin/python -m unittest discover -s tests -v`, and—with the initialized databases/parser/dev server running and the three application workers stopped—`npm run test:integration`. New checks cover concurrent duplicate starts/acknowledgements, refresh recovery, delivery-bound role changes, automatic-off/manual selection, Hindi/Hinglish, interrupted/stale work, unknown role paths, cross-account access, origin checks, sign-out, context limits, frozen provider configuration, shared budgets, ambiguous live claims and actual SDK serialization/export masking.

The [verification record](text-dialogue-verification.json) records **351 passing tests**, type checking, lint, production build, additive initialization and browser results. The browser verified all three replies, unchanged report revision, reply/active-role recovery and persisted Hindi/handoff preferences. Start `npm run worker:graph`, `npm run worker:evidence` and `npm run worker:agents` again after integration tests. Existing styles, animal artwork, animations and voice-preview controls are unchanged.
