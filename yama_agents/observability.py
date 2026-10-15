"""Opt-in operational traces. No prompts, responses, identifiers or exception bodies."""

from urllib.parse import urlsplit
from threading import Thread

from yama_agents.backend import BackendError


ALLOWED_ATTRIBUTES = {
    "langfuse.observation.type", "langfuse.observation.model.name", "langfuse.observation.version",
    "langfuse.observation.usage_details", "langfuse.observation.metadata.provider",
    "langfuse.observation.metadata.agent", "langfuse.observation.metadata.tool",
    "langfuse.observation.metadata.language", "langfuse.observation.metadata.status",
}
OBSERVATION_NAME = "yama-saathi-extraction"


def safe_attributes(attributes):
    return {key: value for key, value in attributes.items() if key in ALLOWED_ATTRIBUTES}


def exportable_span(span):
    # Attribute masking cannot redact events or links, so reject such spans.
    return (span.name in {OBSERVATION_NAME, "yama-text-dialogue"} and span.instrumentation_scope.name == "langfuse-sdk"
            and not span.events and not span.links)


def mask_spans(*, params):
    from langfuse.types import MaskOtelSpansResult, OtelSpanPatch
    patches = {}
    for identifier, span in params.spans.items():
        allowed = safe_attributes(span.attributes)
        patches[identifier] = OtelSpanPatch(delete_attributes=tuple(key for key in span.attributes if key not in allowed))
    return MaskOtelSpansResult(span_patches=patches)


def monitoring_destination(value):
    parsed = urlsplit(value)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise BackendError("monitor_not_configured")
    if value.rstrip("/") in {"https://cloud.langfuse.com", "https://us.cloud.langfuse.com"}:
        return value.rstrip("/")
    if parsed.scheme == "http" and parsed.hostname == "127.0.0.1" and parsed.port and 1024 <= parsed.port <= 65535:
        return value.rstrip("/")
    raise BackendError("monitor_not_configured")


class MetadataMonitor:
    def __init__(self, client=None):
        self.client = client
        self.observation = None

    @classmethod
    def from_env(cls, env):
        if env.get("YAMA_LANGFUSE_ENABLED", "false") == "false":
            return cls()
        if (env.get("YAMA_LANGFUSE_ENABLED") != "true" or not env.get("LANGFUSE_PUBLIC_KEY", "").strip()
                or not env.get("LANGFUSE_SECRET_KEY", "").strip()):
            raise BackendError("monitor_not_configured")
        destination = monitoring_destination(env.get("LANGFUSE_BASE_URL", ""))
        from langfuse import Langfuse
        from opentelemetry.sdk.trace import TracerProvider
        import httpx
        client = Langfuse(public_key=env["LANGFUSE_PUBLIC_KEY"], secret_key=env["LANGFUSE_SECRET_KEY"],
            base_url=destination, timeout=2, debug=False, environment="synthetic-demo", media_upload_thread_count=0,
            httpx_client=httpx.Client(trust_env=False, follow_redirects=False), tracer_provider=TracerProvider(),
            should_export_span=exportable_span,
            mask_otel_spans=mask_spans)
        return cls(client)

    def start(self, model, language, *, agent="saathi", operation="extraction"):
        if agent not in {"saathi", "drishti", "disha"} or operation not in {"extraction", "dialogue"}:
            return
        if self.client is None:
            return
        try:
            self.observation = self.client.start_observation(name=OBSERVATION_NAME if operation == "extraction" else "yama-text-dialogue", as_type="generation", model=model,
                version="1", metadata={"provider": "openai", "agent": agent, "tool": "propose_draft_assertions" if operation == "extraction" else "text_reply", "language": language})
        except Exception:
            self.observation = None

    def finish(self, status, *, input_tokens=None, output_tokens=None):
        if self.observation is None:
            return
        try:
            if status not in {"received", "failed", "canceled", "ready"}:
                status = "failed"
            usage = {key: value for key, value in {"input": input_tokens, "output": output_tokens}.items()
                     if type(value) is int and 0 <= value <= 1_000_000}
            self.observation.update(metadata={"status": status}, usage_details=usage)
            self.observation.end()
        except Exception:
            pass
        finally:
            self.observation = None

    def flush(self, timeout_seconds=2):
        if self.client is not None:
            def export():
                try:
                    self.client.flush()
                except Exception:
                    pass
            # A failing exporter must not hold a valid extraction hostage.
            # A daemon avoids asyncio executor shutdown waiting for a hung export.
            thread = Thread(target=export, daemon=True)
            thread.start()
            thread.join(timeout=timeout_seconds)
