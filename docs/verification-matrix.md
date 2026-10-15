# Verification matrix

These are acceptance criteria, not passed tests. Add executable tests alongside implementation; automated tests use synthetic fixtures and must not call paid providers.

The database/backend foundation has executable unit and real MongoDB/FalkorDB/HTTP integration tests for ownership, provenance, revisions, atomic confirmation/outbox writes, stale work, negative patterns, retries and catalogue isolation. The 2026-10-09 evidence increments add bounded raw uploads, exact/frozen extraction, source integrity, symlink rejection, cross-account file access, concurrent deduplication/quota, transactional review and archived provenance checks. Real isolated Poppler/Tesseract tests cover English/Hindi OCR, text/scanned PDFs, page/pixel bounds, malformed/encrypted/blank input and cancellation. Mongo worker tests cover replaced/expired/canceled claims and retry caps. See `backend-architecture.md`, `evidence-service.md` and `document-evidence.md` for implemented scope and limits. These tests are not a comprehensive parser security audit. Real voice, payments, retention/purge and public launch remain unverified acceptance criteria.

The authenticated agent dispatcher adds exact English/Hindi/Hinglish fixture sources, role/tool allowlists, ownership checks around work, cancellation/timeouts, stale revision/file invalidation, protected corrections and actual backend graph/summary/manifest reads. Ready-result handoffs use scripted delivery acknowledgements. Browser dispatcher delivery, durable agent jobs and live model/voice adapters remain unverified. See [dispatcher contract](agent-dispatcher.md).

| Area | Required evidence |
| --- | --- |
| Integration setup | beUI metadata/source retrieval; ASCII Magic free account/render/recipe; official Excalidraw create/edit/read-back (user-authorized tldraw fallback) |
| Keyboard and focus | Complete primary journey without pointer; visible focus; modal focus trap and return; no focus loss on streamed updates |
| Screen readers | Correct names/roles/errors; intentional live regions; final transcript announcements without token flooding; graph has equivalent text |
| Reduced motion | Static or paused decoration; instant access to instructions; no compulsory scrolling or focus movement |
| Layout and language | English/Hindi/Hinglish examples; Devanagari wrapping; long phone/payment/domain strings; narrow mobile, desktop, zoom |
| Voice | Permission denial, barge-in, duplicate/out-of-order events, reconnect, timeout, end session, text fallback; no accidental double submissions |
| Correction | Original transcript retained; correction provenance; interim text not treated as confirmed; stale revision rejected |
| Confirmation | Unconfirmed/removed assertions never enter the durable graph; valid confirmation atomic; retries idempotent; user confirmation distinct from verification |
| Provenance | Every derived assertion resolves to authorized source references; revisions and retractions update downstream explanations |
| Graph reasoning | Actual FalkorDB traversal; direct vs narrative match; negative evidence reduces support; independent linkage/pattern measures; deterministic fixtures |
| Private access | Cross-account document/evidence/graph access denied; private identifiers and reporter details never leak through public projections or explanations |
| Evidence | Type and size validation, path traversal, decompression/resource limits, parser failure, safe previews, malicious extracted instructions treated as data |
| Payments | Explicit test mode; raw-body signature verification; duplicate/reordered events; idempotent grant of ten details; no entitlement from redirect; counter isolation per account |
| Safety and paywall | Essential assistance and own supplied data remain free; no victim private-information purchase path; no guilt claims |
| Local resources | Full demo fits laptop; reasonable Docker allocation; model inference remote; stop/start and persistence documented |
| Public launch | Staffed safeguarding, consent/escalation, security review, retention controls, India-only provider/data-flow review and payment eligibility recorded before real reports |

Use unit/contract tests for validation and scoring, integration tests for ownership/confirmation/graph/payment transactions, and browser tests for journeys and accessibility. Automated accessibility checks supplement manual keyboard and screen-reader review; they do not replace it.
