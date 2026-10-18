# Credentials and connection setup

Updated 17 October 2026. Actual credentials are stored only in the ignored `.env.local` file with mode `0600`. This document contains no credential values.

17 October update: local MongoDB has recovered and the application/database/API checks pass. The signed-in Codex text provider is now explicitly selected for the synthetic localhost demo; the OpenAI API and other live integrations remain disabled. See [the current demo guide](demo-testing.md) and [verified dataset/conversation results](design/local-codex-demo/verification.json). The storage failure described below records the earlier credential-saving task, not the current runtime state.

## Saved configuration

- OpenAI, Sarvam, Exa, Firecrawl, Gmail, Dodo Payments and Better Auth Infrastructure credentials have been saved.
- Gmail's app password has spaces removed, and `YAMA_MAIL_GMAIL_AUTH=app_password` selects that credential method. Sending remains disabled.
- Langfuse and Resend remain unconfigured, as requested. OpenAI's model ID remains unset, and live text generation remains disabled while the reported balance is zero.
- All live-provider activation flags remain disabled. Data-policy acknowledgement flags have not been changed.
- Local database, auth-secret, LiveKit and application-origin values are preserved.

Cloud values are saved under the following names. FalkorDB has an explicit destination selector; the other cloud transports remain staged:

| Saved setting | Environment names |
| --- | --- |
| MongoDB Atlas | `YAMA_CLOUD_MONGODB_URI` |
| FalkorDB Cloud | `YAMA_GRAPH_TARGET`, `YAMA_CLOUD_FALKORDB_INSTANCE_ID`, `YAMA_CLOUD_FALKORDB_HOST`, `YAMA_CLOUD_FALKORDB_PORT`, `YAMA_CLOUD_FALKORDB_USERNAME`, `YAMA_CLOUD_FALKORDB_PASSWORD`, `YAMA_CLOUD_FALKORDB_TLS` |
| LiveKit Cloud | `YAMA_CLOUD_LIVEKIT_URL`, `YAMA_CLOUD_LIVEKIT_API_KEY`, `YAMA_CLOUD_LIVEKIT_API_SECRET` |
| Intended deployment origin | `YAMA_DEPLOYMENT_ORIGIN` |

The supplied LiveKit URL's shell escaping was removed before storage. Dodo's endpoint ID and currently configured URL are saved as reference metadata in `DODO_PAYMENTS_WEBHOOK_ENDPOINT_ID` and `DODO_PAYMENTS_WEBHOOK_CONFIGURED_URL`.

FalkorDB now supports cloud ACL username/password and TLS with certificate/hostname verification. `YAMA_GRAPH_TARGET=local` (the default) selects the existing local `FALKORDB_*` settings. `YAMA_GRAPH_TARGET=cloud` selects the saved `YAMA_CLOUD_FALKORDB_*` settings. TLS defaults to true; match the instance Connect panel explicitly if it has no TLS. MongoDB, application origin and synthetic-only restrictions remain unchanged. Local container credentials are kept separate so switching graph destinations cannot change the local container password.

The cloud instance is now active. Its initial `ENOTFOUND`/`NXDOMAIN` failure on 17 October was resolved after the user restarted the stopped instance. The saved username/password then authenticated successfully. This instance answers plain Redis TCP and did not complete a TLS handshake, so its explicit `YAMA_CLOUD_FALKORDB_TLS=false` setting matches the working endpoint. The application remains a synthetic localhost demo; encrypted cloud transport is still needed before handling real reports.

With the app and workers stopped, the existing canonical Mongo catalogue was copied into cloud FalkorDB and all 27 current confirmed revisions were requeued and rebuilt. Verification checked 27 catalogue content versions, 27 confirmed snapshots, 118 assertions and 118 source ranges. The existing camera comparison returned its three contact-matched cases with resolved, unresolved and partially resolved outcomes. Local graph data remains intact. See [the recorded cloud verification](design/cloud-graph-verification.json). MongoDB, uploaded files and the other cloud integrations have not been migrated.

The subsequent named-persona edition replaced the 25 published demo entries with richer accounts while retaining their case IDs. Its source reports/evidence have new version-bound IDs; historical evidence and personal chats were preserved. This refresh is applied to local MongoDB and the active cloud graph. See [the casebook](demo-casebook.md) and [edition verification](design/named-demo-verification.json).

The v3 edition adds 15 accounts across the requested harms and seven recurring fictional actors. Cloud verification confirms 40 authored cases, 27 actor links, 80 new evidence files and 138 assertion/source-range projections. Five cross-harm comparison groups were exercised, and the eight personal reports and prior 100 seed evidence files remain unchanged. See [current verification](design/cross-harm-demo-verification.json). No credentials or live-provider activation flags changed for this refresh.

Check either destination without changing configuration or writing data:

