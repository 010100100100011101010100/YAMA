# Local case-comparison and Codex text demo

This demo uses 40 invented, named personas across seven harm categories, with detailed accounts, chat excerpts, contact identifiers, uploaded PNGs, reviewed text and follow-up outcomes. The current edition is `synthetic-incidents-v3`. It includes recurring fictional actors and explicit false-link controls. It uses local MongoDB and the selected FalkorDB destination (cloud here). Real incidents and public deployment remain outside the demo.

## Start and seed

After the existing local runtime setup, run:

```sh
npm run db:up
npm run db:init
npm run db:seed-demo
```

Seeding is idempotent and preserves existing reports. The command prints counts and the starter narrative. Source files stay in the ignored private evidence directory; comparisons expose only explicit synthetic summaries and evidence metadata. See [the dataset contract](synthetic-case-dataset.md).

Select `YAMA_TEXT_PROVIDER=codex`, set `YAMA_CODEX_ENABLED=true` and the local Codex settings described in [provider setup](local-codex-provider.md). Keep the OpenAI API provider disabled while it has no credits. Codex uses the existing native ChatGPT sign-in and that account's allowance; it does not use the saved API key or run an offline model.

Use separate terminals for the application and workers:

```sh
npm run dev
npm run worker:graph
npm run worker:agents
npm run worker:evidence
```

## Exercise the dashboard

1. Open `http://127.0.0.1:3000/` and start a new chat.
2. Paste the starter narrative from the seed command or [dataset guide](synthetic-case-dataset.md).
3. Open **Your notes**, review the account, and confirm it. Confirmation is required before comparing contacts; corrections invalidate it.
4. Choose **Drishti**, then use **Ask selected agent** after the previous reply is delivered. This reuses the current user message without adding new narration or changing the confirmed revision.
5. Open **See what connects** to inspect shared contacts, source quotations, outcomes and follow-up actions. The starter matches three gadget accounts plus Rhea's account-takeover report. The contractor contact `@yama_demo_venue_83` matches two sexual-harm accounts and a witness-intimidation account, excluding a corrected attribution. Shared contacts remain a lead, not proof of a person; the authored same-actor graph is a separate evaluation key.
6. Choose **Disha** and ask for a reply to discuss reported outcomes and possible next steps. Saathi handles clarification; the server also supports bounded handoffs between all three roles. `@Drishti` addresses Drishti directly; a plain named request goes through Saathi's explicit transfer.
7. Refresh: saved messages, confirmation, case status and source-linked comparison remain in the database. Only the user marks their chat resolved.

A newly typed message adds narration and requires fresh review/confirmation before a comparison uses it. Asking the selected agent again is useful for discussing the already-confirmed account. Agent-generated extraction proposals also require review and acceptance; they never confirm themselves.

## Automated regression checks

Stop the regular graph/agent workers while running integration tests: the tests drive their own workers and deliberately inspect queued/pending states. Keep local databases running. Start the app in fixture mode before HTTP integration tests:

```sh
YAMA_TEXT_PROVIDER=fixture npm run dev
```

Then, in another terminal:

```sh
YAMA_TEXT_PROVIDER=fixture npm test
YAMA_TEXT_PROVIDER=fixture npm run test:integration
.venv/bin/python -m unittest discover -s tests -q
npm run typecheck
npm run lint
npm run build
```

The full integration suite also tests the local LiveKit transport with synthetic frames. Run `npm run voice:server` for that check; Sarvam/live voice remains disabled. Automated provider tests use fixtures or injected transports, not the Codex account or paid APIs. Real Codex smoke checks are separate, explicit synthetic runs.
