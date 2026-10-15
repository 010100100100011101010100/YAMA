# Proposed agent tools and visual/report experience

Recorded 2026-10-07. These are domain contracts to implement at the backend/integration stages, not live tools. `agents/capabilities.json` currently enforces role permission names in the offline coordinator; it does not implement database, provider, drawing, export, or email adapters. Do not grant the new names below until their adapters and authorization checks work.

## Responsibilities and starting calls

Reuse existing role capabilities where they fit. Introduce additional calls only for a concrete user task. The application derives the account/session identity; the model cannot choose another account or submit arbitrary Cypher, SQL, HTML, file paths, or provider credentials.

| Proposed call | Owner | Implementation and user-visible result |
| --- | --- | --- |
| `extract_evidence_text(evidence_ref, revision)` | Saathi requests; evidence worker executes | Local OCR/text extraction returns source-linked text for correction, never silently replacing the original. OCR failure is separate from upload success. |
| `propose_timeline(report_ref, revision)` | Saathi; existing capability | Derive events from the user's draft, retain uncertain/relative dates and source references, and ask the user to correct them. A timeline can exist before confirmation. |
| `find_similar_cases(report_ref, revision)` | Drishti; existing capability | Search authorized FalkorDB records using text/vector/pattern criteria; return filtered possibilities and limits after the current report is confirmed. |
| `query_connection_paths(result_ref, revision)` / `explain_connection(connection_ref, revision)` | Drishti; existing capabilities | Server-approved graph queries return disclosed paths with supporting sources, differences, negative evidence, and separate linkage/pattern measures. Never return another reporter's private identifiers. |
| `search_public_web(topic, reason)` | Drishti / Disha | Increment 7 implements Exa discovery using predefined public topics, server-authored queries and bounded usage. An empty private case search does not authorize searching for a person on the web. |
| `fetch_public_page(searchId, sourceId)` | Drishti / Disha | Increment 7 resolves an owned selected source; Yama fetches/sanitizes HTML and Firecrawl parses it; retain publisher, URL, retrieval time, dated content, hash, and relevant excerpts. Page instructions are untrusted data. |
| `create_connection_map(result_ref, revision, view)` | Drishti | Render a filtered result as an interactive Cytoscape.js graph or an editable Excalidraw explanatory scene. Node/edge selection opens its explanation and sources. |
| `prepare_incident_summary(report_ref, revision)` / `prepare_evidence_manifest(report_ref, revision)` | Disha; existing capabilities | Build a reviewable account and source manifest from owned/authorized material, retaining provenance and uncertainty. Draft preparation does not claim independent verification. |
| `render_reviewed_report(review_ref, format, language)` | Disha proposes; export worker executes | Render an approved revision to PDF using Playwright or DOCX using `docx`; produce a private expiring download. No official filing or submission is implied. |
| `export_case_package(review_ref, included_refs)` | Disha proposes; export worker executes | Package the reviewed report, timeline, manifest, and only explicitly selected owned evidence. JSON/CSV manifests include hashes and source/version references. The user's own report/export remains free. |
| Future `request_document_import(document_type, purpose)` | Saathi may propose; trusted consent service executes | Deferred beyond the initial demo. In an approved partnership workflow, offer optional DigiLocker consent/document selection and an import preview. Complaint submission requires a separate official channel. No tokens or unrestricted document listing reach the model. |
| `prepare_email()` | Disha | Increment 9 prepares a fixed generic workspace-link preview for a server-registered synthetic recipient. Sending is a separate application action, after explicit user authorization; Resend/Nodemailer transport is not an unrestricted model tool. |
| `lookup_verified_assistance(location, category)` | Shared; existing capability | Read curated, dated official routes first; Disha can refresh official sources through the bounded web adapter. Keep essential assistance available before confirmation or payment. |

The signatures are proposed domain shapes, not final JSON Schemas. `report_ref`, `result_ref`, `evidence_ref`, `review_ref`, and `recipient_ref` are opaque references resolved under the authenticated session. A tool receipt records actual success/failure, not a model's claim that it completed something.

Do not expose a general `browse`, `run_query`, `write_file`, `send_email`, or `charge_payment` function. A small dispatcher with explicit adapters is sufficient; another agent framework is not necessary to deliver these tools.

## Visual mapping inside Yama

Use the working Excalidraw MCP for our synthetic design/wireframe work. For a user's private case map, embed the Excalidraw React SDK inside Yama and persist its scene with Yama's own access rules. Do not send real reports to the public sketching MCP or publish an Excalidraw share link automatically. The SDK supports scene editing and SVG/canvas/blob exports. [Integration](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration), [exports](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export)

