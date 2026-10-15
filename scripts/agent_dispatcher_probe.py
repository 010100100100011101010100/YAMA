"""Private test harness for read-only tools, not a public API or model endpoint.

Receive trusted runtime bindings as JSON over stdin so the session cookie never
appears in process arguments. Do not log stdin. Tests create and clean up their
own anonymous sessions; this module never signs in or changes a report.
"""

import asyncio
import json
import sys

from yama_agents.backend import BackendError, LocalBackend
from yama_agents.coordinator import AgentId, AuthorizationError, StateError
from yama_agents.dispatcher import ToolDispatcher
from yama_agents.fixture_model import FixtureModel


async def run_probe(bindings):
    mode = bindings["mode"]
    if mode not in {"extract", "summary", "manifest", "connections", "explanation", "evidence", "journey", "assistance", "actions", "reporting", "public_web", "notification"}:
        raise ValueError("Unknown probe mode")
    expected = {"origin", "cookie", "reportId", "mode"} | ({"evidenceId"} if mode == "evidence" else set())
    if set(bindings) != expected:
        raise ValueError("Unexpected runtime bindings")
    dispatcher = await ToolDispatcher.bind(LocalBackend(bindings["origin"], bindings["cookie"]), bindings["reportId"], FixtureModel())
    room = dispatcher.coordinator
    agent = AgentId.SAATHI if mode in {"extract", "evidence", "journey"} else AgentId.DRISHTI if mode in {"connections", "explanation"} else AgentId.DISHA
    room.select_agent(agent)
    output = room.begin_output(agent)
    if mode == "public_web":
        task = await dispatcher.start(output, agent, "search_public_web", {"topic": "consumer_reporting", "reason": "public_source_requested"})
        receipt = await dispatcher.execute(task)
        return {"receipt": receipt, "preview": await dispatcher.result(output, task) if receipt["status"] == "ready" else None}
    if mode == "evidence":
        source = await dispatcher.read(output, "read_authorized_evidence", {"evidenceId": bindings["evidenceId"]})
        return {"source": source}
    tool = {"extract": "propose_draft_assertions", "summary": "prepare_incident_summary",
            "manifest": "prepare_evidence_manifest", "connections": "find_similar_cases", "explanation": "explain_connection", "journey": "find_similar_cases",
            "assistance": "lookup_verified_assistance", "actions": "propose_next_actions", "reporting": "find_reporting_options", "notification": "prepare_email"}[mode]
    worker = AgentId.DRISHTI if mode == "journey" else agent
    task = await dispatcher.start(output, worker, tool, {})
    if mode != "journey":
        receipt = await dispatcher.execute(task)
        return {"receipt": receipt, "preview": await dispatcher.result(output, task) if receipt["status"] == "ready" else None}

    # Synthetic delivery acknowledgements exercise the real coordinator; they
    # do not claim browser delivery, generated dialogue or actual audio playout.
    room.request_handoff(output, AgentId.DISHA, "next_actions")
    room.complete_output(output)
    disha = room.begin_output(AgentId.DISHA)
    summary_task = await dispatcher.start(disha, AgentId.DISHA, "prepare_incident_summary", {})
    summary_receipt = await dispatcher.execute(summary_task)
    summary = await dispatcher.result(disha, summary_task)
    search_receipt = await dispatcher.execute(task)
    if search_receipt["status"] != "ready":
        return {"search": search_receipt, "summary": summary, "finalAgent": room.active_agent.value}
    room.request_handoff(disha, AgentId.DRISHTI, "connection_ready", task=task)
    before_delivery = room.active_agent.value
    room.complete_output(disha)
    drishti = room.begin_output(AgentId.DRISHTI)
    comparison = await dispatcher.result(drishti, task)
    return {"search": search_receipt, "summaryReceipt": summary_receipt, "summary": summary,
            "comparison": comparison, "beforeDelivery": before_delivery, "finalAgent": room.active_agent.value,
            "verification": "scripted delivery acknowledgements; real authenticated backend reads"}


if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise ValueError("Runtime bindings too large")
        print(json.dumps(asyncio.run(run_probe(json.loads(raw))), ensure_ascii=False))
    except BackendError as error:
        print(json.dumps({"error": {"code": error.code}}))
    except AuthorizationError:
        print(json.dumps({"error": {"code": "tool_not_authorized"}}))
    except (StateError, ValueError, KeyError, TypeError):
        print(json.dumps({"error": {"code": "invalid_runtime_binding"}}))
    except Exception:
        print(json.dumps({"error": {"code": "probe_unavailable"}}))
