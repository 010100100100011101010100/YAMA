"""Single-session turn and capability policy; no provider calls or domain tools.

Call serially from the future worker's event loop. All identities and callbacks
must come from trusted server bindings, never client/model-supplied role names.
"""

import json
from dataclasses import dataclass, replace
from enum import Enum
from pathlib import Path
from uuid import uuid4


AGENTS_DIRECTORY = Path(__file__).resolve().parents[1] / "agents"
HANDOFF_REASONS = {"clarification", "similar_cases", "next_actions", "connection_ready", "user_goal"}


class AgentId(str, Enum):
    SAATHI = "saathi"
    DRISHTI = "drishti"
    DISHA = "disha"


class Mode(str, Enum):
    TEXT = "text"
    VOICE = "voice"


class AuthorizationError(PermissionError):
    """The caller lacks a current turn or the required capability."""


class StateError(RuntimeError):
    """The requested transition cannot occur in the current state."""


@dataclass(frozen=True)
class AgentProfile:
    agent: AgentId
    name: str
    purpose: str
    instructions: str
    tools: tuple[str, ...]
    speaker: str | None


def _registry() -> dict:
    registry = json.loads((AGENTS_DIRECTORY / "capabilities.json").read_text(encoding="utf-8"))
    if registry["schema_version"] != 1:
        raise ValueError("Unsupported capability registry version")
    return registry


def load_profile(agent: AgentId) -> AgentProfile:
    agent = AgentId(agent)
    registry = _registry()
    role = registry["agents"][agent.value]
    # Role paths are fixed by the enum, never taken from user input.
    if role["skill"] != f"{agent.value}/SKILL.md":
        raise ValueError("Role skill path must match the registered agent")
    skill = (AGENTS_DIRECTORY / agent.value / "SKILL.md").read_text(encoding="utf-8")
    shared = (AGENTS_DIRECTORY / "shared-policy.md").read_text(encoding="utf-8")
    instructions = shared + "\n\n" + skill.split("\n---\n", 1)[1].strip()
    tools = tuple(registry["shared_tools"] + role["tools"])
    if any(tool not in registry["tools"] for tool in tools):
        raise ValueError("Profile references an undefined tool")
    return AgentProfile(agent, role["name"], role["purpose"], instructions, tools, role["speaker"])


@dataclass(frozen=True)
class OutputLease:
    output_id: str
    agent: AgentId
    epoch: int
    revision: int
    mode: Mode


@dataclass(frozen=True)
class TaskLease:
    task_id: str
    agent: AgentId
    tool: str
    revision: int


@dataclass(frozen=True)
class TaskState:
    lease: TaskLease
    status: str = "running"
    result_ref: str | None = None
    error_code: str | None = None


@dataclass(frozen=True)
class Handoff:
    target: AgentId
    reason: str
    task: TaskLease | None = None


@dataclass(frozen=True)
class Event:
    kind: str
    agent: AgentId
    epoch: int
    revision: int
    mode: Mode
    reference: str | None = None
    target: AgentId | None = None


