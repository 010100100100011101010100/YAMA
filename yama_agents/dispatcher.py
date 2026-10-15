"""Bounded domain-tool execution through one existing conversation coordinator.

Construct from a trusted authenticated gateway, never from model-supplied owner,
role, generation or confirmation claims. Results are private, request/session
scoped drafts: this dispatcher has no report mutation or delivery operation.
Public lookup jobs accept predefined topics or owned source references only.
"""

import asyncio
from copy import deepcopy
from dataclasses import replace
from uuid import UUID

from yama_agents.backend import BackendError, require_uuid
from yama_agents.coordinator import AgentId, AuthorizationError, Coordinator, StateError, load_profile
from yama_agents.fixture_model import utf16_length, validate_proposals


WEB_TOOLS = {"search_public_web", "fetch_public_page"}
BACKGROUND_TOOLS = WEB_TOOLS | {"propose_draft_assertions", "find_similar_cases", "explain_connection",
                    "prepare_incident_summary", "prepare_evidence_manifest", "lookup_verified_assistance",
                    "find_reporting_options", "propose_next_actions", "prepare_email"}
READ_TOOLS = {"read_own_account", "read_authorized_evidence"}


def confirmed_revision(snapshot):
    confirmation = snapshot.get("confirmation")
    if confirmation is None:
        return None
    if (not isinstance(confirmation, dict) or confirmation.get("kind") != "user_confirmed"
            or type(confirmation.get("revision")) is not int or confirmation["revision"] != snapshot["revision"]):
        raise BackendError("invalid_backend_response")
    return confirmation["revision"]


def validate_snapshot(snapshot, report_id):
    if (not isinstance(snapshot, dict) or snapshot.get("_id") != report_id or snapshot.get("synthetic") is not True
            or snapshot.get("language") not in {"en", "hi", "hinglish"}
            or type(snapshot.get("revision")) is not int or snapshot["revision"] < 1
            or not isinstance(snapshot.get("messages"), list) or not 1 <= len(snapshot["messages"]) <= 50
            or not isinstance(snapshot.get("assertions"), list) or len(snapshot["assertions"]) > 100):
        raise BackendError("invalid_backend_response")
    try:
        for message in snapshot["messages"]:
            require_uuid(message["id"])
            if not isinstance(message["text"], str) or not 1 <= utf16_length(message["text"]) <= 6000:
                raise ValueError
        confirmed_revision(snapshot)
    except (KeyError, ValueError, TypeError):
        raise BackendError("invalid_backend_response") from None


