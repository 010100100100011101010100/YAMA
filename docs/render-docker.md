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

There is no separate Render Build Command for this Docker image. Its default command starts Next.js on `0.0.0.0:$PORT`, with port `10000` as the default. It does not use the localhost-only `npm start` command. Render should inject secrets as runtime environment variables; do not put them in Dockerfile build arguments or copy `.env.local` into the image.

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

# Check the HTTP listener with no backend credentials. The root UI can load;
# /api/health correctly returns 503 until valid database settings are provided.
docker run --rm -p 127.0.0.1:3100:10000 yama-runtime
```

The deployment image never contains real `.env.local` values. Do not blindly pass the Mac's local env file: its loopback database addresses refer to the container itself and its interpreter paths do not exist there.

Local verification on 18 October 2026: 142 Python tests and five SDK contracts passed, including three tests for model-only setup without touching local configuration. The Docker build parsed the image definition and installed the Linux Node dependencies, but was stopped under local disk pressure before the application build and Python/model image stages completed. The full image and container startup are therefore **not yet verified**; use the checks above on a host with sufficient storage.

## Remaining hosting work

This commit packages the runtime; it does not make the localhost application ready for a public deployment:

- `src/server/config.ts` still permits only a loopback application origin and MongoDB URI. Approved hosted HTTPS origins, Atlas, auth/proxy handling, and Vercel API forwarding need a separate tested change.
- Voice's current validation still permits only local LiveKit. Including its SDK is not cloud voice verification or permission to enable live provider calls.
- Document extraction still invokes a local Colima/Docker parser. This image does not provide that host daemon or bypass parser isolation; the hosted parser needs its own design.
- Evidence and the embedding query cache currently write under `/app/.local`. They are ephemeral without appropriate storage. A disk is not shared across Render services; split API/evidence processing needs a shared storage adapter. A disk mounted over the whole `/app` would also hide application files.
- The native signed-in Codex adapter and Mac credentials are not included. Use fixture mode or a deliberately configured server-side API provider.
- Render does not currently offer an India region. Keep this deployment scoped to a synthetic demo; it does not satisfy the eventual India-only real-report requirement.

References: [Render Docker settings](https://render.com/docs/docker), [workers](https://render.com/docs/background-workers), [persistent disks](https://render.com/docs/disks), [regions](https://render.com/docs/regions), and [application configuration](../.env.example).
