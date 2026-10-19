# Render Docker image

The root [Dockerfile](../Dockerfile) packages the existing Next.js application and worker code with Node 24, Python 3.13, the three isolated SDK environments, and pinned multilingual E5 model assets. It uses CPU-only PyTorch and runs as UID/GID `10001:10001`, not root. SDK versions remain those in the existing lock files. Workers still need development dependencies such as `tsx`, so the image intentionally retains the Node development dependencies.

The image build needs network access to the public Node/Python registries, PyTorch CPU wheels, and the pinned public Hugging Face model. It needs no application credentials. The final runtime uses model files baked into `/opt/models`; runtime downloads are disabled. The allowlisted `.dockerignore` excludes local env files, native account sessions, database/upload directories, host virtual environments, Git history, and build outputs from the context.

## Dashboard settings

In Render, create a **Web Service** from the YAMA repository:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Root Directory | Leave blank |
| Language | Docker |
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context | `.` |
| Docker Command | Leave blank to use the image's API command |
| Health Check Path | `/api/health` once the database configuration is valid |

There is no separate Render Build Command for this Docker image. Its default command validates hosted settings before starting Next.js on `0.0.0.0:$PORT`, with port `10000` as the default. It does not use the localhost-only `npm start` command. Keep Docker Command blank so a saved override does not skip this check. Render should inject secrets as runtime environment variables; do not put them in Dockerfile build arguments or copy `.env.local` into the image.

## Hosted environment and readiness

Set these in Render's Environment page. If imported localhost values override the image defaults, update them explicitly:

```dotenv
YAMA_DEPLOYMENT_MODE=hosted-demo
YAMA_DEMO_ONLY=true
YAMA_GRAPH_TARGET=cloud
APP_ORIGIN=https://yamawillsave.vercel.app
MONGODB_DATABASE=yama
```

Use the frontend's actual HTTPS origin for `APP_ORIGIN`. Also supply `MONGODB_URI` with the authenticated Atlas `mongodb+srv://` URI, `BETTER_AUTH_SECRET` with at least 32 random characters, and the `YAMA_CLOUD_FALKORDB_HOST/PORT/USERNAME/PASSWORD/TLS` settings from the working instance connection. Match its TLS setting; this change does not rewrite credentials or assume encryption where the endpoint does not provide it.

In hosted mode only, `YAMA_DEPLOYMENT_ORIGIN` and `YAMA_CLOUD_MONGODB_URI` can supply the saved cloud settings when `APP_ORIGIN` or `MONGODB_URI` is missing or still points to loopback. Explicit non-local active values take priority. Invalid values fail validation instead of silently falling back to another destination. Localhost mode keeps its existing restrictions and does not activate staged cloud settings. Hosted mode requires HTTPS, authenticated Atlas with certificate verification, the cloud graph, and synthetic-only use. Keep personal Codex sessions off the server: select `YAMA_TEXT_PROVIDER=fixture` for the initial check, or deliberately configure the API adapter.

The container now fails early with **field names only** if configuration is invalid. A successful startup validation does not prove the databases are reachable. `/api/health` still returns `503` when either database is unavailable; each probe has a four-second deadline, below Render's five-second HTTP health limit. The response and server log identify `configuration`, `mongo`, or `graph` without returning addresses, credentials, or driver errors. It returns `200` only when both dependency checks pass.

If the health response identifies MongoDB, check Atlas credentials and network access for Render's outbound addresses. If it identifies the graph, check that the instance is running and the host, port, username, password, and TLS option match its connection panel. Do not change the health path to a static page to conceal a failing dependency. A Render log that reaches `exporting to image`, `Next.js`, and `Ready`, followed by `Timed Out`, has passed the image build; inspect readiness and the service's port/health settings next.

Use the same Dockerfile for separate Background Worker services. Override **Docker Command** with one of:

```sh
# Graph projection:
node --conditions=react-server --import tsx scripts/database/graph-worker.ts

# Agent extraction and dialogue:
node --conditions=react-server --import tsx scripts/database/agent-worker.ts

# Voice transport, after its separate cloud configuration is implemented:
node --conditions=react-server --import tsx scripts/database/voice-worker.ts
```

