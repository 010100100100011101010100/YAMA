# Durable Saathi proposals and browser review

Implemented 2026-10-10 for the synthetic localhost demo. The browser can request a Saathi extraction, reopen its Mongo receipt, inspect exact quoted sources, select proposals and explicitly add them to a draft. Confirmation is a separate action. This connects the existing Python coordinator/dispatcher to a durable worker; it does not add live inference or a second conversation controller.

## Working flow

Open **Check my notes → Add extraction example → Extract proposals**. The new example appends one fictional message without replacing earlier narration. English, Hindi and Hinglish each have an authored example in `agents/fixtures/incidents.json`. Only those exact narratives produce proposals. Other narration remains saved verbatim and returns an empty preview. The older **Try an example** flow remains a separate correction exercise with a deliberately wrong amount.

While extraction runs, **Cancel extraction** revokes the durable claim. Closing the panel stops observation, not the job. Reopening or refreshing restores the latest receipt. Polling preserves the task button and focus, stops after 60 reads at two-second intervals, and offers an explicit reload. A failed enqueue retry keeps its idempotency key so an ambiguous response cannot create a second task.

For a ready result, quoted text stays visible. **Read original message** expands the whole immutable message with the source span marked. No proposals start selected. Select the intended details, acknowledge the quoted sources, then use the existing BeautifulUI ApprovalCard to add them. The acceptance button stays disabled until both conditions hold and while saving. On success focus returns to the extraction control. Draft rows identify Saathi's authored fixture and support the existing correction, exclusion and polarity controls.

Acceptance increments the report revision and clears any previous confirmation. It preserves original values, exact UTF-16 message ranges, `verification: not_verified` and `agentSource` identifying the trusted receipt, role, provider, model and version. Corrections do not overwrite original values. Confirming notes remains required before graph access; the report's user confirmation does not independently verify an allegation.

## API boundary

All routes use server-resolved Better Auth ownership, private no-store responses, existing size/rate limits and exact-origin checks on mutations. UUID references are validated. Clients cannot choose agent, tool, owner, model, claim token, source content or confirmation state.

| Route under `/api/reports/:reportId/agent-tasks` | Contract |
| --- | --- |
| `POST /` | `{expectedRevision}`, UUID `Idempotency-Key`; returns queued receipt with HTTP 202 |
| `GET /` | Latest 20 owned receipts, newest first; older active revisions become stale |
| `GET /:taskId` | Owned receipt; rechecks current revision |
| `POST /:taskId/cancel` | Revokes pending/ready result and claim; terminal cancellation is idempotent; accepted receipts cannot be canceled |
| `POST /:taskId/accept` | `{expectedRevision, acknowledged:true, resultHash, proposalIds}`; selected stored IDs only, not client-supplied proposal content |

Receipt states are `queued → running → ready → accepted`, with `failed`, `canceled` and `stale` alternatives. Adapter identity is fixed to `fixture / authored-incident-v1 / 1 / live:false`. Public receipts omit owner, idempotency key, timestamps and lease tokens. Preview hashes bind schema-normalized proposals and trusted adapter identity. Proposal IDs are assigned by the server after validation.

Enqueue atomically reserves one of 20 task slots per report without revising its draft. An existing key replays without consuming another slot; reusing it for another base revision fails. This lifetime quota is a demo bound, not a paid entitlement. Creating another request after a failed/canceled/stale job consumes another slot. There is no automatic receipt purge yet.

Acceptance uses a Mongo transaction for the current draft, immutable revision and accepted receipt. Every selected ID must belong to the stored preview; acknowledgement, hash, current revision and source validity are rechecked. A lost-response replay with the same selection returns the latest owned report, preserving any later corrections. A changed selection fails. Acceptance creates no graph outbox job. Only separate confirmation does.

## Worker and resource limits

Run `npm run db:init` to add schemas/indexes, then `npm run worker:agents` in a separate terminal. Use `-- --once` for one claim. The worker processes one job at a time; a Mongo global lock also prevents two worker processes from running jobs concurrently.

- A claim/global lease lasts 45 seconds. Expired claims recover automatically, with at most three executions before a terminal retry-limit receipt.
- Node starts `python3 -m scripts.agent_snapshot` with a server-authorized report over private stdin. `YAMA_AGENT_PYTHON` can select a Python 3.11+ executable.
- The Python bridge exposes one snapshot read, fixed Saathi role and the existing dispatcher/fixture adapter. It receives no cookies, Mongo credentials, provider keys or arbitrary URL. Environment inheritance is allowlisted; raw stdout/stderr are not logged.
- Python retains its 20-second tool deadline and eight-message/12,000 UTF-16 context bound. Node kills the subprocess after 25 seconds, cancellation or output over 1 MiB. Input is limited to 4 MiB by the bridge. No shell is used.
- A one-second claim monitor aborts canceled/replaced work. Completion requires an unexpired matching token and an owned report at the base revision. A transactional report fence forces concurrent edits to conflict/retry, preventing a stale result from becoming ready.
- Validation rejects schema extras, forged role/ownership/provider data, unknown messages, range overflow, surrogate splits, mismatched quotes, altered literal values, duplicate field/source pairs and unsupported pattern tags. Existing corrected/excluded assertions are never revived.

This worker has no outbound provider calls. OpenAI, metadata-only Langfuse and Sarvam/LiveKit are separate increments. The browser's conversational hints remain authored; extraction does not pretend to stream model dialogue or perform audio handoffs.

## Verification

`npm run check` covers TypeScript, lint, browser/domain tests and a production build. `npm run test:agents` checks the existing Python coordinator/dispatcher. With databases, parser image and dev server ready, stop all three long-running workers before `npm run test:integration`; those tests use their own workers.

Tests cover restoration, trusted identity/source validation, explicit selection/acknowledgement, focus during polling and acceptance, Hindi copy, stale responses, ambiguous writes, foreign accounts/sessions, atomic rollback, cancellation during execution, nonce replacement, expired claims, concurrent quotas, bounded retries, real Python extraction in all three languages and separate confirmation followed by actual FalkorDB comparison. Integration auth setup respects Better Auth's bounded retry window without disabling rate limits. Cleanup removes only isolated test namespaces or newly created test-account records.

See [verification receipt](agent-proposal-review-verification.json) and [service sequence](backend-services.md). Receipt retention, account recovery, provider privacy controls and public-launch handling remain separate work.