```sh
npm run db:check-graph
npm run db:check-graph -- --cloud
```

The command reports the connection stage, authentication result and catalogue case count without printing credentials or case contents. A successful connection alone does not migrate existing projections. Before switching, stop the graph worker, copy the canonical synthetic Mongo catalogue into the cloud graph, requeue/rebuild current confirmed report snapshots, and verify actual comparisons. Restart the app and one graph worker against the selected destination: clients are cached per process, and local/cloud workers must not compete for the same outbox. Retain local graphs. Keep automated integration tests on `YAMA_GRAPH_TARGET=local`; their isolated test graphs are deleted during cleanup.

Connection setup alone does not install the SDK. The subsequent [GraphRAG SDK integration](graphrag-sdk-integration.md) adds indexed detail retrieval and a separate candidate review before reply generation. Saving credentials for the remaining cloud services still does not activate or migrate them.

## Verify Better Auth on localhost

Yama currently uses self-hosted Better Auth, its MongoDB adapter and anonymous sessions. The existing `BETTER_AUTH_SECRET` secures sessions. `BETTER_AUTH_API_KEY` is a separate credential for optional Better Auth Infrastructure; the app does not currently install its dashboard plugin.

Once local MongoDB is healthy:

1. Start the app with `npm run dev` and open `http://127.0.0.1:3000` consistently. `localhost` and `127.0.0.1` are different origins; the configured `APP_ORIGIN` is the latter.
2. Allow the app to establish its anonymous session.
3. Run this in the browser's developer console on the app page. It prints only a boolean, without printing the session token or user information:

   ```js
   const response = await fetch('/api/auth/get-session', { credentials: 'same-origin' });
   if (!response.ok) throw new Error(`Session check failed: ${response.status}`);
   const currentSession = await response.json();
   console.log({ authenticated: Boolean(currentSession?.session && currentSession?.user) });
   ```

An `authenticated: true` result checks the current session. It does not verify a connection to the Infrastructure dashboard or verify the person's identity. The application's initial sign-in uses `POST /api/auth/sign-in/anonymous` with an empty JSON body and its exact Origin.

### Connect the hosted dashboard separately

The official setup requires installing `@better-auth/infra` and adding `dash({ apiKey: process.env.BETTER_AUTH_API_KEY })` alongside the existing anonymous plugin in `src/server/auth.ts`. Preserve the existing secret, database adapter and trusted origin. Restart the app after configuration, create a test sign-in, and check the corresponding dashboard's session/event information.

This plugin has **not** been installed or enabled by this credential-saving task. Its package compatibility and the hosted connection still need verification. It enables outbound auth-event reporting and dashboard administrative APIs; it is not required for local sign-in. [Official Infrastructure setup](https://better-auth.com/docs/infrastructure/getting-started), [Dashboard plugin](https://better-auth.com/docs/infrastructure/plugins/dashboard), [anonymous authentication](https://better-auth.com/docs/plugins/anonymous).

### Verification outcome in this task

The localhost health, anonymous sign-in and session checks returned `503`. The untrusted-Origin request was correctly rejected with `403`, but no successful session could be established.

The local MongoDB container was stopped. A normal start failed with WiredTiger journal `fdatasync` I/O errors and exit code `133`; Docker reports it was not OOM-killed. FalkorDB remained healthy. The Mac had approximately 2.1 GiB free (99% used), while the container data filesystem had approximately 8.4 GiB free. The I/O error's root cause has not been established. No database volume was removed or reset. Resolve the storage issue before repeating auth verification.

## Remaining configuration before live checks

- **OpenAI:** add credits and select a compatible `OPENAI_TEXT_MODEL`; no model has been selected automatically.
- **Provider controls:** configure the applicable account retention/training controls before acknowledging them and enabling a live service.
- **Dodo:** confirm that the API key, merchant, product and endpoint belong to test mode. The deployment webhook must target `https://yamawillsave.vercel.app/api/billing/webhook`, rather than the site's root. Local external webhook delivery needs a separately configured reachable endpoint. The supplied signing secret does not match the application's current minimum-length validator. It has been preserved unchanged; check compatibility with Dodo's supported secret format before enabling billing, rather than padding or rewriting it.
- **Email:** the current Gmail implementation is a fallback behind Resend, not a standalone primary provider. Resend requires its key and a verified sending domain. Recipient registration is also required for controlled live mail tests.
- **Langfuse:** its project keys and base URL can be supplied later.
- **Cloud database access:** FalkorDB is active and its catalogue writes, confirmed projections and provenance-backed comparison have been verified. The supplied endpoint has no TLS; encrypted transport remains a public-launch requirement. MongoDB Atlas remains staged.

Rotate credentials disclosed in chat before production use, and replace their corresponding private environment values. Do not copy this local environment file into source control or expose its keys through `NEXT_PUBLIC_` variables.
