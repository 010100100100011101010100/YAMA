# GraphRAG SDK and candidate review

The live connection path runs the official `graphrag-sdk==1.4.0`. Its `RetrievalStrategy.search()` pipeline and `FalkorDBConnection` combine exact indexed detail traversal with semantic vector retrieval from the published catalogue. This uses the SDK's documented [custom retrieval strategy extension](https://github.com/FalkorDB/GraphRAG-SDK/blob/main/docs/strategies.md#5-retrievalstrategy), fitted to Yama's existing graph schema.

## Flow

1. Authenticate ownership and require confirmation of the exact account revision.
2. Read the owned graph snapshot. Obtain confirmed contact/pattern seeds plus canonical reviewed discovery details.
3. Call the official SDK against only the published shared catalogue. A single supported key qualifies a report as a discovery candidate. Contacts rank ahead of weaker hints.
   With semantic retrieval enabled, a local multilingual model also embeds the confirmed, included, affirmed literal assertion text. Excluded, uncertain, contradicted or altered assertions cannot seed it. Literal negation stays in the text so “never arrived” is not changed to “arrived.” Semantic candidates follow exact matches and still require the separate relevance review.
4. Validate returned paths/keys against canonical MongoDB content and version hashes. Remove reporter profiles, identifying filenames and contacts unknown to the current user.
5. Run a separate role-bound model call for Drishti or Disha. It must decide attach or omit for every supplied candidate and give a short reason. Missing, duplicate, invented or oversized decisions fail closed.
6. Filter the candidate set before reply generation. The reply model receives only selected current candidate contents. The source receipt and inline report attachments contain only selected IDs and versions. Previously delivered conversation history remains historical context, not fresh evidence.
7. Commit the reply and a private `dialogue_candidate_reviews` audit in the same transaction. Recheck report revision, confirmation and selected catalogue versions before delivery. The audit has no public endpoint.

The SDK process receives only discovery keys and the server-owned catalogue namespace. Its environment contains the selected graph connection settings, never MongoDB/model/mail/payment credentials. It accepts no arbitrary Cypher, graph names, URLs or model-selected query templates. Diagnostics are drained without logging query contents or credentials.

## Searchable details

- A single confirmed phone, email or Telegram handle.
- A single reviewed incident-pattern tag.
- A reviewed item assertion.
- An amount with a currency marker in an included account, or a reviewed amount assertion.
- An explicitly reported alias, such as “calling himself Lex Voss,” “name was lex voss,” “naam lex voss” or “नाम विक्रम मोरे”. The conservative parser recognises one- and two-word aliases, not arbitrary identity extraction.

Excluded, contradicted, uncertain and quoted/forwarded material does not seed a positive match. Explicit negative or uncertain evidence blocks the same weak key even if an earlier assertion supported it. Reporter names, cities and occupations are removed before shared discovery details are indexed. The fixture's `AUTHORED_ACTOR` answer key is never traversed for retrieval or supplied to the reviewer.

An amount, name or item is a weak hint. A contact can be shared, copied or reassigned. Neither discovery nor attachment establishes common identity or guilt. A selected weak match displays its query quote and catalogue quote under “Why this report was retrieved.”

## Setup

```sh
sh scripts/setup-graphrag.sh
.venv-graphrag/bin/python scripts/setup-semantic.py
npm run db:init
npm run db:seed-demo
npm run db:index-semantic
npm run worker:agents
```

The separate `.venv-graphrag` is ignored by Git and ESLint. Requirements are pinned in `requirements-graphrag.lock`. Semantic setup downloads only pinned safetensors/tokenizer assets for the MIT-licensed [multilingual E5 small model](https://huggingface.co/intfloat/multilingual-e5-small), revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`. The model runs locally, in CPU inference mode with two threads. Runtime loading is offline, remote model code is disabled, and no GLiNER/ontology model runs. Building hnswlib may require the platform's C++ build tools.

Semantic indexing uses only the privacy publication view, hiding reporter profiles and unknown contacts before embedding. Each 384-dimensional vector is bound to its canonical content version, disclosed-text SHA-256 and model revision. The SDK queries FalkorDB's native vector index on `PublishedSemanticCase`; it never queries another owner's graph. The active server returns cosine distance (an exact vector self-match is 0), so lower distances rank first. Similarity is a retrieval hint, not an identity probability. Reindex after catalogue edits; stale versions are excluded, and seed updates remove stale/unpublished vector labels.

Confirmed-query vectors are cached locally as opaque hash-named, mode-0600 files for up to one day (128 entries maximum); no plaintext is cached. A host-level encoder lock prevents concurrent model loads and fails boundedly when busy. Cold retrieval measured roughly 15–24 seconds on this laptop; repeated confirmed-account lookups reuse the vector. Long text is token-chunked without silently dropping its tail. Accounts above the bounded semantic input limit fail explicitly.

No additional API key is needed for indexed retrieval. It uses the existing active local/cloud FalkorDB selection. Setup adds `YAMA_GRAPHRAG_PYTHON` to the ignored `.env.local`, preserving any existing interpreter override. Restart workers after setup. Deployments must provision this Python runtime separately; it is not bundled into Next.js serverless functions. The review and answer calls use the existing configured OpenAI/Codex text provider; each live call reserves the shared provider budget. The worker lease allows both calls and a bounded public-source lookup; cancellation/revision monitors continue throughout.

## Limits

This is hybrid exact/vector retrieval through the official SDK, with existing canonical report ingestion and source provenance in Yama. Automatic ontology discovery remains disabled: a model cannot create confirmed assertions or cross-account links. Reporter profile attributes remain outside discovery. Semantic similarity can retrieve a related event without a literal shared detail; review decides whether it is useful enough to attach.

Each turn retrieves at most ten prioritized candidates and may attach at most five. The SDK request has a 30-second process limit, graph queries a three-second server limit, and model contexts remain bounded. Candidate review adds one text-model call when there are candidates. A review or SDK failure cannot silently fall back to automatically attaching all reports.

The privacy publication boundary remains scoped to the authored catalogue. Real private reports require a separately reviewed publication process.

## Verification

- [Cloud SDK verification](design/graphrag-sdk-verification.json): one phone → four candidates; one amount → one candidate; one explicitly reported alias → one candidate.
- SDK tests use the real installed strategy classes with a fake database transport; integration tests run the actual SDK against disposable local FalkorDB graphs and real MongoDB transactions.
- Candidate-review tests reject missing, duplicated and invented decisions. Worker integration verifies that omitted content is absent from the generation context/receipt and decisions remain private.
- The browser walkthrough uses the configured live text provider. Final live decisions and UI screenshots are recorded in the verification artifact.

Run the isolated SDK unit contracts with:

```sh
.venv-graphrag/bin/python -m unittest discover -s tests/graphrag -q
```
