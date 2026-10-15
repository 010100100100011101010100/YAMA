# Document evidence review

Synthetic browser flow, 2026-10-09. `fictional-hindi-scan.png` was uploaded/queued through the real service, read by the isolated English/Hindi OCR worker, then reviewed in the application. Approval created revision 5 and cleared confirmation. Explicit confirmation and real catalogue comparison succeeded; refresh restored the reviewed source and current graph results.

- `source-review.png`: read-only Hindi text, OCR warning and explicit acknowledgement before draft import.
- `hindi-source-320.png`: reviewed source in the Hindi interface; 320 px page width, 245 px text field, no horizontal overflow.
- `source-approved.png`: restored source text and reviewed file status in the normal English viewport.

Opening source text focuses its read-only field; adding a note returns focus to the file button. Background completion retains focus and does not change the report. Native file selection remains unverified because the in-app chooser previously timed out; raw HTTP uploads and component file selection have executable coverage. See [verification record](../../document-evidence-verification.json).
