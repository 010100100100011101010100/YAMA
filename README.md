# Yama

An incident-intelligence platform built around **Narrate → Confirm → Connect → Understand → Act**. Saathi supports intake, Drishti explains possible connections, and Disha helps people choose next actions. Reports and connections are assertions with provenance, never findings of guilt.

The first milestone is a low-cost **localhost demo using synthetic incidents**. Public launch is a separate stage. The Next.js chat connects to MongoDB/FalkorDB through authenticated APIs: narration, corrections, confirmation and catalogue comparisons survive refresh. Owned text/PDF/image evidence, local English/Hindi OCR and explicit source review are connected. The Python three-agent coordinator runs thirteen read/preview tools through the owned localhost gateway. Dated India assistance and private action review are implemented; see [the action-service contract](docs/assistance-actions.md). Saathi extraction has durable Mongo receipts and browser proposal review, with fixtures by default and an opt-in official OpenAI adapter plus metadata-only Langfuse. The chat also has durable three-agent text replies and delivery-bound handoffs in English, Hindi and Hinglish. Source-linked Connections and grounded Drishti replies are implemented; see [the contract and architecture](docs/connection-explanations.md). Sarvam/LiveKit voice is implemented with explicit transcript review and playback-bound handoffs; live provider auditions await keys. See [voice setup and limits](docs/voice-integration.md). Exa/Firecrawl public lookup is implemented through owned API jobs and the specialist dispatcher, using authored fixtures by default; autonomous chat browsing is not enabled. See [public lookup setup and limits](docs/public-web.md). The [notification service](docs/notifications.md) now implements fixed previews, explicit approval, Resend/Nodemailer adapters and durable capture-only jobs. Maps and reviewed exports are deferred; payments are the next increment.

