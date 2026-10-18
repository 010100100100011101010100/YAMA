# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
ARG PYTHON_IMAGE=python:3.13-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641

FROM ${NODE_IMAGE} AS web-build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# Workers execute TypeScript through tsx, which is currently a devDependency.
RUN npm ci --include=dev && npm cache clean --force
COPY . .
RUN npm run build

FROM ${PYTHON_IMAGE} AS python-build
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgomp1 libportaudio2 \
    && rm -rf /var/lib/apt/lists/*
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements-agents.lock requirements-graphrag.lock requirements-voice.lock /tmp/requirements/
# These SDK stacks pin incompatible OpenAI/OTel/Pydantic versions. Keep them isolated.
RUN python -m venv /opt/venvs/agents \
    && /opt/venvs/agents/bin/pip install -r /tmp/requirements/requirements-agents.lock \
    && /opt/venvs/agents/bin/pip check
# Install the CPU wheel first so the lock does not pull CUDA dependencies on Linux.
RUN python -m venv /opt/venvs/graphrag \
    && /opt/venvs/graphrag/bin/pip install --no-deps \
       --index-url https://download.pytorch.org/whl/cpu torch==2.14.1 \
    && /opt/venvs/graphrag/bin/pip install -r /tmp/requirements/requirements-graphrag.lock \
    && /opt/venvs/graphrag/bin/pip check \
    && /opt/venvs/graphrag/bin/python -c "import torch, graphrag_sdk; assert torch.version.cuda is None"
RUN python -m venv /opt/venvs/voice \
    && /opt/venvs/voice/bin/pip install -r /tmp/requirements/requirements-voice.lock \
    && /opt/venvs/voice/bin/pip check
COPY scripts/setup-semantic.py /tmp/setup-semantic.py
# Bake only pinned public model assets into the image; never create/copy a local env file.
RUN /opt/venvs/graphrag/bin/python /tmp/setup-semantic.py \
    --directory /opt/models/multilingual-e5-small --no-env

FROM ${PYTHON_IMAGE} AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libatomic1 libgomp1 libportaudio2 libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 yama \
    && useradd --uid 10001 --gid yama --create-home yama
COPY --from=web-build /usr/local/bin/node /usr/local/bin/node
COPY --from=web-build /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
COPY --from=python-build /opt/venvs /opt/venvs
COPY --from=python-build /opt/models /opt/models
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=10000 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONNOUSERSITE=1 \
    HF_HUB_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    TOKENIZERS_PARALLELISM=false \
    YAMA_AGENT_PYTHON=/opt/venvs/agents/bin/python \
    YAMA_GRAPHRAG_PYTHON=/opt/venvs/graphrag/bin/python \
    YAMA_VOICE_PYTHON=/opt/venvs/voice/bin/python \
    YAMA_SEMANTIC_MODEL_PATH=/opt/models/multilingual-e5-small
WORKDIR /app
COPY --from=web-build /app/package.json /app/package-lock.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=web-build /app/node_modules ./node_modules
COPY --from=web-build /app/.next ./.next
COPY --from=web-build /app/public ./public
COPY --from=web-build /app/src ./src
COPY --from=web-build /app/scripts ./scripts
COPY --from=web-build /app/agents ./agents
COPY --from=web-build /app/yama_agents ./yama_agents
COPY --from=web-build /app/yama_voice ./yama_voice
COPY --from=web-build /app/licenses ./licenses
RUN mkdir -p /app/.local /app/.next/cache \
    && chown -R yama:yama /app/.local /app/.next/cache
USER 10001:10001
EXPOSE 10000
# exec forwards Render's termination signal directly to Next.js; workers override CMD.
CMD ["/bin/sh", "-c", "exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port \"${PORT:-10000}\""]