class ToolDispatcher:
    max_tasks = 32
    timeout_seconds = 20

    def __init__(self, backend, report_id, model, snapshot):
        self._backend = backend
        self.report_id = report_id
        self.model = model
        self.coordinator = Coordinator(revision=snapshot["revision"], confirmed_revision=confirmed_revision(snapshot))
        self._jobs = {}
        self._payloads = {}
        self._executing = set()
        self._arguments_by_task = {}
        self._web_ids = {}

    @classmethod
    async def bind(cls, backend, report_id, model):
        require_uuid(report_id)
        snapshot = await backend.get_report(report_id)
        validate_snapshot(snapshot, report_id)
        return cls(backend, report_id, model, snapshot)

    def available_tools(self, agent):
        connected = BACKGROUND_TOOLS | READ_TOOLS
        return tuple(tool for tool in load_profile(AgentId(agent)).tools if tool in connected)

    async def _refresh(self):
        snapshot = await self._backend.get_report(self.report_id)
        validate_snapshot(snapshot, self.report_id)
        self.coordinator.synchronize_report(snapshot["revision"], confirmed_revision(snapshot))
        for task_id, (lease, _, _) in self._jobs.items():
            if self.coordinator.task_state(lease).status != "ready":
                self._payloads.pop(task_id, None)
        return snapshot

    @staticmethod
    def _arguments(tool, arguments):
        if not isinstance(arguments, dict):
            raise ValueError("Tool arguments must be an object")
        required = {"evidenceId"} if tool == "read_authorized_evidence" else set()
        if tool == "search_public_web":
            required = {"topic", "reason"}
        elif tool == "fetch_public_page":
            required = {"searchId", "sourceId"}
        if set(arguments) != required:
            raise ValueError("Unexpected tool arguments")
        if tool == "read_authorized_evidence":
            require_uuid(arguments["evidenceId"])
        elif tool == "fetch_public_page":
            require_uuid(arguments["searchId"])
            require_uuid(arguments["sourceId"])
        elif tool == "search_public_web":
            if (arguments["topic"] not in {"cyber_reporting", "consumer_reporting", "cyber_safety"}
                    or arguments["reason"] not in {"public_source_requested", "freshness_requested"}):
                raise ValueError("Unsupported public lookup topic or reason")

    async def read(self, output, tool, arguments):
        if tool not in READ_TOOLS:
            raise AuthorizationError("Tool is not connected as a foreground read")
        self._arguments(tool, arguments)
        self.coordinator.authorize_tool(output, tool)
        async with asyncio.timeout(self.timeout_seconds):
            snapshot = await self._refresh()
            self.coordinator.authorize_tool(output, tool)
            payload = snapshot if tool == "read_own_account" else await self._backend.evidence_source(self.report_id, arguments["evidenceId"])
            await self._refresh()
            if tool == "read_authorized_evidence":
                # File archival need not increment the report revision. A second
                # scoped source read checks visibility and integrity at delivery.
                payload = await self._backend.evidence_source(self.report_id, arguments["evidenceId"])
                await self._refresh()
            self.coordinator.authorize_tool(output, tool)
            return deepcopy(payload)

    async def start(self, output, worker, tool, arguments):
        worker = AgentId(worker)
        if tool not in self.available_tools(worker) or tool not in BACKGROUND_TOOLS:
            raise AuthorizationError("Tool is unavailable for this role")
        self._arguments(tool, arguments)
        self.coordinator.authorize_tool(output, "delegate_task")
        if len(self._jobs) >= self.max_tasks:
            raise StateError("Session task limit reached")
        async with asyncio.timeout(self.timeout_seconds):
            await self._refresh()
        # Refresh may invalidate the requesting generation. The coordinator checks
        # it again, plus the worker's role and backend-resolved confirmation.
        task = self.coordinator.start_task(output, worker, tool)
        metadata = deepcopy(self.model.metadata) if tool == "propose_draft_assertions" else {"provider": "local", "version": "1", "live": False}
        self._jobs[task.task_id] = (task, self.model, metadata)
        self._arguments_by_task[task.task_id] = deepcopy(arguments)
        return task

    def receipt(self, task):
        state = self.coordinator.task_state(task)
        return {"taskId": task.task_id, "agent": task.agent.value, "tool": task.tool,
                "reportId": self.report_id, "revision": task.revision, "status": state.status,
                "errorCode": state.error_code, "adapter": deepcopy(self._jobs[task.task_id][2])}

    async def _assistance(self, language):
        guidance = await self._backend.assistance(language)
        if (not isinstance(guidance, dict) or guidance.get("jurisdiction") != "IN" or guidance.get("free") is not True
                or guidance.get("language") != language or not isinstance(guidance.get("options"), list)):
            raise BackendError("invalid_backend_response")
        return guidance

    async def _actions(self, snapshot):
        draft = await self._backend.actions(self.report_id)
        if (not isinstance(draft, dict) or draft.get("reportId") != self.report_id or draft.get("revision") != snapshot["revision"]
                or draft.get("recipe") != "private-actions-v1" or draft.get("submitted") is not False):
            raise BackendError("invalid_backend_response")
        return {"guidance": await self._assistance(snapshot["language"]), "draft": draft}

    async def _work(self, task, snapshot):
        if task.tool == "prepare_email":
            return await self._notification(snapshot)
        if task.tool in WEB_TOOLS:
            return await self._public_lookup(task, snapshot)
        if task.tool in {"lookup_verified_assistance", "find_reporting_options"}:
            return await self._assistance(snapshot["language"])
        if task.tool == "propose_next_actions":
            return await self._actions(snapshot)
        if task.tool == "propose_draft_assertions":
            if len(snapshot["messages"]) > 8 or sum(utf16_length(message["text"]) for message in snapshot["messages"]) > 12000:
                raise BackendError("context_limit")
            try:
                profile = replace(load_profile(task.agent), tools=self.available_tools(task.agent))
                proposed = await self._jobs[task.task_id][1].propose(profile, deepcopy(snapshot))
            except asyncio.CancelledError:
                raise
            except BackendError as error:
                # Adapters may report only these public codes, never upstream text.
                if error.code in {"model_unavailable", "model_refused", "model_incomplete", "model_mismatch", "invalid_model_output", "tool_timeout", "context_limit", "provider_not_configured"}:
                    raise
                raise BackendError("model_unavailable") from None
            except Exception:
                raise BackendError("model_unavailable") from None
            try:
                return validate_proposals(proposed, snapshot)
            except (ValueError, TypeError, KeyError):
                raise BackendError("invalid_model_output") from None
        if task.tool in {"find_similar_cases", "explain_connection"}:
            connections = await self._backend.connections(self.report_id)
            if (connections.get("reportId") != self.report_id or connections.get("revision") != task.revision
                    or not isinstance(connections.get("candidates"), list)):
                raise BackendError("invalid_backend_response")
            if connections.get("status") == "pending":
                raise BackendError("projection_pending")
            if connections.get("status") != "ready":
                raise BackendError("invalid_backend_response")
            if task.tool == "explain_connection" and (connections.get("recipe") != "confirmed-pattern-sources-v1" or not isinstance(connections.get("sources"), list)):
                raise BackendError("invalid_backend_response")
            return connections
        if task.tool == "prepare_evidence_manifest":
            files = await self._backend.list_evidence(self.report_id)
            return {"files": self._manifest(files),
                    "revision": task.revision, "submitted": False}
        return {"reportId": self.report_id, "revision": task.revision, "language": snapshot["language"],
                "confirmation": "user_confirmed" if confirmed_revision(snapshot) else "unconfirmed",
                "assertions": [{key: assertion[key] for key in ("id", "field", "value", "originalValue", "polarity", "source")}
                               for assertion in snapshot["assertions"] if assertion["included"]],
                "omittedAssertionIds": [assertion["id"] for assertion in snapshot["assertions"] if not assertion["included"]],
                "verification": "not_independently_verified", "submitted": False}

    @staticmethod
    def _manifest(files):
        if not isinstance(files, list) or len(files) > 20:
            raise BackendError("invalid_backend_response")
        return [{key: file[key] for key in ("id", "name", "size", "sha256", "status", "reviewed")} for file in files]

    async def _notification(self, snapshot):
        preview = await self._backend.notification_preview(self.report_id)
        if (not isinstance(preview, dict) or preview.get("reportId") != self.report_id
                or preview.get("revision") != snapshot["revision"] or preview.get("template") != "workspace-link-v1"
                or preview.get("language") != snapshot["language"] or preview.get("deliveryConfirmed") is not False
                or preview.get("provider") not in {"fixture", "resend", "gmail"}
                or preview.get("status") not in {"draft", "queued", "dispatching", "captured", "accepted", "failed", "delivery_unknown", "canceled", "stale", "expired"}):
            raise BackendError("invalid_backend_response")
        try:
            require_uuid(preview["id"])
            require_uuid(preview["recipient"]["id"])
            if preview["recipient"]["verification"] not in {"fixture", "operator_confirmed_synthetic"}:
                raise ValueError
            for field, limit in (("subject", 200), ("text", 4000), ("html", 8000)):
                if not isinstance(preview["content"][field], str) or not 1 <= utf16_length(preview["content"][field]) <= limit:
                    raise ValueError
        except (ValueError, KeyError, TypeError):
            raise BackendError("invalid_backend_response") from None
        return preview

    def _validate_public_job(self, task, job):
        if (not isinstance(job, dict) or job.get("reportId") != self.report_id
                or job.get("revision") != task.revision or job.get("operation") != task.tool
                or job.get("agent") != task.agent.value
                or job.get("status") not in {"queued", "running", "ready", "failed", "canceled", "stale"}):
            raise BackendError("invalid_backend_response")
        try:
            require_uuid(job["id"])
        except (KeyError, ValueError):
            raise BackendError("invalid_backend_response") from None
        adapter = job.get("adapter")
        allowed = {( "fixture", "public-web-fixture-v1", False),
                   ("exa", "exa-js@2.25.0", True)} if task.tool == "search_public_web" else {
                   ("fixture", "public-web-fixture-v1", False), ("firecrawl", "firecrawl@4.46.0", True)}
        if not isinstance(adapter, dict) or type(adapter.get("live")) is not bool or (adapter.get("provider"), adapter.get("version"), adapter["live"]) not in allowed:
            raise BackendError("invalid_backend_response")
        if job["status"] == "ready":
            payload = job.get("result")
            expected = "search" if task.tool == "search_public_web" else "page"
            if not isinstance(payload, dict) or payload.get("kind") != expected:
                raise BackendError("invalid_backend_response")
            if expected == "search" and (not isinstance(payload.get("sources"), list) or len(payload["sources"]) > 3):
                raise BackendError("invalid_backend_response")
            if expected == "page" and (payload.get("contentIsUntrusted") is not True
                    or payload.get("verification") not in {"unverified_public_source", "authored_fixture"}
                    or not isinstance(payload.get("text"), str) or not 1 <= utf16_length(payload["text"]) <= 8000):
                raise BackendError("invalid_backend_response")
        return job

    async def _public_lookup(self, task, snapshot):
        # An empty local result is never an implicit authorization to search.
        await self._assistance(snapshot["language"])
        if task.agent == AgentId.DRISHTI and confirmed_revision(snapshot):
            await self._backend.connections(self.report_id)
        await self._refresh()
        if self.coordinator.task_state(task).status != "running":
            raise BackendError("revision_conflict")
        command = {"operation": task.tool, "expectedRevision": task.revision,
                   "agent": task.agent.value, "key": str(UUID(task.task_id)), **self._arguments_by_task[task.task_id]}
        job = self._validate_public_job(task, await self._backend.start_public_web(self.report_id, command))
        self._web_ids[task.task_id] = job["id"]
        while job["status"] in {"queued", "running"}:
            await self._refresh()
            if self.coordinator.task_state(task).status != "running":
                raise BackendError("revision_conflict")
            await asyncio.sleep(.15)
            job = self._validate_public_job(task, await self._backend.public_web(self.report_id, job["id"]))
        if job["status"] != "ready":
            # Public codes originate from our service; never forward provider text.
            raise BackendError("public_lookup_unavailable")
        self._jobs[task.task_id] = (task, self.model, deepcopy(job["adapter"]))
        return job["result"]

    async def _cancel_public_job(self, task):
        if task.task_id in self._web_ids:
            try:
                async with asyncio.timeout(2):
                    await self._backend.cancel_public_web(self.report_id, self._web_ids[task.task_id])
            except (Exception, asyncio.CancelledError):
                # The server's lease and expiry still bound an unreachable job.
                pass

    async def execute(self, task):
        state = self.coordinator.task_state(task)
        if task.task_id not in self._jobs:
            raise AuthorizationError("Task was not accepted by this dispatcher")
        if state.status != "running":
            return self.receipt(task)
        if task.task_id in self._executing:
            raise StateError("Task is already executing")
        self._executing.add(task.task_id)
        try:
            async with asyncio.timeout(self.timeout_seconds) as deadline:
                snapshot = await self._refresh()
                if self.coordinator.task_state(task).status != "running":
                    return self.receipt(task)
                payload = await self._work(task, snapshot)
                await self._refresh()
                # A provider adapter may suppress cancellation. Its late return
                # still cannot create a deliverable result after our deadline.
                if deadline.expired():
                    raise TimeoutError
                if asyncio.current_task().cancelling():
                    raise asyncio.CancelledError
                if self.coordinator.complete_task(task, result_ref="task:" + task.task_id):
                    self._payloads[task.task_id] = deepcopy(payload)
        except asyncio.CancelledError:
            self.cancel(task)
            raise
        except TimeoutError:
            self.coordinator.complete_task(task, error_code="tool_timeout")
        except BackendError as error:
            self.coordinator.complete_task(task, error_code=error.code)
        except Exception:
            self.coordinator.complete_task(task, error_code="tool_unavailable")
        finally:
            self._executing.discard(task.task_id)
            if task.tool in WEB_TOOLS and self.coordinator.task_state(task).status != "ready":
                await self._cancel_public_job(task)
        return self.receipt(task)

    def cancel(self, task):
        canceled = self.coordinator.cancel_task(task)
        self._payloads.pop(task.task_id, None)
        return canceled

    async def result(self, output, task):
        self.coordinator.authorize_tool(output, task.tool)
        self.coordinator.task_state(task)
        async with asyncio.timeout(self.timeout_seconds):
            snapshot = await self._refresh()
            if task.tool == "prepare_email" and task.task_id in self._payloads:
                if await self._notification(snapshot) != self._payloads[task.task_id]:
                    self.coordinator.stale_task(task)
                    self._payloads.pop(task.task_id, None)
                await self._refresh()
            if task.tool in WEB_TOOLS and task.task_id in self._payloads:
                job = self._validate_public_job(task, await self._backend.public_web(self.report_id, self._web_ids[task.task_id]))
                if job["status"] != "ready" or job["result"] != self._payloads[task.task_id]:
                    self.coordinator.stale_task(task)
                    self._payloads.pop(task.task_id, None)
                await self._refresh()
            if task.tool in {"lookup_verified_assistance", "find_reporting_options", "propose_next_actions"} and task.task_id in self._payloads:
                current = await self._actions(snapshot) if task.tool == "propose_next_actions" else await self._assistance(snapshot["language"])
                if current != self._payloads[task.task_id]:
                    self.coordinator.stale_task(task)
                    self._payloads.pop(task.task_id, None)
                await self._refresh()
            if task.tool in {"find_similar_cases", "explain_connection"} and task.task_id in self._payloads:
                current_comparison = await self._backend.connections(self.report_id)
                if current_comparison != self._payloads[task.task_id]:
                    self.coordinator.stale_task(task)
                    self._payloads.pop(task.task_id, None)
                await self._refresh()
            if task.tool == "prepare_evidence_manifest" and task.task_id in self._payloads:
                current_files = self._manifest(await self._backend.list_evidence(self.report_id))
                if current_files != self._payloads[task.task_id]["files"]:
                    self.coordinator.stale_task(task)
                    self._payloads.pop(task.task_id, None)
                await self._refresh()
        self.coordinator.authorize_tool(output, task.tool)
        if self.coordinator.task_state(task).status != "ready" or task.task_id not in self._payloads:
            raise StateError("Task has no current deliverable result")
        return deepcopy(self._payloads[task.task_id])
