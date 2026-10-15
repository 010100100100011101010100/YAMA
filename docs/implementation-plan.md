# Accepted implementation plan

Recorded 2026-10-06. Voice integration implementation added 2026-10-12; see `voice-integration.md` for installed SDKs, provisional voices and remaining live verification. This revised direction takes precedence over tooling suggestions in the original product context. Repository visibility remains undecided.

2026-10-07 update: the user selected **BeautifulUI for AI-specific components** after rating the second visual proposal 6/10 and still generic. The current design proposal is `visual-direction-v3.md`. This supersedes the earlier beUI-first AI-component choice without changing the runtime or delivery sequence.

2026-10-07 agent update: the user retained birds as a liked identity direction and requested direct access and voice/text handoffs between three specialists. `agent-orchestration.md` defines the conversation UX and runtime boundaries. Project-local role skills, a capability registry, and a provider-independent Python coordinator have been added with 29 passing behavioral tests. They do not constitute live voice, model tools, persistence, or graph integration.

2026-10-07 provider update: the user selected **Sarvam for voice, OpenAI for text intelligence, and English/Hindi/Hinglish for both modes**, with two female voices and one male voice. This replaces the previous Sarvam text-model choice. Speaker-to-agent assignments and exact OpenAI model IDs remain pending evaluation. The user also confirmed **FalkorDB, Langfuse, Resend with Nodemailer/Gmail fallback, and Exa/Firecrawl**. DigiLocker is deferred to a future partnership stage, potentially supporting identity/documents in a police complaint workflow with a separate approved submission channel. `third-party-services.md` records current free/paid paths and setup constraints; `agent-tool-catalogue.md` defines proposed maps, reviewed exports, and callable adapters. Runtime services remain unconnected, and the India-only processing requirement remains unresolved.

## Milestones and completion criteria

2026-10-08 database update: the user selected **MongoDB plus FalkorDB** and requested the database/backend stage now. MongoDB replaces PostgreSQL and owns reports, immutable revisions, Better Auth sessions and durable jobs; FalkorDB holds rebuildable confirmed-report projections and a separate synthetic catalogue. The core endpoints and graph worker are implemented and independently tested. Frontend persistence and provider/service integrations remain subsequent increments. See `backend-architecture.md`, `backend-api.md`, and `backend-services.md`.

1. **Integrations:** register ASCII Magic and beUI MCP servers without replacing existing Codex configuration; finish ASCII Magic OAuth; connect the sketching integration. The user authorized an alternative to unavailable tldraw on 2026-10-07: the official Excalidraw MCP is installed and its create/edit/read-back checks passed. Free-account artwork rendering and beUI component retrieval also passed.
2. **Wireframes:** create editable journeys and screen layouts for onboarding, live/text intake, correction, evidence, confirmation, processing, results, connection explanations, next actions, checkout, and public exploration. The first Excalidraw proposal contains twelve desktop screens and a mobile companion; see `ux-direction.md`. Include error, empty, interrupted, keyboard, mobile, Hindi, and reduced-motion states as the design is refined.
3. **Contracts:** define and validate incident drafts, confirmed assertions with provenance, evidence references, separate linkage/pattern measures, voice events, and purchase entitlements. The offline three-agent coordinator now covers turn ownership, capability allowlists, background task receipts, handoffs, and revision invalidation. Domain schemas and service adapters remain to be built. Resolve ambiguities against the wireframes before implementing their behavior.
4. **Frontend:** Next.js, TypeScript, Tailwind CSS, and Motion. Use synthetic fixtures with functioning controls and truthful interaction states. Add the custom Saathi, Drishti, and Disha avatars, a shared transcript/composer, direct agent selection, speaker attribution, background states, and accessible handoff announcements. Do not restart the conversation or move focus during automatic handoffs.
5. **Database, then backend:** MongoDB persistence, Better Auth anonymous demo sessions, revision-bound confirmation, durable graph jobs and real FalkorDB pattern queries are implemented in a 2 GB Colima/Docker environment. Connect frontend persistence next, then build evidence, agent adapters, explanations and actions as separate reviewed increments. Payments remain sandbox integration work.
6. **Integrations:** verify actual streaming voice, graph queries, and Dodo sandbox purchases. Connect the coordinator to LiveKit/Sarvam with explicit context preservation, per-agent voice selection, playout acknowledgement, interrupted-generation cancellation, and permissions checked in real service adapters. Automated tests use fixtures; live provider checks are deliberate and bounded.

Do not treat a configured server as a verified tool, a screenshot as an editable wireframe, mocked results as graph queries, or a checkout redirect as proof of payment.

## Design and source use

- **BeautifulUI** is preferred for AI-specific interactions: Prompt Bar, Approval Card, Context Cards, Task Rows, and Streaming Text. Use its official shadcn registry, preserve its MIT notice, and replace demo behavior as recorded in `component-review.md`.
- **beUI** remains a candidate for supporting controls, controlled evidence upload, and image viewing. Install individual components with the shadcn CLI. No separate shadcn MCP is needed initially.
- **ForgeUI** informs the visual direction. Its application-use permission does not establish unrestricted source redistribution rights. Do not copy ForgeUI source until the intended use is eligible; do not label it MIT.
- Preserve beUI's MIT notice with imported source. Record upstream source and local adaptations.
- Inspect shared `lib/utils` and easing helpers before an installation can overwrite them. Use one typography, spacing, colour, radius, and motion system.
- Use ASCII Magic for custom dithered artwork, palettes, and recipes on the free account. Use its browser editor for animated exports when needed. Never upload incident evidence to the artwork service.
- Keep critical instructions, evidence, and transcript text immediately readable. Preserve scroll position and focus. Decorative animation pauses or becomes static when reduced motion is requested.
- Authentication, validation, security, and upload-success indicators must reflect actual application state. Animated demonstrations are not implementations of those controls.