Run one command per service. These direct commands use the host's injected environment and do not require `.env.local`. The image does not automatically launch workers alongside the API. Configure the same databases and appropriate provider settings on each service that uses them. Do not run DB bootstrap, seed, or index commands on every deploy or worker restart.

The image supplies these runtime paths; do not replace them with Mac paths:

```dotenv
YAMA_AGENT_PYTHON=/opt/venvs/agents/bin/python
YAMA_GRAPHRAG_PYTHON=/opt/venvs/graphrag/bin/python
YAMA_VOICE_PYTHON=/opt/venvs/voice/bin/python
YAMA_SEMANTIC_MODEL_PATH=/opt/models/multilingual-e5-small
```

Semantic retrieval still requires a seeded, current vector index and explicit `YAMA_SEMANTIC_RETRIEVAL_ENABLED=true`. Baking a model into the image does not publish reports, seed a database, or enable paid services.

## Build and inspect locally

The full image includes ML dependencies and model weights. Allow several GB of additional disk space for dependencies, image layers, and build cache, plus enough RAM for the Next.js build and an encoder process. Build natively on the target architecture; Render builds its Linux image from the Dockerfile.

```sh
docker build -t yama-runtime .

# No application secrets, databases, or provider calls needed for these checks:
docker run --rm --network none yama-runtime node --version
docker run --rm --network none yama-runtime \
  /opt/venvs/agents/bin/python -c 'import openai, langfuse'
docker run --rm --network none yama-runtime \
  /opt/venvs/graphrag/bin/python -c 'import graphrag_sdk, torch; assert torch.version.cuda is None'
docker run --rm --network none yama-runtime \
  /opt/venvs/voice/bin/python -c 'from livekit.plugins import sarvam'
docker run --rm --network none yama-runtime \
  /opt/venvs/graphrag/bin/python -c 'from yama_agents.embeddings import LocalEmbeddings; assert len(LocalEmbeddings().encode("Fictional account access incident", query=True)) == 384'

# Missing configuration must fail before starting the listener, with field names only:
docker run --rm --network none yama-runtime

# For an actual HTTP check, inject hosted credentials using your container host's
# secret mechanism, then map port 10000. Do not use the Mac's local database URI.
```

The deployment image never contains real `.env.local` values. Do not blindly pass the Mac's local env file: its loopback database addresses refer to the container itself and its interpreter paths do not exist there.

Local verification on 18 October 2026: 142 Python tests and five SDK contracts passed, including three tests for model-only setup without touching local configuration. The local Docker build was stopped under disk pressure before its image completed. At that point, the full image and container startup had not been verified.

19 October: the supplied Render log confirms the full image build/export and the Next.js listener succeeded. The deploy timed out afterward. The startup/readiness correction adds the explicit hosted mode, cloud aliases, preflight diagnostics, and bounded dependency checks; these have regression tests. This does not confirm the new deployment or Render-to-database network access until its actual health check passes.

## Remaining hosting work

This commit packages the runtime; it does not make the localhost application ready for a public deployment:

- Hosted HTTPS origins and Atlas are now accepted in explicit hosted-demo mode. Vercel API forwarding and browser/auth behaviour across the deployed frontend/backend still need integration verification. Configure the frontend's exact origin; the API does not allow arbitrary cross-origin mutations.
- Voice's current validation still permits only local LiveKit. Including its SDK is not cloud voice verification or permission to enable live provider calls.
- Document extraction still invokes a local Colima/Docker parser. This image does not provide that host daemon or bypass parser isolation; the hosted parser needs its own design.
- Evidence and the embedding query cache currently write under `/app/.local`. They are ephemeral without appropriate storage. A disk is not shared across Render services; split API/evidence processing needs a shared storage adapter. A disk mounted over the whole `/app` would also hide application files.
- The native signed-in Codex adapter and Mac credentials are not included. Use fixture mode or a deliberately configured server-side API provider.
- Render does not currently offer an India region. Keep this deployment scoped to a synthetic demo; it does not satisfy the eventual India-only real-report requirement.

References: [Render Docker settings](https://render.com/docs/docker), [workers](https://render.com/docs/background-workers), [persistent disks](https://render.com/docs/disks), [regions](https://render.com/docs/regions), and [application configuration](../.env.example).
