# Agent tools: authenticated fixture increment

Implemented 2026-10-09. The existing Python coordinator drives a bounded dispatcher through the real authenticated localhost report, evidence and connection APIs. No second conversation controller, HTTP server, database collection or queue was added.

This page records stage 3a. Stage 3b adds [durable Saathi receipts and browser review](agent-proposal-review.md).

This is a backend increment. The browser still uses its authored agent hints; integration tests exercise the new dispatcher. OpenAI, Sarvam and Langfuse are not connected by this increment.

## Connected tools

| Capability | Roles | Implemented result |
| --- | --- | --- |
| `read_own_account` | All three | Current owned report, original messages, corrections and confirmation |
| `read_authorized_evidence` | All three | Exact extracted source through existing report/file ownership and hashing checks |
| `propose_draft_assertions` | Saathi | Source-linked proposals for three exact authored English/Hindi/Hinglish examples in `agents/fixtures/incidents.json`; other narration returns no proposals |
| `find_similar_cases` | Drishti | Actual existing FalkorDB comparison with the published fictional catalogue; current backend confirmation required |
| `explain_connection` | Drishti | Increment 4: versioned paths, corrections, withheld evidence and catalogue fingerprints through the same owned service |
| `prepare_incident_summary` | Disha | Draft preserving corrections, original values, uncertainty, sources and omitted assertion IDs |
| `prepare_evidence_manifest` | Disha | Active owned file metadata, hashes and processing/review status; no submission or download URL |
| `lookup_verified_assistance` | All three | Increment 5: free dated India sources, scope, review deadline; stale contacts withheld |
| `find_reporting_options` | Disha | Same bounded official catalogue; no inferred eligibility or external submission |
| `propose_next_actions` | Disha | Owned server summary/manifest preview, content receipt and dated guidance; no approval capability |
| `search_public_web` | Drishti, Disha | Increment 7: owned public-topic Exa lookup with local-first reads and lifetime reservations |
| `fetch_public_page` | Drishti, Disha | Increment 7: owned selected source, Yama HTTPS checks and Firecrawl sanitized HTML parse; untrusted result |
| `prepare_email` | Disha | Increment 9: fixed owned workspace-link preview; no recipient selection, attachments, approval or sending |

`available_tools()` intersects the role registry with implemented tools. Model context receives shared policy and exactly its worker's role, with that connected tool list. Remaining capabilities in `agents/capabilities.json` are future contracts. Unsupported tools fail before a service call. Handoffs/delegation remain coordinator controls, rather than arbitrary actions returned by this fixture model.

## Authorization and lifecycle

A trusted runtime supplies `LocalBackend` with a session credential and an explicit `http://127.0.0.1:<port>` origin. Models receive no cookie, owner selector, arbitrary URL, raw query or mutation function. Proxies and redirects are disabled; credentials cannot follow redirects. Binding fetches the owned synthetic report and initializes one coordinator at its actual persisted revision and confirmation. The dispatcher stays bound to that report; later backend reads cannot move revision backwards.

`start()` checks exact arguments, connected role, requesting output lease, task budget, fresh ownership and the worker's confirmation policy. `execute()` runs only that accepted task once. Concurrent execution is refused; completed work is not repeated. Before and after work, authenticated reads check current ownership/revision. Edits invalidate older output generations/tasks; cancellation ignores late results. Session/access failures prevent delivery.

`result()` requires a current foreground lease with the tool's role permission and rechecks ownership/revision before returning a copy of a ready payload. Saathi can delegate Drishti's search but cannot deliver Drishti's specialist result. Ready background work does not seize a turn. The existing coordinator grants a handoff only after delivery completion.

Background work may finish during a user interruption. The old foreground generation cannot deliver it; a new permitted generation must retrieve it. An edit or explicit task cancellation invalidates the result itself. Evidence reads recheck visibility/integrity at delivery. Manifests compare current file metadata with their original inventory, so archival/upload/processing changes can make them stale without a report revision change.

