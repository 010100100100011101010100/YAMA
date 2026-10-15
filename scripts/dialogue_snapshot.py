"""Private IPC with no database, cookies, filesystem tools or caller-selected skill paths."""
import asyncio
import json
import os
import sys
from yama_agents.backend import BackendError
from yama_agents.dialogue import FixtureDialogue, generate
from yama_agents.openai_model import OpenAIModel, ProviderConfig
from yama_agents.observability import MetadataMonitor


async def run(bindings):
    monitor = MetadataMonitor()
    model = FixtureDialogue()
    adapter = bindings['adapter']
    if adapter['provider'] == 'openai':
        model = OpenAIModel(ProviderConfig.from_env(os.environ), monitor=MetadataMonitor.from_env(os.environ))
        monitor = model.monitor
        if adapter != model.metadata:
            raise BackendError('provider_config_changed')
    elif adapter != {'provider': 'fixture', 'model': 'authored-incident-v1', 'version': '1', 'live': False}:
        raise BackendError('provider_config_changed')
    try:
        return {'reply': await generate(bindings['context'], model), 'adapter': adapter}
    finally:
        monitor.flush()


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(128 * 1024 + 1)
        if len(raw) > 128 * 1024:
            raise ValueError
        bindings = json.loads(raw)
        if not isinstance(bindings, dict) or set(bindings) != {'context', 'adapter'}:
            raise ValueError
        print(json.dumps(asyncio.run(run(bindings)), ensure_ascii=False))
    except BackendError as error:
        print(json.dumps({'error': {'code': error.code}}))
    except Exception:
        print(json.dumps({'error': {'code': 'dialogue_failed'}}))
