# Contact-matched chat delivery

The walkthrough is implemented and exercised against localhost, FalkorDB cloud, the signed-in Codex text provider, Exa and Firecrawl. Copy/paste instructions: [demo-walkthrough.md](demo-walkthrough.md). Live evidence: [design/demo-chat-verification.json](design/demo-chat-verification.json).

## Delivered

- A different seller name with the saved contacts retrieves four related reports: full recovery, partial recovery, no recovery and an account-access issue. A contact match never establishes common identity or guilt.
- Server-side disclosure removes each reporter's profile, identifying filenames and unknown contacts. A second filter covers model replies/history. Shared conversation PNGs are reconstructed from filtered text; other reporters' raw files stay private.
- All three roles use everyday language without repeated introductions or internal dataset labels. Saathi clarifies; Drishti compares reports; Disha separates public guidance from reported outcomes. The final prompt also suppresses internal graph terminology.
- Validated choice and fill-in questions persist with replies. BeautifulUI ApprovalCard choices require Send answer. Saved answers include their question; stale/busy questions cannot submit.
- Ask a question saves dialogue without changing incident assertions or confirmation. Add details remains the path for factual corrections. Product-agent mentions cannot become Telegram contact evidence.
- BeautifulUI StreamingText, ApprovalCard and InsightCards supply the presentation. Approved source links have keyboard/hover previews. Related reports, filtered images, a protected MP4 and original alias artwork open inside replies. Exploring sources preserves reading position.
- Explicit public-source requests use generic topic queries through Exa and Firecrawl. Narration, contacts, attachments and private graph content are not sent to those web providers. Read pages remain distinct from discovered-only links.
- Forty authored cases retain seven harm categories, seven recurring aliases and negative/name-only controls. Internal synthetic provenance remains intact.

## Verification

- Live browser: Saathi returned an MCQ; No saved with its question; notes were explicitly confirmed; @Drishti returned four reports; @Disha used a live read official page and an interactive source link.
- Live database audit: cloud graph ready, four version-checked matches, each reporter profile removed, names absent from model context. Two follow-up questions left the confirmed incident at revision 2 with two incident messages.
- Live media: filtered PNG and alias illustration loaded; the five-second H.264 clip played to its end with readyState 4 and no media error. Ownership and stale revision/version checks also have integration coverage.
- Automated: full frontend baseline 179 tests, backend 123 tests, Python 132 tests, and 49 relevant database/dialogue/public-web integration tests passed. A subsequent focused 21-test frontend pass covers final emphasis, copy and reading-position changes. TypeScript, lint and build results are recorded in the verification artifact.
- Desktop/mobile content was inspected in a bounded pass and confirmation. The temporary viewport override was cleared. Impeccable's detector returned no findings on changed UI targets. The installed skill is v4.6.0.

## Boundaries

Graph grounding now uses the [official GraphRAG SDK custom retrieval strategy](graphrag-sdk-integration.md) for parameterized contact/pattern/detail traversal, exact source ranges and canonical MongoDB validation. A separate role-bound review chooses attachments before generation. The general-purpose ontology/vector ingestion pipeline is not enabled.

The privacy publication boundary covers the authored catalogue, not arbitrary real-world PII. Real reports require a separately reviewed publication process before sharing. The portrait is original artwork and the clip is an authored reconstruction, labelled accordingly. Arbitrary video upload/transcription is outside this delivery.

Live text used the existing signed-in Codex provider; production OpenAI API access still needs funded credentials. Existing public-lookup limits remain. Private visual maps and reviewed PDF/DOCX exports remain deferred. No deployment, complaint submission, payment or Git push was performed in this pass.
