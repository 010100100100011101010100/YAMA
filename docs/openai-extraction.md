# OpenAI extraction and private monitoring

Implemented 2026-10-10 as increment **3c1**. The official Python OpenAI and Langfuse SDKs are installed in `.venv`, with exact dependency versions in `requirements-agents.lock`. Saathi's existing saved-notes → extraction → source review → explicit acceptance → separate confirmation flow now supports OpenAI. Fixtures remain the default. No account credentials or live provider requests were used to verify this increment.

This increment implements extraction only. Generated foreground dialogue, persistent conversation delivery and automatic handoffs are now implemented in [increment 3c2](text-dialogue.md). Drishti's actual scoped graph reads and Disha's deterministic summary/manifest remain connected through the existing coordinator. Voice, external lookup, mail and checkout keep their later stages.

## Contract and execution

The API resolves the account and current report revision, then freezes a server-selected provider/model descriptor and a private hash of endpoint/token/timeout configuration in the durable receipt. The browser cannot choose a provider, model, role or account. Changing execution settings invalidates queued OpenAI work; old fixture receipts still run locally. The task's configured model ID is bound to its result hash and accepted assertion provenance. A returned model ID must match that configuration; use an explicit resolved snapshot ID rather than an alias that resolves differently.

The worker passes only the authorized public report snapshot and selected adapter through private stdin. Database credentials, session cookies, inherited proxy settings and tracing configuration outside the allowlist do not reach the subprocess. Only live jobs receive the required OpenAI/Langfuse configuration. Requests send the chosen language and original message IDs/text; they omit owner IDs, report IDs, assertions and evidence. The fixed shared policy and Saathi role instructions are server-controlled. Narration is untrusted data. No provider tools, web search, file uploads, write actions or provider conversation state are enabled.

OpenAI receives one Responses request with strict Structured Outputs and `store: false`. Refusal, incomplete output, different model, invalid JSON, schema errors, fabricated quotes and surrogate-boundary errors cannot produce accepted details. Python checks exact UTF-16 source spans and preserves existing corrections/exclusions; Node independently validates the result and assigns trusted proposal IDs. Proposals remain unverified. Only explicit user selection/acknowledgement commits a draft; confirmation remains a separate action. [Responses Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)

## Bounds and ambiguous outcomes

| Boundary | Limit |
| --- | --- |
| Message context | At most 8 messages and 12,000 UTF-16 units |
| Provider response | At most 4,096 output tokens; 256 KB decoded output; 20 proposals |
| Provider request | 15 seconds by default, configurable 1–18; SDK automatic retries disabled |
| Coordinator / process / Mongo lease | 20 / 25 / 45 seconds |
| Per-report extraction requests | Existing transactional lifetime quota of 20 |
| Shared OpenAI budget | Default 20 lifetime call reservations per Mongo database; configurable 1–100 |
| Monitoring shutdown | At most 2 seconds; exporter failure does not invalidate a result |

Mongo `provider_budgets` atomically reserves a call before live execution, across reports/accounts/workers. A failure, cancellation or crash keeps that reservation consumed because the provider may have charged it. An expired live claim fails with `provider_call_uncertain`; it never calls again automatically. Fixtures retain their existing bounded recovery behavior. The budget is deliberately not replenished by an environment reload, date rollover or new report. There is no agent/browser budget reset operation.

This is a call ceiling, **not a dollar ceiling**. Configure an appropriate project/model and provider-side spend controls before activation. Request latency and response token limits cannot guarantee prices or provider availability. Tests inject fake runners, HTTP transports and exporters. The actual subprocess runner refuses live calls under `NODE_ENV=test` before reserving a call. HTTP integration checks also require a fixture-mode dev server and paused application workers.

## Metadata-only Langfuse