## Selected runtime providers

| Capability | Selection | Implementation constraint |
| --- | --- | --- |
| Web and application API | Next.js / TypeScript / Tailwind / Motion | Synthetic localhost demo first |
| Streaming transcription | Sarvam `saaras:v4` | Python LiveKit integration |
| Speech synthesis | Sarvam `bulbul:v3` | Two female voices and one male; audition before assignment |
| Live dialogue | OpenAI | Exact model pending; streamed tool use, interruptions, text fallback |
| Extraction and explanation | OpenAI | Exact model pending; schema and business-rule validation |
| Voice transport | Local LiveKit + Python worker | No local large-model inference |
| Identity, reports and transactions | Better Auth + MongoDB | Replica-set transactions; account control does not verify an allegation |
| Connection discovery | FalkorDB | Confirmed revision projections; private graphs and synthetic catalogue; full-text/vector/entity linkage remain future work |
| Payments | Dodo hosted checkout in test mode | Production remains provisional |
| Evidence | Local storage, hashing, text extraction, OCR | Ownership, limits, quarantine and provenance |
| Public web lookup | Exa for discovery; Firecrawl for selected pages | Own graph first; approved public purposes, source provenance, request/spend caps |
| Agent monitoring | Langfuse | Synthetic Cloud Hobby evaluation; pre-export attribute filtering/redaction; production hosting pending |
| Transactional mail | Resend primary; Nodemailer/Gmail fallback | Verified sending domain, recipient/template policy, durable outbox; no blind timeout failover |
| Future partnership identity/document connection | DigiLocker deferred | Potential police complaint workflow requires separate approved submission; partner purpose/scopes and user consent remain prerequisites; Better Auth retains sessions |
| Maps and report exports | Excalidraw SDK / Cytoscape.js / Playwright PDF / docx proposed | Private scenes, filtered graph results, reviewed revisions, local rendering; SDKs not installed |

Expose English, Hindi, and Hinglish preferences for both voice and text; more Indian languages follow. Preserve the original account's wording and script. Hinglish is an application preference for code-mixed Hindi/English, not a provider language code. Keep the same selected agent voice across language preferences.

Before sending any test content to Sarvam, explicitly disable model training and configure **zero retention for Model APIs**. Do not infer retention from marketing language or apply Model API controls to a different product. Keep keys server-side, use available credits, and disable automatic recharge. No credentials have been added to the project yet.

Use OpenAI with application-managed conversation history and explicit data controls; see `third-party-services.md`. Provider selection for the synthetic demo does not resolve the real-report residency gate. The service candidates in that document have not been installed or connected.

## Product invariants

- A user can correct or remove extracted assertions before confirming them. Unconfirmed extraction does not become graph truth.
- Preserve original source, extraction metadata, corrections, confirmation state, verification state, and evidence references separately. User confirmation is not independent verification.
- Entity-linkage measures and incident-pattern measures are separate and explainable. Include contradictory and negative evidence. Neither measure is a probability of guilt.
- Cross-report insights must not reveal another reporter's identity, raw private identifiers, evidence, or transcript. A graph path does not itself authorize disclosure.
- Public exploration uses synthetic, licensed/public, or appropriately anonymized aggregate information with a defined publication policy.
- Approximately 30% of advanced intelligence is free. A $10 purchase unlocks ten additional details. Essential safety assistance, the user's own supplied information, and private victim information remain outside the paywall.

## Public-launch gate

The service eventually targets all ages and incident categories. Accepting real reports requires trained safeguarding staff, child-consent procedures, escalation processes, and security review. Verify India-only handling across inference, storage, logs, backups, identity, and billing. Dodo's international-transfer provisions mean production payment suitability is not yet established; confirm merchant eligibility and compatible handling before live payments.

OpenAI's documented India residency currently covers storage without regional processing. The earlier India-only requirement remains in force; the user has been asked to resolve production use. Continue with synthetic data while that decision is pending. [Data controls](https://developers.openai.com/api/docs/guides/your-data)

## Primary references

- [BeautifulUI catalogue](https://www.beautifului.dev/), [official source and registry instructions](https://github.com/slev12397/beautiful-ui), [MIT licence](https://www.beautifului.dev/license)
- [beUI agent integration](https://beui.dev/docs/ai-agents), [catalogue](https://beui.dev/components/motion), [MIT licence](https://github.com/starc007/ui-components/blob/main/LICENSE)
- [ForgeUI components](https://forgeui.in/components), [licence](https://github.com/AmanShakya0018/forgeui/blob/main/LICENSE)
- [ASCII Magic MCP](https://www.ascii-magic.com/mcp-server)
- [Official tldraw plugin announcement](https://tldraw.dev/blog/introducing-tldraw-for-chatgpt-and-codex)
- [Official Excalidraw MCP](https://github.com/excalidraw/excalidraw-mcp)
- [LiveKit Sarvam STT](https://docs.livekit.io/agents/models/stt/sarvam/)
- [Sarvam retention controls](https://docs.sarvam.ai/api/platform/data-retention)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Dodo integration](https://docs.dodopayments.com/developer-resources/integration-guide), [DPA](https://dodopayments.com/legal/dpa)
