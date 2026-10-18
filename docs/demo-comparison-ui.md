# Related case presentation

The existing BeautifulUI InsightCards view in `Connections.tsx` renders the actual comparison API response. It does not insert catalogue records on the client.

`ConnectionRecordDetails.tsx` adds the detail available on expanded synthetic case records:

- Exact phone, email and Telegram matches, with separate original quotations from the current report and the related case. Matching identifiers remain distinct from the shared pattern count and never establish a verified identity.
- Resolved, unresolved and partially resolved outcomes, the reported summary, and dated follow-up actions. These are synthetic user-reported outcomes, not independently verified bank, platform or police actions.
- Uploaded file names, types and hashes. Candidate evidence metadata does not provide access to another account’s private files or fabricate image URLs.
- English, Hindi and Hinglish controls. Quoted source text retains its original language and writing direction.

The source disclosure in `ConnectionSources.tsx` also lists excluded, contradicted, uncertain or blocked identifier statements. It does not present them as matching support. Legacy pattern-only records remain valid without invented identifiers or outcomes.

Codex-generated proposals use the `Codex session` label in the proposal review and accepted-source attribution. Their provider metadata is retained when dialogue becomes conversation messages. This is a signed-in Codex service connection, not a local offline model or an OpenAI API response.

After a reply has been delivered, **Ask selected agent** requests another response using the current saved report and its existing confirmation. It does not add a narration message or invalidate confirmed comparison sources. The control is absent while a reply is queued or running.

## Verification

Run the focused checks:

```sh
npx vitest run tests/frontend/connection-records.test.tsx tests/frontend/connection-sources.test.tsx tests/frontend/agent-proposal-review.test.tsx tests/frontend/dialogue.test.ts tests/frontend/dialogue-storyroom.test.tsx
```

Coverage includes identifier-only matches, phone/email/Telegram display, reported outcomes, file privacy, actual file-format labels, legacy results, carousel focus, keyboard source disclosures, withheld identifier uncertainty, Codex provider attribution and Hindi accessibility.

Browser verification must additionally use a saved, confirmed report against the seeded MongoDB/FalkorDB data. A mocked component result alone does not prove that graph queries or the Codex worker are connected.