class Coordinator:
    """One foreground agent with revision-bound background task receipts.

    Leases identify authorized generation/task callbacks, not authentication.
    This in-memory foundation does not store transcripts or execute tools.
    """

    def __init__(self, mode: Mode = Mode.TEXT, *, revision: int = 1,
                 confirmed_revision: int | None = None):
        self._mode = Mode(mode)
        self._active_agent = AgentId.SAATHI
        self._validate_report_state(revision, confirmed_revision)
        self._revision = revision
        self._confirmed_revision = confirmed_revision
        self._epoch = 0
        self._output = None
        self._pending_handoff = None
        self._user_speaking = False
        self._auto_handoffs = True
        self._handoff_count = 0
        self._tasks = {}
        self._events = []
        self._profiles = {agent: load_profile(agent) for agent in AgentId}
        self._tool_policy = _registry()["tools"]

    @property
    def active_agent(self) -> AgentId:
        return self._active_agent

    @property
    def mode(self) -> Mode:
        return self._mode

    @property
    def revision(self) -> int:
        return self._revision

    @property
    def confirmed_revision(self) -> int | None:
        return self._confirmed_revision

    @property
    def events(self) -> tuple[Event, ...]:
        return tuple(self._events)

    def _emit(self, kind, reference=None, target=None):
        self._events.append(Event(kind, self._active_agent, self._epoch,
                                  self._revision, self._mode, reference, target))

    def _invalidate_output(self):
        self._epoch += 1
        if self._output is not None:
            self._emit("output_cancelled", self._output.output_id)
        self._output = None
        if self._pending_handoff is not None:
            self._emit("handoff_cancelled", target=self._pending_handoff.target)
        self._pending_handoff = None

    def begin_output(self, agent: AgentId) -> OutputLease:
        agent = AgentId(agent)
        if agent != self._active_agent:
            raise AuthorizationError("Only the foreground agent can speak")
        if self._output is not None or self._user_speaking:
            raise StateError("A speaker already owns the turn")
        self._output = OutputLease(uuid4().hex, agent, self._epoch, self._revision, self._mode)
        self._emit("output_started", self._output.output_id)
        return self._output

    def accepts_output(self, lease: OutputLease) -> bool:
        return self._output is not None and lease == self._output

    def _require_output(self, lease):
        if not self.accepts_output(lease):
            raise AuthorizationError("Expired or foreign generation")

    def complete_output(self, lease: OutputLease) -> bool:
        """Call after final text delivery or acknowledged audio playout."""
        if not self.accepts_output(lease):
            return False
        self._emit("output_completed", lease.output_id)
        self._output = None
        handoff = self._pending_handoff
        self._pending_handoff = None
        if handoff is not None:
            if handoff.task is not None and self.task_state(handoff.task).status != "ready":
                self._emit("handoff_cancelled", target=handoff.target)
            else:
                self._handoff_count += 1
                self._change_agent(handoff.target)
        return True

    def _change_agent(self, target):
        self._epoch += 1
        self._emit("agent_changed", target=target)
        self._active_agent = target

    def begin_user_turn(self):
        self._invalidate_output()
        self._user_speaking = True
        self._handoff_count = 0
        self._emit("user_turn_started")

    def end_user_turn(self):
        self._user_speaking = False
        self._emit("user_turn_completed")

    def select_agent(self, agent: AgentId):
        agent = AgentId(agent)
        self._invalidate_output()
        self._handoff_count = 0
        if agent != self._active_agent:
            self._change_agent(agent)

    def set_mode(self, mode: Mode):
        mode = Mode(mode)
        if mode != self._mode:
            self._invalidate_output()
            self._user_speaking = False
            self._mode = mode
            self._emit("mode_changed")

    def set_auto_handoffs(self, enabled: bool):
        if not isinstance(enabled, bool):
            raise ValueError("Automatic handoff preference must be boolean")
        self._auto_handoffs = enabled
        if not enabled and self._pending_handoff is not None:
            self._emit("handoff_cancelled", target=self._pending_handoff.target)
            self._pending_handoff = None

    def _authorize_role_tool(self, agent, tool):
        if tool not in self._profiles[agent].tools:
            raise AuthorizationError("Tool is not available to this role")
        policy = self._tool_policy[tool]
        if policy["requires_confirmation"] and self._confirmed_revision != self._revision:
            raise AuthorizationError("Current account revision must be confirmed")
        return policy

    def authorize_tool(self, lease: OutputLease, tool: str):
        """Permission check only; adapter must additionally enforce ACLs/schema."""
        self._require_output(lease)
        self._authorize_role_tool(lease.agent, tool)

    def request_handoff(self, lease, target, reason, task=None):
        self.authorize_tool(lease, "request_handoff")
        target = AgentId(target)
        if not self._auto_handoffs or self._handoff_count >= 3:
            raise StateError("Return control to the user before another automatic handoff")
        if target == self._active_agent or self._pending_handoff is not None:
            raise StateError("Self or competing handoff")
        if reason not in HANDOFF_REASONS:
            raise ValueError("Unknown handoff reason")
        if reason == "connection_ready" and task is None:
            raise StateError("A ready connection task is required")
        if reason == "connection_ready" and (task.agent != AgentId.DRISHTI or task.tool not in
                {"find_similar_cases", "query_connection_paths", "compare_entities", "explain_connection"}):
            raise StateError("Connection-ready handoff requires Drishti's connection work")
        if task is not None:
            state = self.task_state(task)
            if state.status != "ready" or task.agent != target:
                raise StateError("Handoff task must be ready and belong to the target")
        self._pending_handoff = Handoff(target, reason, task)
        self._emit("handoff_requested", lease.output_id, target)

    def confirm_report(self, revision: int):
        """Trusted, explicit user-action boundary; never registered as an LLM tool."""
        if revision != self._revision:
            raise StateError("Cannot confirm an outdated account")
        self._confirmed_revision = revision
        self._emit("report_confirmed")

    @staticmethod
    def _validate_report_state(revision, confirmed_revision):
        if type(revision) is not int or revision < 1:
            raise ValueError("Report revision must be a positive integer")
        if confirmed_revision is not None and (type(confirmed_revision) is not int
                                              or confirmed_revision != revision):
            raise ValueError("Confirmation must belong to the current revision")

    def synchronize_report(self, revision: int, confirmed_revision: int | None):
        """Trusted backend snapshot only; never a model-callable tool.

        A session can attach to an existing revision without replaying its edits.
        Later reads revoke old work if another tab changes that revision.
        """
        self._validate_report_state(revision, confirmed_revision)
        if revision < self._revision:
            raise StateError("Backend report revision moved backwards")
        changed = revision != self._revision
        revoked = self._confirmed_revision is not None and confirmed_revision is None
        self._revision = revision
        self._confirmed_revision = confirmed_revision
        if changed or revoked:
            self._invalidate_output()
            for task_id, state in self._tasks.items():
                if state.status in {"running", "ready"}:
                    self._tasks[task_id] = replace(state, status="stale", result_ref=None)
                    self._emit("task_stale", task_id, state.lease.agent)
            self._emit("report_synchronized")

    def edit_report(self):
        self._revision += 1
        self._confirmed_revision = None
        self._invalidate_output()
        for task_id, state in self._tasks.items():
            if state.status in {"running", "ready"}:
                self._tasks[task_id] = replace(state, status="stale", result_ref=None)
                self._emit("task_stale", task_id, state.lease.agent)
        self._emit("report_edited")

    def start_task(self, requester: OutputLease, worker: AgentId, tool: str) -> TaskLease:
        """Create a background work receipt; the adapter actually starts the job."""
        self.authorize_tool(requester, "delegate_task")
        worker = AgentId(worker)
        policy = self._authorize_role_tool(worker, tool)
        if not policy["background"]:
            raise AuthorizationError("Conversational controls cannot run as background work")
        lease = TaskLease(uuid4().hex, worker, tool, self._revision)
        self._tasks[lease.task_id] = TaskState(lease)
        self._emit("task_started", lease.task_id, worker)
        return lease

    def task_state(self, lease: TaskLease) -> TaskState:
        state = self._tasks.get(lease.task_id)
        if state is None or state.lease != lease:
            raise AuthorizationError("Unknown or foreign task")
        return state

    def complete_task(self, lease, *, result_ref=None, error_code=None) -> bool:
        state = self.task_state(lease)
        if state.status != "running" or lease.revision != self._revision:
            return False
        if bool(result_ref) == bool(error_code):
            raise ValueError("Provide exactly one non-empty result reference or error code")
        status = "ready" if result_ref else "failed"
        self._tasks[lease.task_id] = replace(state, status=status,
                                             result_ref=result_ref, error_code=error_code)
        self._emit("task_" + status, lease.task_id, lease.agent)
        return True

    def cancel_task(self, lease: TaskLease) -> bool:
        state = self.task_state(lease)
        if state.status not in {"running", "ready"}:
            return False
        self._tasks[lease.task_id] = replace(state, status="cancelled", result_ref=None)
        self._emit("task_cancelled", lease.task_id, lease.agent)
        return True

    def stale_task(self, lease: TaskLease) -> bool:
        """Trusted adapter invalidation when a referenced file changes."""
        state = self.task_state(lease)
        if state.status not in {"running", "ready"}:
            return False
        self._tasks[lease.task_id] = replace(state, status="stale", result_ref=None)
        self._emit("task_stale", lease.task_id, lease.agent)
        return True
