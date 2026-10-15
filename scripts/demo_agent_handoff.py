"""Exercise the real coordinator with a synthetic, scripted conversation."""

import argparse
import json
from dataclasses import asdict

from yama_agents.coordinator import AgentId, Coordinator, Mode


def run_demo(mode: Mode):
    room = Coordinator(mode=mode)
    transcript = []
    room.begin_user_turn()
    room.confirm_report(room.revision)  # Simulated explicit approval of a fixture.
    room.end_user_turn()

    saathi = room.begin_output(AgentId.SAATHI)
    search = room.start_task(saathi, AgentId.DRISHTI, "find_similar_cases")
    transcript.append({"agent": "Saathi", "text": (
        "Drishti is checking for similar cases. Disha can help you organise next steps while that runs."
    )})
    room.request_handoff(saathi, AgentId.DISHA, "next_actions")
    room.complete_output(saathi)  # Simulate final text delivery / audio playout.

    disha = room.begin_output(AgentId.DISHA)
    transcript.append({"agent": "Disha", "text": (
        "I'm Disha. We can organise your evidence and reporting options while that runs."
    )})
    room.complete_task(search, result_ref="fixture:synthetic-comparison-1")
    assert room.active_agent == AgentId.DISHA
    assert room.accepts_output(disha)  # A ready search must not seize the turn.
    transcript.append({"agent": "Disha", "text": "Drishti has a possible connection to explain."})
    room.request_handoff(disha, AgentId.DRISHTI, "connection_ready", task=search)
    room.complete_output(disha)

    drishti = room.begin_output(AgentId.DRISHTI)
    transcript.append({"agent": "Drishti", "text": (
        "I'm Drishti. The two synthetic incidents share a payment-request sequence, "
        "but their locations differ. This does not establish the same person."
    )})
    room.complete_output(drishti)
    return {
        "environment": "offline synthetic fixture; no microphone, audio playback, model or graph calls",
        "mode": mode.value,
        "transcript": transcript,
        "events": [asdict(event) for event in room.events],
        "final_agent": room.active_agent.value,
        "search_status": room.task_state(search).status,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=[mode.value for mode in Mode], default="text")
    arguments = parser.parse_args()
    print(json.dumps(run_demo(Mode(arguments.mode)), ensure_ascii=False, indent=2))