Agents cannot confirm reports, mutate drafts, write the graph, grant entitlements, send, publish, submit complaints or charge payments. Test preview acceptance uses a separate simulated user PATCH and explicit confirmation. Stored proposals retain `client_proposal`; this increment claims no trusted model-origin write.

## Proposal contract

Untrusted extraction returns only `proposals`, with at most twenty entries. Each contains `field`, `value`, `polarity`, `source: {messageId,start,end}` and `quote`. Reject extra fields, unknown patterns/messages, empty/out-of-bounds spans, mismatched quotes, duplicates and UTF-16 surrogate splits. Literal fields preserve source text; pattern interpretations remain unverified proposals requiring review. A valid span does not establish that an interpretation is correct.

Offsets match JavaScript UTF-16 units. Fixtures include an emoji before English/Hindi/Hinglish facts to catch Python/JavaScript disagreement. Existing assertions with the same field/source are skipped even if corrected, excluded or contradictory; extraction cannot silently restore them. Original messages and confirmation remain unchanged.

Adapter identity and metadata are frozen at task acceptance. Fixtures identify `provider: fixture`, `model: authored-incident-v1`, version 1, `live: false`. Local receipts identify local service execution. Summaries distinguish user confirmation from independent verification, preserve omissions and have `submitted: false`.

## Bounds and persistence

- Python 3.11+, standard library only; at most 32 accepted tasks per session.
- Extraction context: eight messages and 12,000 UTF-16 units maximum; no silent proposal truncation.
- Execution/delivery deadline: 20 seconds. An adapter suppressing cancellation still cannot commit a preview after that deadline. Stopping its resource usage requires adapter cooperation; fixtures have no outbound inference.
- HTTP socket timeout: 10 seconds; JSON response limit: 4 MiB. Canceled read-only threads may finish their socket operation; they cannot mutate reports or deliver through canceled leases.
- Pending graph projection yields `failed / projection_pending`, rather than fabricated success. A fresh task can retry after projection completes.
- Receipts/results live in the bound Python session and disappear on restart. Reports, evidence and graph jobs retain existing database durability. There is no detached agent-job endpoint. Add Mongo receipts/claims and teardown wiring before browser/provider work can outlive requests or sessions.
- Events contain metadata only. Private payloads are not logged or exported to Langfuse. The private test probe returns synthetic previews to its caller and is not a public route.

## Verification and next step

```sh
npm run test:agents
# Initialized databases, dev server and document image are required.
# Stop both long-running workers; integration tests run their own workers.
npm run test:integration
```

Set `YAMA_TEST_PYTHON` if `python3` is not the intended 3.11+ runtime. Tests supply newly created session credentials to `scripts.agent_dispatcher_probe` over stdin, never arguments. They clean up only their session-owned reports, files and private graphs. Do not paste/log runtime bindings. The public_web probe creates a bounded public lookup job; it cannot change a report. Other probes only read. The test controller performs separately simulated user report writes.

The real-service journey covers previews, user correction/exclusion/confirmation, real projection/comparison, Disha's summary and a ready-result handoff. Delivery acknowledgements are scripted; browser delivery and audio playout are not verified. See [verification receipt](agent-dispatcher-verification.json).

Completed in stage 3b: [browser proposal previews and durable receipts](agent-proposal-review.md). Show original sources, corrections, omissions and fixture identity. Explicit acceptance must create a new draft revision in a trusted transaction; confirmation stays a separate user action. Replace static hints only when real current results arrive. Then add bounded OpenAI and metadata-only Langfuse, keeping automated tests on fixtures. Sarvam/LiveKit follows using the same coordinator and owned report.

Increment 7 extends LocalBackend with fixed authenticated public-job POST/cancel routes and the specialist dispatcher with two explicit lookup tools. The original stage 3a read-only statement applies to report/graph state; public jobs are durable Mongo writes. See [public lookup contract](public-web.md). Text/voice models still do not autonomously select public tools.

Increment 9 adds Disha’s preview-only notification capability. The application approval endpoint is separate from all model/agent tools. See [notification lifecycle and provider limits](notifications.md).
