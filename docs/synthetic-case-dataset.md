# Synthetic case dataset

`npm run db:seed-demo` installs the current edition of 40 fictional user reports in local MongoDB and the selected FalkorDB destination, without calling an external model or resetting existing data. FalkorDB Cloud is the active destination in this workspace. Run `npm run db:setup`, `npm run db:up`, and `npm run db:init` first on a new checkout. The seed uses the application MongoDB credentials and the existing private evidence directory.

The current edition, `synthetic-incidents-v3`, retains the 25 named accounts and adds 15 across cybercrime, bullying, hate speech, suspected terrorism, fraud, suspected money laundering and sexual molestation. Sexual-harm accounts concern adults and remain non-graphic. Each account has a persona, occupation/city, first-person narrative, timestamped chat excerpt and follow-up. These are invented stories with fictional provenance in metadata and on the evidence record. Reserved contacts and the first 25 case IDs remain stable for existing demo chats.

Read [all 40 accounts and their recurring actors](demo-casebook.md). The earlier [named-edition verification](design/named-demo-verification.json) records the v2 refresh; [cross-harm verification](design/cross-harm-demo-verification.json) records the applied v3 edition. Historical sources and evidence are retained.

Examples include Emily Mosaic, an illustrator who receives conflicting shipping labels for a laptop; Tony Stank, a wedding videographer asked for another payment after an old camera video is reused; and Bruce Willi, an architecture student whose tablet invoice describes a laptop. Other cases include a looping equipment-delivery map, a courier charge for a parcel already delivered, a room viewing unknown to building security and a moving-truck registration that describes a scooter. Everyday delays and attribution corrections are included alongside suspicious reports.

The source is `src/server/reports/demo-cases.ts`. Each case has a narrative, three contact identifiers, reported actions and dates, a reported resolution, and references to its sources. Five clusters cover gadget non-delivery, recruitment deposits, prepaid tasks/investments, courier impersonation and rental deposits. Controls include completed delivery, a declined payment, corrected attribution, uncertain attribution and explicitly excluded contacts. All phone numbers use the fictional +1-202-555-01xx range; emails use `.invalid`; Telegram-like handles are clearly marked `yama_demo` and must not be contacted.

The command creates:

- 40 source reports under reserved synthetic reporter owners, with revision/provenance records and graph snapshots;
- 40 PNG conversation-record images uploaded through the evidence service, with private bytes and SHA-256 metadata;
- 40 separately uploaded, extracted and reviewed UTF-8 text transcriptions;
- 40 published synthetic comparison summaries in MongoDB and the shared FalkorDB catalogue;
- seven `FictionalActor` nodes linked through `AUTHORED_ACTOR`, and seven `HarmCategory` nodes through `HAS_HARM`.

The text transcription is authored fixture content, **not an OCR result**. The PNG remains a real stored image eligible for the app's normal OCR workflow. The seed does not forge extraction provenance, police action, actual transactions or delivery receipts. Reported refunds, blocks and complaints are fictional user-reported outcomes, not independently verified facts or predictions for a new case.

Rerunning one edition reuses report/upload IDs and reviews. Changed bytes under an existing upload key fail rather than overwrite evidence. New editions preserve established published case IDs but change content versions and source/upload IDs. The seeder only replaces known fixtures with the expected version-bound source ID. Historical sources/files and personal chats remain intact. Older comparison/purchase receipts become stale when catalogue content changes. Filenames use the persona, such as `emily-mosaic-conversation.png`.

## Fictional actors and evidence boundaries

`fictionalActor` is an author-only answer key with `basis: authored_fixture_truth`. It establishes recurring actors inside the invented scenarios. It is stored in MongoDB and explicit FalkorDB edges for inspection/evaluation. It is deliberately excluded from comparison API results and agent context; normal retrieval never traverses it to infer a person’s identity. `harmCategories` are reported concerns, including a concern later cleared, not legal findings. These categories are validated in both TypeScript and Python and supplied to Drishti/Disha. A shared alias alone produces no match.

Lex Voss connects gadget fraud and account takeover. Wilson Sable connects recruitment fraud and suspected laundering. Victor Morne connects task fraud, bullying, cybercrime and hate targeting. Oswald Crowe connects rental fraud and targeted hate posts. Silas Rook appears in two threat/coercion reports. Adrian Crane’s contractor contact appears in sexual-harm reports and witness intimidation. False-name, cleared-concern and explicitly excluded-contact controls stay outside the known-actor groups. Unpublishing a case removes identifier, harm and actor edges.

An operator can inspect the authored topology without treating it as runtime proof:

```cypher
MATCH (a:FictionalActor {id: 'victor-morne'})<-[:AUTHORED_ACTOR]-(c:CatalogueCase)-[:HAS_HARM]->(h:HarmCategory)
RETURN a.name, c.title, collect(h.key)
```

## Try an exact-contact comparison

Open a new chat and use this synthetic narrative:

> I paid INR7200 to Copper Finch for a used camera before a wedding booking. They promised next-day dispatch, then asked for another INR1800 to release the courier parcel. The tracking page still says label created and they stopped replying when I asked for a fresh video. The seller's phone is +1 202 555 0101, email gadget1@yama-demo.invalid and Telegram @yama_demo_gadget_01. I have the invoice and payment screenshot. Can Drishti check whether anyone else dealt with these contacts, and can Disha explain what happened in those cases?

Review and confirm before asking Drishti for connections. The contacts return Emily, Tony and Bruce's gadget reports plus Rhea Danvers's account-takeover report. The excluded gadget control must not appear. For a non-financial comparison, use `The contractor contact was @yama_demo_venue_83.` after review/confirmation: Raven, Tara and Daisy should match; Maya's explicitly excluded card must not. Disha can explain reported actions without claiming an automatic complaint was filed or equating a practical support action with complete resolution.

The comparison endpoint remains `/api/reports/:reportId/connections`. It reads the current confirmed private snapshot and traverses the shared synthetic catalogue; it never traverses other users' private graphs. Exact contact matches and shared patterns are separate bases. An identifier-only query can return a result even when there are no pattern tags. Exact overlap is a potential lead, not proof of a shared person: accounts can be shared, recycled or impersonated.

Only included, affirmative, unchanged narrative/note assertions with real source ranges support contact matching. Negated/uncertain clauses and quoted examples are excluded; contradictory assertions block the corresponding positive contact. Edits require confirmation again. Matching is conservative text parsing; it is not a general natural-language identity resolver.

Comparison results include safe synthetic image/transcription metadata (filename and hash). Source reports and bytes retain their owners' access checks, so another user's evidence cannot be downloaded through a guessed report or file ID.

## Verification

- `npm run test:backend -- tests/backend/demo-cases.test.ts` checks case richness, version binding, source ranges, normalization and negative evidence.
- `npm run test:integration -- tests/integration/demo-cases.test.ts` seeds an isolated local namespace twice and verifies named graph records, actor/harm edges, uploaded hashes, outcomes, counterexamples and access control. It checks upgrades from both v1 and v2 to v3, preserving historical evidence and personal chats, and verifies edge removal on unpublishing. Its temporary database, graph and files are removed after testing; automated cleanup never targets cloud.

The two original small catalogue fixtures remain unchanged for existing regression tests. The 40-case edition is installed explicitly by the seed command.
