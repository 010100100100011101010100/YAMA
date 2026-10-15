"""Private worker IPC: fixed Saathi extraction on a server-authorized snapshot.

No cookies, database credentials, role selector or mutation interface. A selected
OpenAI adapter has bounded network access; authored fixtures remain local.
The Node worker owns authorization/revision checks and durable claim state.
"""

import asyncio
import json
import os
import sys
from copy import deepcopy

from yama_agents.backend import BackendError
from yama_agents.coordinator import AgentId
from yama_agents.dispatcher import ToolDispatcher
from yama_agents.fixture_model import FixtureModel
from yama_agents.openai_model import OpenAIModel, ProviderConfig
from yama_agents.observability import MetadataMonitor


class SnapshotBackend:
    def __init__(self, snapshot):
        self.snapshot = deepcopy(snapshot)

    async def get_report(self, report_id):
        if report_id != self.snapshot["_id"]:
            raise BackendError("report_not_found")
        return deepcopy(self.snapshot)


async def extract(snapshot, adapter=None):
    adapter = adapter or FixtureModel.metadata
    monitor = MetadataMonitor()
    model = FixtureModel()
    if adapter.get("provider") == "openai":
        config = ProviderConfig.from_env(os.environ)
        monitor = MetadataMonitor.from_env(os.environ)
        model = OpenAIModel(config, monitor=monitor)
    if adapter != model.metadata:
        raise BackendError("provider_config_changed")
    try:
        dispatcher = await ToolDispatcher.bind(SnapshotBackend(snapshot), snapshot["_id"], model)
        output = dispatcher.coordinator.begin_output(AgentId.SAATHI)
        task = await dispatcher.start(output, AgentId.SAATHI, "propose_draft_assertions", {})
        receipt = await dispatcher.execute(task)
        return {"receipt": receipt, "preview": await dispatcher.result(output, task) if receipt["status"] == "ready" else None}
    finally:
        monitor.flush()


if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(4 * 1024 * 1024 + 1)
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError
        bindings = json.loads(raw)
        if not isinstance(bindings, dict) or set(bindings) not in ({"report"}, {"report", "adapter"}):
            raise ValueError
        print(json.dumps(asyncio.run(extract(bindings["report"], bindings.get("adapter"))), ensure_ascii=False))
    except Exception:
        print(json.dumps({"error": {"code": "extraction_failed"}}))
