# Designing the next backend services

Use the database foundation as the contract boundary. Each service should solve one step in Narrate → Confirm → Connect → Understand → Act. Saathi, Drishti and Disha call services through an authorized dispatcher; agents do not own authentication or gain raw database access.

## Write the contract before the integration

For each service, define:

1. **User outcome:** what becomes possible and what observable state proves completion.
2. **Input and access:** typed references, server-resolved account, allowed agent roles, generation/revision, confirmation/consent requirements.
3. **Output and provenance:** structured result, sources, uncertainty/negative evidence, version and retention; no success based on a model's claim.
4. **Failure behavior:** timeout, cancellation, stale result, partial completion, retries and idempotency key; decide which effects need durable jobs.
5. **Data and cost:** private fields the adapter needs, provider destination, logs/redaction, per-request budget and spend ceiling.
6. **Acceptance tests:** success, rejected ownership, stale revision, duplicates and provider failure. Implement against local fixtures first, then bounded live verification.

Keep domain decisions in `src/server`; route handlers should authenticate/validate and call them. Provider adapters may propose data; only trusted application actions commit confirmation or grant entitlements. Extend the existing Python coordinator's turn/generation/role rules rather than starting a separate conversation state for each agent.

## Waterfall increments

| Order | Service/increment | Completion condition |
| --- | --- | --- |
| 1 | Frontend persistence adapter — complete 2026-10-09 | Create/reload/correct/confirm through the APIs; actual catalogue results; pending/failed recovery and edit focus verified |
| 2a | Plain-text evidence — complete 2026-10-09 | Owned bounded upload, byte hashing, exact UTF-8 extraction, explicit source review, archival removal and graph provenance; rollback and hostile inputs tested |
| 2b | PDF/image extraction and OCR — complete 2026-10-09 | Local isolated Poppler/Tesseract English/Hindi, page/pixel/time limits, frozen text receipts, durable processing/retry/cancel; review before any draft change |
| 3a | Agent dispatcher + fixture adapter — complete 2026-10-09 | Existing Python coordinator reads authenticated backend services; source-linked fixture proposals, actual scoped comparisons and Disha summary/manifest; ownership/role/generation/revision checks; no agent-callable writes |
| 3b | Browser proposal review + durable agent receipts — complete 2026-10-10 | Session-bound requests and server-authorized snapshot dispatcher; original sources/corrections visible; explicit acceptance transaction and separate confirmation; refresh/retry/cancel/stale delivery tested |
| 3c1 | OpenAI extraction + metadata-only Langfuse — implementation complete 2026-10-10 | Official pinned SDKs, bounded synthetic requests, source validation, provider-bound receipts, shared call budget and export privacy verified with fake transports; live account verification deferred until keys |
| 3c2 | Generated dialogue and persistent handoffs — implementation complete 2026-10-10 | Role skills and owned-report context; English/Hindi/Hinglish replies, durable delivery acknowledgements and controlled chains; stale/manual interruption, shared provider budgets and fixture/SDK tests; live account verification deferred |
| 4 | Connection explanation service — implementation complete 2026-10-11 | Versioned graph paths, original sources/corrections, withheld evidence, grounded Drishti and stale-source delivery checks; fictional-only publication boundary |
| 5 | Assistance and action service — implementation complete 2026-10-11 | Dated India guidance in three languages; essential help independent of confirmation/payment; receipt-bound private review with ownership/stale/race checks |
| 6 | Sarvam/LiveKit voice worker — implementation complete 2026-10-12 | Installed SDKs, actual local RTC with synthetic audio, explicit review, bounded TTS and completion-bound handoffs; same report/coordinator; live Sarvam/device auditions pending keys |
| 7 | Exa/Firecrawl public lookup — implementation complete 2026-10-12 | Owned dispatcher/API jobs, server-authored topics, pinned DNS/redirect checks, sanitized HTML parse, provenance, quotas and cancellation; fixtures default; live accounts and autonomous chat tool selection pending |
| 8 | Maps and reviewed exports — deferred by user 2026-10-14 | Private Excalidraw/Cytoscape scenes; PDF/DOCX from owned reviewed revisions; Hindi layout, stale approvals, expiring downloads and stripped metadata tested |
| 9 | Notification service — implementation complete 2026-10-14 | Fixed three-language preview, operator-registered synthetic recipients, explicit approval/fallback consent, durable outbox, Resend/Nodemailer SDKs and capture fixtures; live sending/account verification pending |
| 10 | Dodo test checkout + entitlements — implementation complete 2026-10-14 | Official SDK, fixed hosted test checkout, verified durable webhook inbox, atomic account credit grant/consumption, duplicate/refund handling and owned fixture-detail access; actual sandbox account checks, advanced intelligence and browser controls pending |

