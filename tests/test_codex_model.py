"""Local Codex provider contracts; fake executables never contact a model service."""

import asyncio
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from yama_agents.backend import BackendError
from yama_agents.coordinator import AgentId, load_profile
from yama_agents.dialogue import generate
from yama_agents.codex_model import CodexConfig, CodexModel, CodexTransport, sanitized_environment
from test_agent_dispatcher import FakeBackend, report
from test_dialogue import bindings
from yama_agents.dispatcher import ToolDispatcher


def environment(binary='/usr/bin/true', **changes):
    return {'YAMA_DEMO_ONLY': 'true', 'YAMA_TEXT_PROVIDER': 'codex',
            'YAMA_CODEX_ENABLED': 'true', 'YAMA_CODEX_BINARY': binary, **changes}


class CodexModelTests(unittest.IsolatedAsyncioTestCase):
    def model(self, payload):
        transport = AsyncMock(return_value=payload)
        return CodexModel(CodexConfig.from_env(environment()), transport=transport), transport

    async def test_all_roles_use_existing_schema_and_only_authorized_context(self):
        for agent in AgentId:
            model, transport = self.model({'text': 'A bounded synthetic reply.', 'handoff': None, 'question': None})
            await generate(bindings(agent.value, automatic=False), model)
            request = transport.call_args.args[0]
            self.assertEqual(request['schema']['required'], ['text', 'handoff', 'question'])
            self.assertIn(agent.value.capitalize(), request['instructions'])
            self.assertIn('Prior generated replies are not evidence', request['instructions'])
            self.assertEqual(json.loads(request['input'])['agent'], agent.value)
            self.assertEqual(model.metadata, {'provider': 'codex', 'model': 'codex-session', 'version': '1', 'live': True})

    async def test_extraction_retains_source_validation_and_role_gate(self):
        model, transport = self.model({'proposals': []})
        snapshot = report(); snapshot['ownerId'] = 'PRIVATE_OWNER'; snapshot['files'] = ['PRIVATE_FILE']
        self.assertEqual(await model.propose(load_profile(AgentId.SAATHI), snapshot), {'proposals': []})
        request = transport.call_args.args[0]
        self.assertNotIn('PRIVATE', json.dumps(request))
        self.assertIn('UTF-16', request['instructions'])
        with self.assertRaises(BackendError):
            await model.propose(load_profile(AgentId.DRISHTI), snapshot)
        transport.return_value = {'proposals': [{'field': 'amount', 'value': 'invented', 'polarity': 'affirmed',
            'quote': snapshot['messages'][0]['text'], 'source': {'messageId': snapshot['messages'][0]['id'],
            'start': 0, 'end': len(snapshot['messages'][0]['text'])}}]}
        dispatcher = await ToolDispatcher.bind(FakeBackend(snapshot), snapshot['_id'], model)
        lease = dispatcher.coordinator.begin_output(AgentId.SAATHI)
        task = await dispatcher.start(lease, AgentId.SAATHI, 'propose_draft_assertions', {})
        self.assertEqual((await dispatcher.execute(task))['errorCode'], 'invalid_model_output')

    async def test_dialogue_accepts_the_full_provider_schema_with_a_question(self):
        question = {'kind': 'choice', 'prompt': 'Has the bank replied?', 'options': ['Yes', 'Not yet', 'I’m not sure'], 'placeholder': None}
        model, _ = self.model({'text': 'We can start with the bank’s last update.', 'handoff': None, 'question': question})
        reply = await generate(bindings(automatic=False), model)
        self.assertEqual(reply['question'], question)

    async def test_invalid_keys_and_handoff_cycles_still_fail_closed(self):
        for payload in ({'text': 'hello', 'handoff': None, 'confirm': True},
                        {'text': 'hello', 'handoff': {'target': 'saathi', 'reason': 'user_goal'}}):
            model, _ = self.model(payload)
            with self.assertRaises(BackendError): await generate(bindings(), model)

    def test_config_is_opt_in_local_only_and_bounded(self):
        for changes in ({'YAMA_DEMO_ONLY': 'false'}, {'YAMA_CODEX_ENABLED': 'false'},
                        {'YAMA_TEXT_PROVIDER': 'openai'}, {'YAMA_CODEX_BINARY': './codex'},
                        {'YAMA_CODEX_TIMEOUT_SECONDS': '9999'}, {'YAMA_CODEX_TIMEOUT_SECONDS': '0'}):
            with self.assertRaises(BackendError): CodexConfig.from_env(environment(**changes))
        with patch('yama_agents.codex_model.shutil.which', return_value='/usr/bin/true'):
            self.assertEqual(CodexConfig.from_env(environment(binary='codex')).binary, '/usr/bin/true')

    def test_environment_never_forwards_app_secrets_or_auth_overrides(self):
        filtered = sanitized_environment({'HOME': '/test/home', 'CODEX_HOME': '/test/home/.codex',
            'OPENAI_API_KEY': 'PRIVATE', 'CODEX_API_KEY': 'PRIVATE', 'CODEX_ACCESS_TOKEN': 'PRIVATE',
            'MONGODB_URI': 'PRIVATE', 'FALKORDB_PASSWORD': 'PRIVATE', 'PATH': '/evil', 'PYTHONPATH': '/evil',
            'HTTP_PROXY': 'PRIVATE', 'YAMA_CODEX_BINARY': '/evil'})
        self.assertNotIn('PRIVATE', json.dumps(filtered))
        self.assertEqual(filtered['CODEX_HOME'], '/test/home/.codex')
        self.assertNotIn('/evil', json.dumps(filtered))


class CodexTransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='yama-codex-test-')
        self.root = Path(self.directory.name)

    async def asyncTearDown(self):
        self.directory.cleanup()

    def transport(self, behavior='', timeout=5):
        executable = self.root / 'fake-codex'
        executable.write_text('#!' + os.sys.executable + '\n' + '''
import json, os, pathlib, sys, time
if sys.argv[1:3] == ['login', 'status']:
    print('Logged in using ChatGPT'); raise SystemExit(0)
args = sys.argv[1:]
prompt = sys.stdin.read()
''' + behavior + '''
answer = pathlib.Path(args[args.index('--output-last-message') + 1])
answer.write_text('{"text":"A bounded reply.","handoff":null}')
print(json.dumps({'type':'turn.completed','usage':{'input_tokens':1,'output_tokens':1}}))
''')
        executable.chmod(0o700)
        return CodexTransport(CodexConfig(str(executable), timeout), project_directory=self.root / 'project')

    async def test_no_shell_isolated_project_flags_schema_and_cleanup(self):
        capture = self.root / 'capture.json'
        transport = self.transport('pathlib.Path(' + repr(str(capture)) + ').write_text(json.dumps({"args":args,"env":dict(os.environ),"cwd":os.getcwd(),"prompt":prompt}))\n')
        reply = await transport({'instructions': 'Trusted role policy', 'input': '{"message":"untrusted data"}',
                                 'schema': {'type': 'object'}})
        self.assertEqual(reply['text'], 'A bounded reply.')
        captured = json.loads(capture.read_text()); args = captured['args']
        for flag in ('--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--json'):
            self.assertIn(flag, args)
        self.assertEqual(args[args.index('--sandbox') + 1], 'read-only')
        self.assertIn('features.shell_tool=false', args)
        self.assertIn('web_search="disabled"', args)
        self.assertNotEqual(captured['cwd'], str(Path.cwd()))
        self.assertFalse(Path(captured['cwd']).exists())
        self.assertNotIn('OPENAI_API_KEY', captured['env'])
        self.assertNotIn('MONGODB_URI', captured['env'])
        for agent in AgentId:
            self.assertTrue((self.root / 'project' / 'agents' / agent.value / 'SKILL.md').is_file())

    async def test_timeout_kills_process_and_returns_only_public_error(self):
        pid_file = self.root / 'timeout.pid'
        with self.assertRaisesRegex(BackendError, 'tool_timeout'):
            await self.transport('pathlib.Path(' + repr(str(pid_file)) + ').write_text(str(os.getpid()))\ntime.sleep(10)\n', timeout=1)({'instructions': 'test', 'input': '{}', 'schema': {}})
        self.assertTrue(pid_file.exists())
        with self.assertRaises(ProcessLookupError): os.kill(int(pid_file.read_text()), 0)

    async def test_cancellation_kills_process(self):
        pid_file = self.root / 'cancel.pid'
        transport = self.transport('pathlib.Path(' + repr(str(pid_file)) + ').write_text(str(os.getpid()))\ntime.sleep(10)\n')
        task = asyncio.create_task(transport({'instructions': 'test', 'input': '{}', 'schema': {}}))
        for _ in range(100):
            if pid_file.exists(): break
            await asyncio.sleep(.01)
        self.assertTrue(pid_file.exists()); task.cancel()
        with self.assertRaises(asyncio.CancelledError): await task
        with self.assertRaises(ProcessLookupError): os.kill(int(pid_file.read_text()), 0)

    async def test_missing_or_malformed_final_output_and_cli_errors_are_sanitized(self):
        for behavior in (
            'print("PRIVATE_UPSTREAM_AUTH_BODY", file=sys.stderr); raise SystemExit(1)\n',
            'raise SystemExit(0)\n',
            'pathlib.Path(args[args.index("--output-last-message") + 1]).write_text("PRIVATE_NOT_JSON"); raise SystemExit(0)\n',
        ):
            with self.assertRaises(BackendError) as caught:
                await self.transport(behavior)({'instructions': 'test', 'input': '{}', 'schema': {}})
            self.assertNotIn('PRIVATE', str(caught.exception))

    async def test_output_limit_and_tool_events_are_rejected(self):
        for behavior in ('print("x" * 600000, flush=True)\ntime.sleep(1)\n',
                         'print(json.dumps({"type":"item.started","item":{"type":"command_execution","command":"PRIVATE"}}), flush=True)\ntime.sleep(1)\n'):
            with self.assertRaises(BackendError) as caught:
                await self.transport(behavior)({'instructions': 'test', 'input': '{}', 'schema': {}})
            self.assertNotIn('PRIVATE', str(caught.exception))

    async def test_api_key_login_is_not_used_and_provider_diagnostics_are_hidden(self):
        transport = self.transport()
        executable = Path(transport.config.binary)
        executable.write_text(executable.read_text().replace('Logged in using ChatGPT', 'Logged in using an API key: PRIVATE'))
        with self.assertRaisesRegex(BackendError, 'provider_not_configured') as caught:
            await transport({'instructions': 'test', 'input': '{}', 'schema': {}})
        self.assertNotIn('PRIVATE', str(caught.exception))
