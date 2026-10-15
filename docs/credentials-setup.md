# Credentials and connection setup

Updated 15 October 2026. Actual credentials are stored only in the ignored `.env.local` file with mode `0600`. This document contains no credential values.

## Saved configuration

- OpenAI, Sarvam, Exa, Firecrawl, Gmail, Dodo Payments and Better Auth Infrastructure credentials have been saved.
- Gmail's app password has spaces removed, and `YAMA_MAIL_GMAIL_AUTH=app_password` selects that credential method. Sending remains disabled.
- Langfuse and Resend remain unconfigured, as requested. OpenAI's model ID remains unset, and live text generation remains disabled while the reported balance is zero.
- All live-provider activation flags remain disabled. Data-policy acknowledgement flags have not been changed.
- Local database, auth-secret, LiveKit and application-origin values are preserved.

Cloud values are staged under the following names, **which the runtime does not currently read**:

| Saved setting | Environment names |
| --- | --- |
| MongoDB Atlas | `YAMA_CLOUD_MONGODB_URI` |
| FalkorDB Cloud | `YAMA_CLOUD_FALKORDB_INSTANCE_ID`, `YAMA_CLOUD_FALKORDB_HOST`, `YAMA_CLOUD_FALKORDB_PORT`, `YAMA_CLOUD_FALKORDB_USERNAME`, `YAMA_CLOUD_FALKORDB_PASSWORD` |
| LiveKit Cloud | `YAMA_CLOUD_LIVEKIT_URL`, `YAMA_CLOUD_LIVEKIT_API_KEY`, `YAMA_CLOUD_LIVEKIT_API_SECRET` |
| Intended deployment origin | `YAMA_DEPLOYMENT_ORIGIN` |

The supplied LiveKit URL's shell escaping was removed before storage. Dodo's endpoint ID and currently configured URL are saved as reference metadata in `DODO_PAYMENTS_WEBHOOK_ENDPOINT_ID` and `DODO_PAYMENTS_WEBHOOK_CONFIGURED_URL`.

Switching to these cloud services requires changes to the existing localhost-only configuration and transports. FalkorDB also needs cloud username/TLS configuration. Saving staged values does not migrate database contents or connect the cloud accounts.

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
- **Cloud database access:** verify network access, database permissions and TLS as part of the cloud-transport implementation. These credentials have not been tested remotely.

Rotate credentials disclosed in chat before production use, and replace their corresponding private environment values. Do not copy this local environment file into source control or expose its keys through `NEXT_PUBLIC_` variables.
