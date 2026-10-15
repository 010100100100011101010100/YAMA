# Evidence service — plain-text increment

This records the completed plain-text foundation. The current implementation also supports bounded PDF/PNG/JPEG extraction and OCR; see [current document contract](document-evidence.md). Its expanded formats, queue/cancellation states and frozen OCR receipts supersede the text-only scope described below. The original verification record remains historical.

Implemented 2026-10-09 for fictional localhost reports. A saved report can accept a UTF-8 `.txt` file, preserve its exact bytes, extract text, show the original source and explicitly import it as an unverified draft note. Uploading and extraction do not change report assertions or confirmation. Reviewing the text creates a new revision and clears confirmation. No model or external provider is called.

## Contract

All routes require the existing Better Auth session, resolve ownership server-side, use the Node runtime and return private/no-store JSON. Mutations require the exact configured Origin. Unknown and unowned resources return the same not-found response.

| Method | Path under `/api/reports/:id/evidence` | Behavior |
| --- | --- | --- |
| GET | `/` | List active owned file metadata; no file paths or extracted text |
| POST | `/` | Raw `text/plain` body; UUID `Idempotency-Key` and URI-encoded `X-File-Name`; store immutable bytes and return metadata |
| GET | `/:fileId` | File metadata and processing/review state |
| POST | `/:fileId/extract` | Bounded synchronous UTF-8 extraction; persist `ready` or `failed` with a generic error code |
| GET | `/:fileId/source` | Recheck SHA-256 and return the exact original text, filename and hash |
| POST | `/:fileId/review` | JSON `{expectedRevision, acknowledged: true, sha256}`; transactionally import the source once |
| DELETE | `/:fileId` | Archive from the active list; retain bytes and historical source text |

File IDs are server-generated UUIDs. Filenames never become filesystem paths. Accept only `.txt` with `text/plain`, at most 65,536 bytes; reject known binary signatures, unsafe filenames and invalid UTF-8/control bytes. Extracted text is limited to 6,000 JavaScript UTF-16 code units, matching report source offsets. Oversized text fails without truncation. Whitespace, original script, BOM and line endings are preserved. Each report has 20 file slots, including archived files. API request limits still apply. The body reader enforces its byte limit on chunked uploads and cancels after ten seconds; a timed-out prefix cannot become a successful upload.

Duplicate content is scoped to one owned report, never deduplicated across accounts. Replaying a saved upload key with different content or a different name returns an idempotency conflict. A duplicate hash returns its existing file record and canonical name. Archived content cannot be reuploaded as a fresh file in this increment.

## Storage, review and provenance

Raw files live under ignored `.local/evidence/<database>/<UUID>.blob`, outside public assets. Directory permissions are 0700 and file permissions 0600. Writes use exclusive creation and no-follow; reads reject symlinks, nonregular files and oversized blobs, with nonblocking open and a bounded read. SHA-256 is verified before extraction, source display and review. Hashes establish byte integrity, not whether the evidence is genuine.

MongoDB stores owner/report IDs, upload key, original name, size/hash, extractor `utf8-v1`, processing state, bounded text, created revision, reviewed message reference and archive timestamp. Byte storage and metadata cannot form one atomic transaction: bytes are written first, then metadata and the report quota commit together. Known failed commits discard the candidate blob; ambiguous commits retain it to avoid breaking a potentially committed record. A crash can leave orphan blobs. A recovery/purge job is still required before public launch.

Review checks the displayed hash, acknowledgement and current report revision. In one Mongo transaction it creates an immutable source message carrying file provenance, adds a `note` assertion with origin `evidence` and verification `not_verified`, saves the draft snapshot and marks the file reviewed. Failure rolls all changes back. A repeated import returns the report without duplicating text. Corrections preserve the original text and source range. Later confirmation projects the file ID/hash onto the owned FalkorDB `SourceRange`; nothing is published into the shared catalogue. A file does not automatically create pattern tags, identity matches or verified assertions.

The file picker restores metadata after refresh. Upload failures retain the selected file/key for retry; processing failures show a real error and block review. Read-only source text is escaped, including embedded markup or tool instructions. Adding a note requires a checkbox and an explicit button. Focus returns to the source button after review and to the chooser after removing the last file. English, Hindi and Hinglish share the same workflow. Report text exports include file name, evidence ID and SHA-256.

## Verification and limits

Tests cover raw/chunked bounds, interrupted and canceled uploads, exact Hindi/BOM text, unsafe filenames, binary signatures, invalid UTF-8, source tampering, symlinks, cross-account/report access, duplicate concurrent uploads, key-conflict precedence, quota races, transactional rollback, revision/hash acknowledgement, archived provenance and actual private graph queries. Component tests cover explicit review, retry keys, retained failed review, markup escaping, focus and semantic accessibility. See [verification record](evidence-verification.json).

The in-app browser file-chooser API timed out. Browser source review uses a clearly fictional fixture uploaded/extracted through the actual service; native file selection remains a manual browser check. Raw upload endpoints and file-input behavior are covered by real HTTP and component tests respectively. Automated accessibility checks do not replace manual screen-reader review.

PDF/images, OCR, compressed archives, antivirus scanning, isolated document parsers, long-running extraction workers, permanent deletion, orphan cleanup, account recovery, backups and encryption at rest remain separate increments. Archival removal is explained in the UI and is not a privacy erasure action. The local filesystem permissions do not encrypt evidence. Continue with bounded PDF/image extraction and OCR before connecting model services.
