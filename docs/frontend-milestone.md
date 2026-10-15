# Frontend milestone 1 — critical journey

The original fixture frontend was implemented on 2026-10-07/08. On 2026-10-09 it was connected to the MongoDB/FalkorDB foundation for synthetic localhost reports, followed by plain-text evidence upload and review. The visual design is retained; saved report data now drives review, confirmation and comparison. Live models, voice and external submissions remain separate increments.

## Evidence increment — 2026-10-09

The subsequent [document increment](document-evidence.md) adds PDF/PNG/JPEG, local English/Hindi OCR, processing/cancel/retry states and frozen text/page receipts. Pending work restores after refresh; completion updates the list without moving focus. Explicit opening focuses source text, cancellation restores its next control, and a focused file action remains focused when its label changes after background completion. Original component CSS and artwork remain intact. Receipt-bound source approval creates a draft revision; OCR never confirms or verifies a report.

The existing Rare UI Folder opens a bounded UTF-8 `.txt` upload. Metadata restores after refresh; real upload/extraction errors show retry states. Users read exact text and explicitly acknowledge adding it as a draft note. Uploading alone preserves report confirmation; importing the reviewed source creates a new revision and clears it. Historical sources retain their file name, evidence ID and byte hash through correction, export and graph projection. Removal archives the file from the list and is explained as retaining report history.

BeautifulUI/Aceternity button styling and the existing panel layout remain intact. Source text is a read-only escaped field; no uploaded markup executes. Component tests verify failed upload keys, explicit approval, preserved failed review, focus and semantics. Native file selection could not be driven by the in-app browser automation; real HTTP uploads and component file-input tests cover those boundaries. Browser review uses a synthetic fixture uploaded through the service. See [evidence contract](evidence-service.md) and [evidence verification](evidence-verification.json).

## Persistence increment — 2026-10-09

- Same-origin HTTP-only anonymous sessions restore the latest owned report. Original messages, assertion corrections, inclusion/support states and confirmation are canonical server data. A refresh rechecks graph results for a confirmed revision.
- Creation retries reuse a UUID key. After an ambiguous write failure, the adapter reads the report before retrying. Revision conflicts load the latest details and require review; expired authentication never silently switches accounts during a write.
- Saving is explicit and pending. Failed text submissions keep the composer draft; failed corrections keep the editor open. Confirmation is displayed only after server acknowledgement. Unchanged edits preserve the current confirmation.
- Real FalkorDB results replace the fixed fixture comparison in the application. Shared confirmed tags, returned item differences, catalogue sources and unassessed identity linkage are shown. An empty result remains empty. Polling ends after a bounded wait; cancellation stops watching without canceling the durable projection job.
- Example proposals are authored, with exact source ranges and a deliberately wrong amount for correction practice. Arbitrary narration is saved as narration only; there is no automatic extraction yet. Static agent hints are interface guidance, not model outputs, and are not persisted.
- At the original persistence increment, file selection remained local. The evidence increment above now persists supported files and metadata. Unsent drafts and interface preferences remain local.

Implementation: `src/lib/report-api.ts`, `report-session.ts`, `use-report-persistence.ts`, and `report-view-state.ts`, with existing review/comparison components consuming canonical data. The fixture adapter remains used by isolated visual and interaction tests through `Storyroom persisted={false}`; there is no fixture-mode toggle in the application.

Verified with 78 frontend tests, 11 backend unit tests, 21 real database/HTTP/runtime tests, 29 offline coordinator tests, TypeScript, ESLint and a production build. Browser review confirmed create → correct → confirm → actual catalogue comparison → refresh recovery and edit focus. The Hindi review and support selectors fit 320 px without horizontal overflow. See [current verification](frontend-persistence-verification.json) and screenshots in `design/backend-connected/`. Anonymous sessions are demo ownership, not recoverable production accounts.

## BeautifulUI workspace revision — 2026-10-08

