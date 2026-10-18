# Semantic search and true reply streaming

The localhost demo now retrieves candidates through both exact details and multilingual semantic vectors in FalkorDB, using the official GraphRAG SDK. Forty-two published accounts are indexed with a pinned local E5 model. English, Hindi and Hinglish probes with no exact keys all ranked the intended account-takeover report first.

The live UI check used a newly confirmed account with no matching contact/name. The SDK returned ten semantic candidates. Drishti's separate review attached one and omitted nine. Its answer explicitly distinguished similar events from a contact match or shared identity. The selected report opens through the corrected HTTP route, with original matching statements, hidden reporter details and the reported outcome. [Verification](design/semantic-streaming-verification.json).

Live text now follows provider events rather than a timed presentation reveal: OpenAI's structured response stream or the signed-in Codex fallback's native final-message deltas. A partial JSON decoder emits only the `text` field. Python IPC, worker updates and owned SSE carry it to the existing BeautifulUI component. The server holds a text tail and filters known reporter details before exposing drafts. Drafts remain provisional: no sources, saved assistant history, report mutation or handoff before full validation. Invalid, canceled and stale drafts disappear. A delivered streamed reply does not animate a second time.

The live event record contains 30 successive preview updates, then ready and delivered states. It records only IDs, times, counts and state—not reply content. [Event metadata](design/live-stream-events.json). The browser's expired anonymous session required a fresh demo session; the earlier saved report was retained. The old graph worker was restarted and only the new failed projection was requeued. The app was restarted with the current cloud selection.

OpenAI streaming is verified through the official SDK with an in-memory SSE transport, without spending API credits. Codex streaming and model review were exercised live against the existing signed-in account. Native streaming sessions are ephemeral, use read-only sandboxing, disable shell/MCP/plugins and reject tool/approval requests.

## Voice verification

Seven voice SDK tests and eleven local LiveKit/voice integration tests passed with synthetic fixture audio. The native local LiveKit service is running. Live Sarvam calls remain disabled pending account-control confirmation; no live microphone or synthetic narration was sent to Sarvam in this pass.

For Yama, switch model training **off** under Settings → Organisation → General. Under Settings → Workspace → Data retention, set the **Model APIs** override to No retention (0 days), then save. Keep automatic recharge disabled. Only an organisation Owner can change these controls. These settings are separate from Sarvam's hosted Voice Agents product. [Sarvam FAQ](https://docs.sarvam.ai/api/platform/faq) · [Retention controls](https://docs.sarvam.ai/api/platform/data-retention).

## Verification and limits

- Frontend: 185 tests. Backend: 133 tests plus the new HTTP seed-forwarding regression test.
- Python agents: 139 tests; official GraphRAG SDK contracts: 5 tests.
- Database/dialogue/dataset integration: 36 tests; local voice integration: 11 tests; voice SDK: 7 tests.
- Type checking, lint and production build passed. Component source scan found no regex findings; parsed-page detector rules were not run.
- [Desktop source view](design/semantic-chat-desktop.png) · [Mobile source view](design/semantic-chat-mobile.png).

Cold semantic retrieval measured 15–24 seconds; an observed cached lookup took about five seconds. Semantic similarity is not an identity score. Automatic ontology discovery cannot write confirmed assertions; it remains disabled. Public-launch controls, maps, reviewed PDF/DOCX exports and mascot-animation work remain deferred.
