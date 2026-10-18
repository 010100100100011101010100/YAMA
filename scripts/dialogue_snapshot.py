"""Private IPC with no database, cookies, filesystem tools or caller-selected skill paths."""
import asyncio
import json
import os
import sys
from yama_agents.backend import BackendError
from yama_agents.dialogue import FixtureDialogue, generate
from yama_agents.openai_model import OpenAIModel, ProviderConfig
from yama_agents.codex_model import CodexConfig, CodexModel
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
    elif adapter['provider'] == 'codex':
        model = CodexModel(CodexConfig.from_env(os.environ))
        if adapter != model.metadata:
            raise BackendError('provider_config_changed')
    elif adapter != {'provider': 'fixture', 'model': 'authored-incident-v1', 'version': '1', 'live': False}:
        raise BackendError('provider_config_changed')
    try:
        if bindings.get('stream') and adapter['live'] and bindings.get('operation', 'reply') == 'reply':
            model.on_text = lambda text: print(json.dumps({'type':'text','text':text},ensure_ascii=False), flush=True)
        if bindings.get('operation') == 'review':
            from yama_agents.candidate_review import review
            return {'review': await review(bindings['context'], model), 'adapter': adapter}
        return {'reply': await generate(bindings['context'], model), 'adapter': adapter}
    finally:
        monitor.flush()


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(128 * 1024 + 1)
        if len(raw) > 128 * 1024:
            raise ValueError
        bindings = json.loads(raw)
        if (not isinstance(bindings, dict) or not {'context', 'adapter'} <= set(bindings)
                or set(bindings) - {'context', 'adapter', 'operation', 'stream'} or bindings.get('operation', 'reply') not in {'reply', 'review'}
                or 'stream' in bindings and type(bindings['stream']) is not bool):
            raise ValueError
        print(json.dumps(asyncio.run(run(bindings)), ensure_ascii=False))
    except BackendError as error:
        print(json.dumps({'error': {'code': error.code}}))
    except Exception:
        print(json.dumps({'error': {'code': 'dialogue_failed'}}))