After the 5/10 review, the large bird participant tiles were replaced with a compact agent rail and a restrained conversation workspace. The UI now imports source-based BeautifulUI ChatComposer, PromptBar, TaskRows, ContextCards, and its official registry Button. Inter replaces Hanken Grotesk as the Latin font, retaining 18 px body text and Hindi font support. The shared reducer, provenance/confirmation rules, fixture adapter, and report export remain intact.

Voice shows the selected speaker and caption-preview controls. Short phone layouts keep the microphone-off notice above the composer. The panel and transcript behavior remain intact. Current artifacts are in `design/beautifului-workspace/`; earlier screenshots document previous revisions.

## Working behavior

- One shared transcript and controlled composer across Saathi, Drishti, Disha, and text/voice-preview modes. English, Hindi, and Hinglish interface choices preserve original user wording.
- Explicit fictional-example loading and proposed detail review. The example intentionally mis-extracts ₹8,000 as ₹18,000 so correction, source inspection, and provenance can be exercised.
- Included/excluded details and support state, explicit review acknowledgement, revision-bound confirmation, and invalidation of earlier comparisons after a saved report edit.
- Persisted catalogue comparison work with cancel, failure, retry, stale-result rejection, and automatic/manual handoff controls. Background completion does not take the speaking turn or keyboard focus. Fixture comparisons remain isolated to tests.
- Separate pattern similarity and identity linkage explanations, including differences and limits. Changed or excluded fixture narratives are not silently given fixed comparison claims.
- Owned plain-text evidence upload/extraction/review, with server-side byte/type/ownership checks and archival removal. Isolated fixture tests still use local file-name selection.
- A text report download containing included details, source references, correction markers, and draft/confirmation state. Essential next actions and the person's own account remain outside the proposed advanced-intelligence paywall.

Voice preview is captions and interface states only. It requests no microphone permission, records nothing, and plays no audio. Live audio, two female/one male voices, and the Python/LiveKit coordinator integration belong to the integration stage. The existing Python coordinator and agent skills remain unchanged and separate from this fixture adapter.

## Verification and review artifacts

Run with Node 24 (`.nvmrc`):

```sh
npm ci
npm run db:setup
npm run db:up
npm run db:init
npm run dev
# Another terminal:
npm run worker:graph
npm run check
python3 scripts/check_frontend_contrast.py
```

State and interaction tests cover review gating, source preservation, unchanged edits, revision invalidation, duplicate/replaced requests, cancellation, handoffs, interrupted preview, retained failed drafts, IME/Shift+Enter, local evidence errors, Hindi wording, focus restoration, generated report contents, and semantic accessibility across the four critical screens.

Browser review verifies the actual correction flow and focus return, Saathi → Disha → Drishti transitions, focus during work, stale-state handling, source inspection with Enter, and reading-position preservation. Hindi review fits 320/390 px widths; tablet and desktop layouts also fit without horizontal scrolling. See `design/frontend/verification.json`, screenshots, and `contrast.json`.

The in-app browser did not produce a download event for the client-generated Blob report. The client export action, connected download anchor, filename, MIME type, and report contents pass automated tests. Native downloaded-file verification in a regular browser remains outstanding. Automated accessibility checks do not replace manual VoiceOver/NVDA review. Reduced-motion CSS is implemented; an emulated reduced-motion browser run was not available in this review.

## Next frontend increment

Finish onboarding and returning-user states, case browsing/public exploration with synthetic public-safe fixtures, a graph exploration interface, sandbox checkout/entitlement screens, fuller evidence retry/extraction layouts, and empty/error states for those screens. Run a visual and language review on that complete frontend. Current deeper-intelligence copy clearly says checkout comes later; there is no pretend purchase action.

The user moved work to databases/backend on 2026-10-08. Persistence, plain-text evidence and bounded PDF/image extraction/OCR are complete. Continue with the role-scoped agent dispatcher against fixtures, then its model adapter. Review secondary screens and service integrations separately. See `backend-architecture.md` and `backend-services.md`. Backend ownership/provenance/graph and isolated parser tests exist; retention/purge, payments and real interrupted audio remain future acceptance tests. Do not count frontend fixtures as those tests.
