"""Provider contract tests: no network, credentials or billable requests."""

import asyncio
import json
import unittest
import time
from threading import Event
from types import SimpleNamespace
from unittest.mock import AsyncMock

from yama_agents.backend import BackendError
from yama_agents.coordinator import AgentId, load_profile
from yama_agents.openai_model import OpenAIModel, ProviderConfig
from yama_agents.observability import MetadataMonitor, safe_attributes, exportable_span, OBSERVATION_NAME
from test_agent_dispatcher import FakeBackend, report
from yama_agents.dispatcher import ToolDispatcher


def environment(**changes):
    return {"YAMA_DEMO_ONLY": "true", "YAMA_TEXT_PROVIDER": "openai", "YAMA_MODEL_LIVE_ENABLED": "true",
            "YAMA_OPENAI_DATA_POLICY_ACKNOWLEDGED": "true", "OPENAI_API_KEY": "test-key-never-sent",
            "OPENAI_TEXT_MODEL": "test-model", **changes}


def response(payload=None, **changes):
    return SimpleNamespace(status="completed", model="test-model", output=[], output_text=json.dumps(payload or {"proposals": []}),
                           usage=SimpleNamespace(input_tokens=100, output_tokens=20), **changes)


class ProviderTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.snapshot = report()
        self.client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock(return_value=response())))
        self.config = ProviderConfig.from_env(environment())

    def model(self, **changes):
        return OpenAIModel(self.config, client=self.client, **changes)

    async def test_request_is_minimal_bounded_and_not_stored(self):
        self.snapshot["ownerId"] = "PRIVATE_OWNER"
        self.snapshot["privateEvidence"] = "PRIVATE_FILE"
        await self.model().propose(load_profile(AgentId.SAATHI), self.snapshot)
        request = self.client.responses.create.call_args.kwargs
        self.assertFalse(request["store"])
        self.assertEqual(request["max_output_tokens"], 4096)
        self.assertEqual(request["model"], "test-model")
        self.assertEqual(request["tools"], [])
        self.assertTrue(request["text"]["format"]["strict"])
        user_context = json.loads(request["input"][0]["content"])
        self.assertEqual(set(user_context), {"language", "messages"})
        self.assertNotIn("PRIVATE_OWNER", json.dumps(request))
        self.assertNotIn("PRIVATE_FILE", json.dumps(request))
        self.assertIn("UTF-16", request["instructions"])
        self.assertIn("Saathi", request["instructions"])
        self.assertIn("not instructions", request["instructions"])

    async def test_languages_and_roles_are_checked_before_a_call(self):
        for language in ["en", "hi", "hinglish"]:
            self.snapshot["language"] = language
            await self.model().propose(load_profile(AgentId.SAATHI), self.snapshot)
            self.assertEqual(json.loads(self.client.responses.create.call_args.kwargs["input"][0]["content"])["language"], language)
        for changes in [{"synthetic": False}, {"language": "unknown"}, {"messages": self.snapshot["messages"] * 9}]:
            with self.assertRaises(BackendError):
                await self.model().propose(load_profile(AgentId.SAATHI), {**self.snapshot, **changes})
        with self.assertRaises(BackendError):
            await self.model().propose(load_profile(AgentId.DRISHTI), self.snapshot)
        self.assertEqual(self.client.responses.create.await_count, 3)

    async def test_bad_output_and_refusals_never_create_a_preview(self):
        for invalid, expected_code in [(SimpleNamespace(status="incomplete", output=[], output_text="{}", usage=None), "model_incomplete"),
                        (SimpleNamespace(status="completed", model="test-model", output=[SimpleNamespace(type="message", content=[SimpleNamespace(type="refusal")])], output_text="{}", usage=None), "model_refused"),
                        (SimpleNamespace(status="completed", model="test-model", output=[], output_text="invalid JSON", usage=None), "invalid_model_output"),
                        (response({"proposals": [], "ownerId": "forged"}), "invalid_model_output")]:
            self.client.responses.create.return_value = invalid
            dispatcher = await ToolDispatcher.bind(FakeBackend(self.snapshot), self.snapshot["_id"], self.model())
            output = dispatcher.coordinator.begin_output(AgentId.SAATHI)
            task = await dispatcher.start(output, AgentId.SAATHI, "propose_draft_assertions", {})
            receipt = await dispatcher.execute(task)
            self.assertEqual(receipt["status"], "failed")
            self.assertEqual(receipt["errorCode"], expected_code)
            self.assertEqual(receipt["adapter"]["provider"], "openai")
            self.assertNotIn("forged", json.dumps(receipt))

    async def test_model_alias_drift_is_rejected_before_provenance_is_accepted(self):
        provider_response = response()
        provider_response.model = "different-resolved-snapshot"
        self.client.responses.create.return_value = provider_response
        with self.assertRaisesRegex(BackendError, "model_mismatch"):
            await self.model().propose(load_profile(AgentId.SAATHI), self.snapshot)

    async def test_source_validation_and_existing_corrections_still_apply(self):
        source = self.snapshot["messages"][0]
        proposal = {"field": "amount", "value": "invented", "polarity": "affirmed", "quote": source["text"],
                    "source": {"messageId": source["id"], "start": 0, "end": len(source["text"])}}
        self.client.responses.create.return_value = response({"proposals": [proposal]})
        dispatcher = await ToolDispatcher.bind(FakeBackend(self.snapshot), self.snapshot["_id"], self.model())
        output = dispatcher.coordinator.begin_output(AgentId.SAATHI)
        task = await dispatcher.start(output, AgentId.SAATHI, "propose_draft_assertions", {})
        self.assertEqual((await dispatcher.execute(task))["errorCode"], "invalid_model_output")

    async def test_cancellation_and_provider_errors_are_not_retried_or_exposed(self):
        self.client.responses.create.side_effect = RuntimeError("PRIVATE_PROVIDER_BODY API_KEY")
        with self.assertRaisesRegex(BackendError, "model_unavailable") as caught:
            await self.model().propose(load_profile(AgentId.SAATHI), self.snapshot)
        self.assertNotIn("PRIVATE", str(caught.exception))
        self.assertEqual(self.client.responses.create.await_count, 1)
        self.client.responses.create.side_effect = asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            await self.model().propose(load_profile(AgentId.SAATHI), self.snapshot)

    def test_configuration_fails_closed_and_destination_is_restricted(self):
        for changes in [{"OPENAI_API_KEY": ""}, {"OPENAI_TEXT_MODEL": ""}, {"YAMA_DEMO_ONLY": "false"},
                        {"YAMA_MODEL_LIVE_ENABLED": "false"}, {"YAMA_OPENAI_DATA_POLICY_ACKNOWLEDGED": "false"},
                        {"OPENAI_BASE_URL": "https://attacker.example/v1"}, {"OPENAI_BASE_URL": "https://api.openai.com/v1?key=secret"},
                        {"YAMA_OPENAI_MAX_OUTPUT_TOKENS": "99999"}, {"YAMA_OPENAI_TIMEOUT_SECONDS": "0"}]:
            with self.assertRaises(BackendError):
                ProviderConfig.from_env(environment(**changes))