Use Cytoscape.js for the main **Explore connections** view, because it supports graph interaction and layouts without a rendering service fee. Excalidraw serves a different user action: **Sketch this explanation** or **Annotate my timeline**. These choices are proposed, not installed SDKs. Preserve their MIT notices. [Cytoscape.js](https://js.cytoscape.org/), [Excalidraw licence](https://github.com/excalidraw/excalidraw/blob/master/LICENSE)

Proposed user flow:

1. **Tell:** Saathi captures the account in voice or text. Optional evidence upload lives beside the composer. A small timeline preview shows the user's words and uncertain dates. DigiLocker document import is reserved for a future partnership stage.
2. **Review:** the user corrects assertions and confirms a specific revision. Import authenticity, user confirmation, and independent verification have distinct labels.
3. **Understand:** Drishti first presents a readable explanation. **Explore map** opens a bounded graph of disclosed incidents, assertions, and source references. Selecting an edge shows why it exists, contrary evidence, and what remains unknown. Similar wording never draws an identity edge by itself.
4. **Act:** Disha offers next steps and **Prepare my report**. A review panel shows included sections/evidence, language, draft/confirmed status, and destinations. The user can edit or remove sections before approving an export.
5. **Save or notify:** download PDF/DOCX or a selected evidence package. A separate email preview requires user authorization. Generic notifications link back to the authenticated application; do not put incident details in mail by default.

Keep the shared transcript and speaker identity visible as work proceeds. A map opens as a side panel on desktop and a dedicated view with a return control on mobile. Handoffs do not reset the view, scroll reading position, or keyboard focus. Provide a list/table alternative to every graph and a static reduced-motion state. Essential help remains available throughout.

Map scenes must be derived from a server-filtered disclosure object, not raw graph rows or model-generated executable content. Keep user annotations separate from sourced relationships. Export from a newly built allowlisted scene, excluding private nodes, hidden metadata, embedded evidence, and deleted/undo-state content. An attractive map is an explanation, not proof.

## Report contents and generation

Start with a stable server-owned template and local rendering. The proposed report contains:

- Account title and language; original wording stays available alongside any clearly labelled translation.
- Current revision and confirmation time/status; user assertions remain distinct from verified source facts.
- Reviewed narrative and chronology; unknown dates remain unknown.
- Evidence manifest: user labels, source references, SHA-256 hashes, extraction/correction records, and verification status.
- Authorized connection summaries, including limits and negative evidence; no private cross-account material.
- Disha's selected next steps, with official-source URLs and retrieval dates where applicable.
- Export time and a clear label that this is a prepared account, not an official complaint filing or finding of guilt.

PDF uses bundled Hindi-capable fonts, selectable text, accessible headings, and tested page breaks. DOCX is editable and requires separate layout verification. JSON/CSV manifests preserve structured provenance; hashes alone do not establish legal chain of custody. No third-party report-generation API is needed initially. [Playwright PDF](https://playwright.dev/docs/api/class-page#page-pdf), [docx SDK](https://github.com/dolanmiu/docx)

An unconfirmed draft may be previewed or downloaded with an explicit draft label. Connection results require current confirmation under the existing policy. Exporting a reviewed draft does not commit it to the shared graph. A correction invalidates derived maps/report approvals and requires regenerating/reviewing before another share/export of derived results.

## Dispatcher and verification requirements

Before and after awaited work, check authenticated ownership, role capability, active generation/revision, approved purpose, relevant consent, and request/spend limits. Enforce confirmation only where the task requires it; narration, draft correction, and essential assistance are not blocked by graph confirmation. Job receipts carry status, source/artifact references, revision, and expiry. The coordinator still owns speaking boundaries and rejects stale results.

Langfuse is an instrumentation sink, not a callable authority that can override tool policy. Instrument turn/handoff/tool spans using minimal attributes; redact before export. Resend/Gmail use a durable outbox and deliberate failover, with **delivery unknown** handled separately from rejection. DigiLocker uses its approved partner/consent contract, not a generic OAuth guess. Detailed provider constraints are in [third-party-services.md](third-party-services.md).

When implementing these adapters, write behavioral tests first for cross-account and graph disclosure, stale revisions, prompt injection in web content, private/redirected URLs, canceled jobs, false import success, hidden-map metadata, Hindi export layout, expired download links, export tampering, mail approval and ambiguous duplicate sends. For the current documentation/diagram change, no domain runtime behavior was added.

## Recommended order

Retain the agreed frontend → database → backend → integration sequence. At the backend stage, start with authorized FalkorDB retrieval, local evidence processing, timelines/maps, and reviewed local exports. Add Langfuse instrumentation, bounded Exa/Firecrawl adapters, and Resend/Gmail with fixtures before live checks. DigiLocker is deferred to a future partnership stage, potentially supporting consented identity/documents for a police complaint workflow with a separate approved submission channel and explicit user authorization. Keep any staffed-review, SMS/WhatsApp, calendar, e-signature, or external complaint-submission integration out of the initial tool set until there is a concrete workflow and authorization.

The synthetic architecture proposal is saved as [yama-tool-map.excalidraw](design/yama-tool-map.excalidraw). The native MCP create/edit calls and server checkpoint read-back passed; see [tool-map-verification.json](tool-map-verification.json). This verifies the design tool, not the proposed product adapters.

The implemented public lookup input intentionally excludes arbitrary queries/URLs. See [public lookup boundaries and current limits](public-web.md). Model-selected execution and UI controls remain separate future work.

The user deferred maps and reviewed PDF/DOCX exports on 2026-10-14. [Notifications](notifications.md) now have an implemented preview-only dispatcher tool and separate application approval; attachments and arbitrary content remain unsupported.