Monitoring is independently opt-in and attaches to OpenAI extraction and the subsequent text-dialogue service. It uses manual generation observations with a dedicated tracer provider, rather than wrapping the OpenAI client or decorating functions that capture arguments. The exported observation has a fixed name. Allowed attributes are observation type/version, configured model, token counts and fixed provider/agent/tool/language/status metadata. A status of `received` means a response arrived, not that its proposals passed source validation or were accepted.

An export-stage allowlist deletes every other attribute, including input, output, identity, URLs and exception details. Spans with events, links, a different name or another instrumentation scope are excluded entirely. No raw text, user/report/task IDs, filenames, prompts, responses or exception bodies are supplied. Export failures are ignored and flush runs on a daemon thread with a two-second join. Monitoring can therefore lose a trace without blocking extraction. In-memory tests exercise the **actual Langfuse exporter path**, including source-free token/language attributes. [Langfuse manual observations](https://langfuse.com/docs/observability/sdk/instrumentation) · [export masking](https://langfuse.com/docs/observability/features/masking)

Allowed monitoring destinations are the two documented cloud hosts or an explicit `http://127.0.0.1:PORT` (1024–65535) self-hosted origin. Local self-hosting is not installed in this increment. Choose the destination deliberately before supplying monitoring keys.

## Configuration to add later

All new entries are in [.env.example](../.env.example). Existing `.env.local` values were preserved. Keep every key server-side; none has a `NEXT_PUBLIC_` prefix.

1. Run `npm run agents:setup` on another checkout to create `.venv` and install the pinned SDKs. `npm run test:providers` runs the SDK checks without network or credentials.
2. When ready for a bounded **synthetic-only** smoke test, set `YAMA_TEXT_PROVIDER=openai`, `YAMA_MODEL_LIVE_ENABLED=true`, `YAMA_OPENAI_DATA_POLICY_ACKNOWLEDGED=true`, `OPENAI_API_KEY` and an explicit compatible resolved `OPENAI_TEXT_MODEL`. Review `OPENAI_BASE_URL`, token/time limits and `YAMA_OPENAI_MAX_CALLS` first. Keep `YAMA_DEMO_ONLY=true`.
3. Optionally set `YAMA_LANGFUSE_ENABLED=true`, both Langfuse keys and the explicit `LANGFUSE_BASE_URL`. Leaving monitoring disabled requires no Langfuse account.
4. Restart the Next.js server and agent worker after changing configuration. Use fictional narration in English/Hindi/Hinglish, open **Check my notes**, extract, inspect quotes, select/acknowledge and accept. Then correct a detail and separately confirm the reviewed revision. Observe the receipt, persisted provenance and remaining budget. Stop and inspect failures rather than repeatedly creating paid jobs.

An API key alone does not enable paid calls. Missing/invalid enablement, data-policy acknowledgement, model or destination fails closed; there is no silent fixture fallback for an OpenAI job. Do not paste secrets into chat or commit `.env.local`.

## Retention and destination limits

`store: false` disables Responses application-state storage; it does **not** establish Zero Data Retention or eliminate default abuse-monitoring logs. Organization/project approval and provider controls must be checked separately. The acknowledgement flag records operator configuration intent, not proof of provider compliance. India currently supports storage residency but not processing residency in OpenAI's published controls. The India endpoint is allowed only for an appropriately configured project; it does not satisfy an India-only inference requirement. This integration therefore remains synthetic localhost tooling and does not clear public-launch requirements. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

Live model access, extraction quality, billing, retention eligibility, regional routing and a real Langfuse endpoint remain unverified until credentials are configured. Source matching proves provenance of text, not the truth of an incident or the accuracy of a model's classification. The user review boundary remains essential.

The [verification record](openai-extraction-verification.json) records 315 passing tests, type checking, lint, production build, pinned SDK setup and additive database initialization. Python tests ran with `.venv/bin/python -m unittest discover -s tests -v`, including the actual SDK tests without skips. The optional `npm run test:providers` command runs only the provider/SDK subset.