class MonitoringTests(unittest.TestCase):
    def test_monitor_configuration_rejects_unapproved_destinations_before_loading_an_sdk(self):
        configured = {"YAMA_LANGFUSE_ENABLED": "true", "LANGFUSE_PUBLIC_KEY": "test-public", "LANGFUSE_SECRET_KEY": "test-secret"}
        for destination in ["", "https://attacker.example", "https://cloud.langfuse.com/private", "https://cloud.langfuse.com?secret=key",
                            "http://localhost:3000", "http://127.0.0.1:80", "https://key@cloud.langfuse.com"]:
            with self.assertRaises(BackendError):
                MetadataMonitor.from_env({**configured, "LANGFUSE_BASE_URL": destination})
    def test_export_timeout_is_bounded_without_blocking_process_shutdown(self):
        release = Event()
        client = SimpleNamespace(flush=lambda: release.wait(1))
        started = time.monotonic()
        MetadataMonitor(client).flush(timeout_seconds=0.01)
        self.assertLess(time.monotonic() - started, 0.2)
        release.set()
    def test_spans_with_exception_events_links_or_foreign_instrumentation_are_not_exported(self):
        span = SimpleNamespace(name=OBSERVATION_NAME, instrumentation_scope=SimpleNamespace(name="langfuse-sdk"), events=(), links=())
        self.assertTrue(exportable_span(span))
        for changes in [{"events": ["PRIVATE_EXCEPTION"]}, {"links": ["PRIVATE_LINK"]},
                        {"name": "PRIVATE_NARRATIVE"}, {"instrumentation_scope": SimpleNamespace(name="auto-openai")}]:
            self.assertFalse(exportable_span(SimpleNamespace(**{**vars(span), **changes})))
    def test_disabled_monitor_has_no_sdk_or_export_side_effects(self):
        monitor = MetadataMonitor.from_env({})
        monitor.start("test-model", "en")
        monitor.finish("ready", input_tokens=1, output_tokens=2)
        monitor.flush()

    def test_export_allowlist_drops_private_and_unexpected_attributes(self):
        exported = safe_attributes({"langfuse.observation.model.name": "test-model",
            "langfuse.observation.metadata.status": "ready", "langfuse.observation.metadata.language": "hi",
            "langfuse.observation.input": "PRIVATE_NARRATIVE", "exception.message": "PRIVATE_KEY",
            "langfuse.observation.metadata.ownerId": "PRIVATE_OWNER", "gen_ai.prompt.0.content": "PRIVATE_PROMPT"})
        self.assertEqual(set(exported), {"langfuse.observation.model.name", "langfuse.observation.metadata.status", "langfuse.observation.metadata.language"})
        self.assertNotIn("PRIVATE", json.dumps(exported))

    def test_only_operational_metadata_is_recorded_and_monitor_outage_is_nonfatal(self):
        class Observation:
            def update(self, **values): calls.append(values)
            def end(self): calls.append("ended")
        class Client:
            def start_observation(self, **values): calls.append(values); return Observation()
            def flush(self): raise RuntimeError("PRIVATE_ERROR")
        calls = []
        monitor = MetadataMonitor(Client())
        monitor.start("test-model", "hinglish")
        monitor.finish("ready", input_tokens=100, output_tokens=20)
        monitor.flush()
        serialized = json.dumps(calls)
        self.assertTrue(all("input" not in call and "output" not in call for call in calls if isinstance(call, dict)))
        self.assertNotIn("user_id", serialized)
        self.assertIn("hinglish", serialized)
