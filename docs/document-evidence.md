# Local PDF/image extraction and OCR

Implemented 2026-10-09 for synthetic localhost reports. The existing Files panel now accepts text PDFs, scanned PDFs, PNG, JPEG and UTF-8 text. Document processing runs locally with Poppler and Tesseract English/Hindi models. No inference provider receives a file. Text remains a source to review; extraction does not propose assertions, confirm a report or verify authenticity.

## Run it

With the dedicated Colima profile and databases running:

```sh
npm run evidence:setup
npm run db:init
# A separate terminal, alongside dev and the graph worker:
npm run worker:evidence
```

Setup builds `infra/evidence/Dockerfile` from an official digest-pinned Python image and installs Debian Poppler, Pillow and Tesseract packages, including `eng` and `hin`. Setup needs Internet access. It builds only the parser directory, never the application or `.env.local`. It records the resulting immutable image ID in ignored `.local/evidence-runtime.json`; processing uses that ID with `--pull never`. Package versions can change on a future rebuild; each output records the precise image used. Rebuild deliberately after parser/security updates.

## Limits and failure behavior

| Input/work | Bound |
| --- | --- |
| PDF/PNG/JPEG upload | 5 MiB, matching extension/MIME/signature |
| UTF-8 text upload | 64 KiB |
| PDF | 1–3 pages; encrypted documents refused |
| Decoded/rasterized page or image | 8 million pixels; at most 8,000 pixels on either side |
| Images | Single still frame; orientation applied and transparency flattened |
| Extracted source | 6,000 UTF-16 units across all pages; no truncation |
| Parser | One concurrent job; 0.75 CPU, 384 MiB memory, no swap, 64 processes |
| Temporary storage | 64 MiB tmpfs; per-file output limit 32 MiB |
| Deadline | 60 seconds in the host runner; parser has a 55-second deadline and bounded child commands |
| Retries | At most three started attempts, including canceled/interrupted attempts |

Each parser container runs as an unprivileged user with no network, a read-only root filesystem, dropped capabilities and no new privileges. Its only input mount is one generated read-only file. It receives no application credentials, other evidence files, database connections or Docker socket. The host Docker client receives a small environment allowlist. Killing that client is followed by explicit removal of its generated container. Resources and container security settings follow [Docker run](https://docs.docker.com/engine/containers/run/) and [resource constraints](https://docs.docker.com/engine/containers/resource_constraints/).

Poppler reads PDF text page by page. Pages without readable text are rasterized at 150 DPI and passed to OCR. Mixed pages with some text plus an image are treated as text pages; this first version does not merge every image region into existing text. Tesseract uses local `hin+eng` models; it can read Hindi and English/Hinglish in Latin script. This is not speech recognition or translation. See [Tesseract multilingual CLI](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html).

Malformed, oversized, animated, encrypted, blank or over-limit sources fail without returning a partial approved source. Error codes are generic; parser stderr and document metadata are not sent to the UI or logs. OCR can misread words, numbers and names. The source viewer explicitly tells the user to compare it with the original, then correct the draft when necessary. Clean synthetic Hindi fixtures verify this path, not real-world OCR accuracy. There is no original PDF/image preview in this increment.

## Durable processing and authorization

`POST /api/reports/:id/evidence/:fileId/extract` keeps synchronous bounded UTF-8 behavior. For documents it atomically queues the existing owned file and returns HTTP 202 for `queued`/`processing`. Repeated requests reuse pending work or frozen ready text. `POST .../:fileId/cancel` atomically cancels queued/running work; other completed states remain unchanged. All ownership, same-origin and session checks are inherited from the evidence endpoints.

MongoDB `evidence` records hold `stored → queued → processing → ready/failed/canceled`, attempts, request time, claim token and lease. An additive `evidence_worker_lock` row limits processing across worker instances. Workers claim a 90-second lease; expired processing can be recovered after a crash. They check raw-byte SHA-256 and report ownership before parsing, observe cancellation/removal during work, and commit only if the same active claim still owns the file. Stale/canceled workers cannot replace later output. Permanent failures require a new valid file; transient failures and cancellations expose a bounded manual retry. Restart a stopped worker after a database outage.

The panel restores pending state after refresh and polls every two seconds. Polling ends after two minutes with a visible reload action, or stops on an error/unmount. Completion does not move focus or scrolling. Foreground mutations invalidate stale poll responses. English, Hindi and Hinglish use the same states and approval controls.

## Frozen source and provenance

A ready document stores the exact combined output plus an extraction receipt: `local-doc-v1`, immutable runtime image ID, text SHA-256, and sequential page ranges/methods. Page offsets use UTF-16 units into the exact source, with two newline separators. Source reads recheck the raw file hash and frozen text hash; they do not rerun OCR. A ready document cannot be reprocessed in this increment.

Review sends the displayed byte hash **and text hash**, acknowledgement and current report revision. The server compares them with the frozen source, then imports once in the existing Mongo transaction. The immutable report message and revision snapshot retain its receipt; corrections change assertions rather than source text. Current confirmation is cleared. A subsequent explicit confirmation projects the receipt onto private FalkorDB source ranges. No OCR result enters the public catalogue or becomes independently verified evidence.

Raw byte storage, report quota, deduplication, archival removal and orphan/purge limitations continue from the [plain-text foundation](evidence-service.md). Removing a file cancels its active claim and hides it from the list; historical text and bytes remain. Local filesystem permissions are not encryption at rest. Durable privacy erasure, backups, account recovery, antivirus policy and public-launch hardening remain future increments.

## Verification

Unit tests cover upload signatures/limits and exact page/hash output. Real Mongo tests cover concurrent workers, canceled/replaced claims, crash recovery, retry exhaustion, cross-account access, output approval and correction/graph provenance. Real isolated parser tests exercise text/scanned PDFs, English PNG/JPEG, shaped Hindi text, excessive pages/pixels, encrypted/blank/malformed inputs and cancellation. HTTP tests exercise raw binary upload, queuing, cancellation, processing and text-hash review. Component tests exercise processing restoration, polling without focus changes, cancellation, OCR warnings and receipt-bound approval.

Run `npm run check`, then `npm run test:integration` with initialized databases, the parser image and dev server. Stop both long-running workers during integration tests; tests create their own instances. Fixtures are fictional and no paid provider is called. Native in-app file selection and manual screen-reader review remain outstanding from the earlier browser limitations. See [verification record](document-evidence-verification.json).

The next increment is the role-scoped agent dispatcher against fixtures, followed by its deliberate OpenAI adapter. This document increment does not connect models, live voice, mail, web scraping or payments.