UI credits: [BeautifulUI](https://www.beautifului.dev/) for the chat and AI primitives, [Aceternity UI](https://ui.aceternity.com/components/magnetic-button) for the button styling, and [Rare UI](https://rareui.com) by Swami Malode for Folder and Matrix Orb. Rare UI copyright (c) 2026 Swami Malode; its MIT + Commons Clause + Attribution notice is preserved in `licenses/RareUI.txt`. [Selected components, locations, source snapshots, and checks](docs/design/action-components/README.md).

Use Node 24 (`.nvmrc`), then:

```sh
npm ci
npm run db:setup
npm run db:up
npm run evidence:setup
npm run db:init
npm run dev
# In separate terminals:
npm run worker:graph
npm run worker:evidence
npm run worker:agents
```

Open `http://127.0.0.1:3000`. Begin with **Try an example**, correct the proposed amount, explicitly confirm your notes, then run the comparison. The example's proposals are authored fixtures, not AI extraction. Arbitrary narration is saved verbatim. For fixture extraction, open **Check my notes → Add extraction example → Extract proposals**, inspect the original quotes, select details and acknowledge before adding them. Acceptance creates a draft; confirm it separately before comparison. Extraction tasks survive refresh and support cancellation. An opt-in OpenAI extraction adapter is implemented; keys and live account verification can be added later. See [provider setup and limits](docs/openai-extraction.md) and [text dialogue/handoffs](docs/text-dialogue.md). Send fictional narration to try the authored three-agent reply chain, or select an agent and turn off automatic handoffs in Options for one reply. In **Files**, upload a fictional PDF/PNG/JPEG (5 MB maximum) or UTF-8 `.txt` (64 KB). PDFs are limited to three pages, images to eight megapixels and extracted text to 6,000 characters. PDF/image processing runs in a local isolated worker with English/Hindi OCR. Read and compare its text with the original, then explicitly add it as a draft note. Adding reviewed text clears confirmation; uploading alone does not. Refresh restores the latest owned report and its file metadata, and rechecks confirmed graph results. Assistant replies, active agent, language and handoff preferences survive refresh. Unsent drafts stay in the current tab. Session expiry or lost cookies can make earlier reports inaccessible; account recovery is a separate stage. Voice remains disabled until Sarvam setup is explicitly enabled. Its connected flow reviews transcribed words before saving and completes agent handoffs after actual playback. See [voice setup](docs/voice-integration.md).

```sh
npm run check
python3 scripts/check_frontend_contrast.py
```

`check` runs TypeScript, ESLint, frontend/backend unit tests, and a production build. Browser unit tests use one worker to leave room for the local databases on an 8 GB laptop. Run the integration suite separately from `check`. See [Frontend milestone and verification limits](docs/frontend-milestone.md) and [Shared design rules](DESIGN.md).

Use `npm run db:status` to check containers and `npm run db:down` to stop them while retaining their volumes. With initialized databases, the parser image and a fixture-mode dev server running, `npm run test:integration` exercises real MongoDB transactions, FalkorDB queries, isolated document parsers and authenticated HTTP sessions. Stop the graph, evidence, agent, voice, web, mail and billing workers during that suite; tests run their own workers. Keep the local LiveKit server running for the synthetic RTC test. See [runtime, architecture and recovery](docs/backend-architecture.md), [API contract](docs/backend-api.md), [document extraction](docs/document-evidence.md), and [next service sequence](docs/backend-services.md). The local container CLI binaries are ignored; compatible Colima/Lima/Docker/Compose tools must be installed on a fresh machine.

- [Implementation plan](docs/implementation-plan.md)
- [Evidence service contract and limitations](docs/evidence-service.md)
- [PDF/image extraction, OCR and processing limits](docs/document-evidence.md)
- [Three-agent roles, tools, handoffs, and conversation UX](docs/agent-orchestration.md)
- [Authenticated agent dispatcher](docs/agent-dispatcher.md)
- [Durable Saathi proposals and browser review](docs/agent-proposal-review.md)
- [Selected providers, DigiLocker research, and service functions](docs/third-party-services.md)
- [Proposed agent tools, maps, reports, and export UX](docs/agent-tool-catalogue.md)
- [Editable agent/tool architecture map](docs/design/yama-tool-map.excalidraw)
- [Integration status and verification](docs/tooling.md)
- [Component source review](docs/component-review.md)
- [ASCII Magic artwork check](assets/artwork-check/README.md)
- [Wireframe brief](docs/wireframe-brief.md)
- [Current chat/conference design](DESIGN.md)
- [Chat and voice screenshots](docs/design/chat-redesign/README.md)
- [Earlier Storyroom visual proposal](docs/visual-direction-v3.md)
- [Previous visual direction studies](docs/visual-direction-v2.md)
- [First UX proposal and journey reasoning](docs/ux-direction.md)
- [Editable Excalidraw wireframes](docs/design/yama-wireframes.excalidraw)
- [Design-preview checks](docs/design-preview-verification.json)
- [Verification matrix](docs/verification-matrix.md)
- [Original product context](docs/product-context.txt)

Build order: fixture frontend → MongoDB + FalkorDB and core backend → frontend persistence adapter (complete) → evidence/agent services → live integrations, exports and sandbox payments. The user moved work to the database/backend stage on 2026-10-08 and selected MongoDB in place of PostgreSQL. The user authorized official Excalidraw as the sketching fallback on 2026-10-07. Tests accompany each implemented stage.

Run the public beUI MCP check with Python 3.11 or newer:

```sh
python3 scripts/check_beui.py
```

This retrieves component metadata and source for inspection, checks MCP access, and writes `docs/beui-verification.json`. It neither installs components nor calls a paid API. The current frontend installs BeautifulUI Context Cards through the shadcn registry and adapts Prompt Bar from its inspected source. See the component review for provenance and modifications.

Rebuild the editable synthetic board locally:

```sh
python3 scripts/design_board.py
```

`--verify` checks the official Excalidraw MCP and records creation/edit/read-back results. `--share` additionally uploads the synthetic design board and returns an editable link. Both flags are explicit; the default only writes the local drawing.

Exercise agent unit contracts locally (standard-library Python 3.11+; no credentials or provider calls):

```sh
npm run test:agents
# Optional official provider SDKs and offline transport/export tests:
npm run agents:setup
npm run test:providers
python3 -m scripts.demo_agent_handoff --mode text
python3 -m scripts.demo_agent_handoff --mode voice
```

The demos use scripted synthetic dialogue and the actual coordinator. Voice mode simulates playout completion; it does not record or play audio. Product-agent instructions live in `agents/saathi/SKILL.md`, `agents/drishti/SKILL.md`, and `agents/disha/SKILL.md`, with a shared policy and enforced capability allowlists.

### Billing increment (2026-10-14)

Dodo's pinned SDK, hosted test checkout, verified webhook inbox and account credit ledger are implemented. Fixtures are the default: no external payment requests or charges. Run `npm run billing:setup`, `npm run db:init`, then `npm run worker:billing`. The fixed offer is $10 USD for ten details; an owned fixture catalogue tests a 30% free allowance and one-credit unlocks. Existing reports, Connections and essential help stay free. Actual advanced intelligence, browser purchase controls and sandbox account verification remain pending. See [billing contract and setup](docs/billing.md). Private maps and reviewed PDF/DOCX exports remain deferred.

### Shared-chat finishing (2026-10-14)

The sidebar now opens saved chats, with red unresolved and green resolved states controlled by the user. All three agents share the conversation; actual handoffs remain visible in history. Agent info controls explain each role, and typing dots follow pending reply state. New chats create separate reports and unsent drafts stay with their chat within the current tab. See [frontend behaviour and verification](docs/frontend-chat-finishing.md).