Langfuse should accompany the first model adapter with metadata-only traces and an allowlist of exported attributes. Do not send raw report/evidence content to monitoring by default. Identity linking/recovery, staff access, audit/retention/purge, backup/restore and launch security require their own tested increments before real reports. DigiLocker remains deferred to an approved future partnership workflow.

Do not implement all rows at once. Review one working vertical flow before the next provider/service. No production model/voice selection, provider account setup or live sending is implied by this sequence.

## Evidence service: plain-text foundation complete

The upload-to-review path now stores raw bytes in an ignored private directory and metadata in MongoDB. It accepts UTF-8 `.txt` only, limits bytes and text, verifies SHA-256 when reading, and requires explicit acknowledgement before adding an unverified draft note. Review increments the report revision and clears confirmation. Original text and file provenance survive corrections, archival removal and graph projection. See [implemented contract](evidence-service.md).

The [document increment](document-evidence.md) extends that contract to PDF/PNG/JPEG with a local isolated worker, resource bounds, English/Hindi OCR, frozen output receipts and receipt-bound approval. Durable queue, cancellation, expired/replaced claims, manual retries, malformed documents, pixel/page limits and Hindi OCR are tested. Plan retention/purge separately: current removal hides a file while retaining its historical source. The [authenticated dispatcher](agent-dispatcher.md) connects ten read/preview tools through the existing Python coordinator. The [browser proposal review](agent-proposal-review.md) adds durable receipts and transactional acceptance through a fixed-role snapshot worker. The [OpenAI extraction increment](openai-extraction.md) adds official SDKs, bounded calls and metadata-only Langfuse while keeping fixtures as the default. The [text dialogue increment](text-dialogue.md) adds persisted foreground replies and delivery-bound handoffs. The [assistance/action increment](assistance-actions.md) adds dated official routes and receipt-bound private review. The [voice increment](voice-integration.md) connects Sarvam/LiveKit with explicit review and completion-bound handoffs. The [public lookup increment](public-web.md) adds Exa search and Firecrawl HTML parsing through owned jobs and the specialist dispatcher. The user deferred maps and reviewed exports on 2026-10-14. The [notification increment](notifications.md) adds preview-only Disha preparation, application approval and a durable Resend/Nodemailer outbox. The [billing increment](billing.md) adds Dodo hosted test checkout and a transactional account credit ledger; paid content remains labelled entitlement fixtures pending actual advanced analysis. Browser service flows and deliberate provider account verification can follow; maps and exports stay deferred.

## Example: Saathi assertion extraction contract

**Input:** owned `reportId`, current `revision`, language preference and source-message references. The dispatcher supplies owner/agent/generation; model output cannot choose them. No confirmation is required to propose draft assertions.

**Output:** proposed assertion field/value/polarity, exact source range and real adapter/provider/model version metadata. Keep original messages immutable. User corrections override proposed values, then the user confirms in the application. A provider response alone cannot commit graph truth.

**Receipt:** task ID, report revision, status (`queued/running/ready/failed/canceled/stale/accepted`), accepted proposal references and a generic error code. Store job/receipt state in MongoDB when work can outlive a request; bind everything to the same report revision.

**Tests:** invalid schemas/source spans rejected; corrected drafts not overwritten; two-account isolation; canceled generation cannot speak or commit; model outage preserves draft; Hindi/Hinglish sources remain exact; tool instructions embedded in narration are treated as user content, not authority.

Once that fixture adapter and UI review pass, connect OpenAI deliberately. Then reuse the dispatcher/receipt contract for Drishti and Disha, with their distinct capabilities and the shared policy already in `agents/`.
