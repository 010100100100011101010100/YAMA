import json
import os
from pathlib import Path
import tempfile
import unittest
from yama_agents.codex_model import CodexConfig, DISABLED_FEATURES
from yama_agents.codex_stream import stream_codex, disabled_mcp_settings

class CodexStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_final_text_events_use_ephemeral_tool_disabled_session(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); binary=root/'fake-codex'
            binary.write_text('#!'+os.sys.executable+'\n'+'''
import json, sys
assert 'features.shell_tool=false' in sys.argv and 'features.plugins=false' in sys.argv
def send(value): print(json.dumps(value), flush=True)
for line in sys.stdin:
 request=json.loads(line); method=request['method']; identifier=request.get('id')
 if method=='initialize': send({'id':identifier,'result':{}})
 elif method=='thread/start':
  assert request['params']['ephemeral'] and request['params']['sandbox']=='read-only'
  send({'id':identifier,'result':{'thread':{'id':'thread'}}})
 elif method=='turn/start':
  send({'id':identifier,'result':{'turn':{'id':'turn'}}})
  params={'threadId':'thread','turnId':'turn'}
  send({'method':'item/started','params':{**params,'item':{'id':'user','type':'userMessage','content':[]}}})
  send({'method':'item/started','params':{**params,'item':{'id':'msg','type':'agentMessage','phase':'final_answer','text':''}}})
  text=json.dumps({'text':'A real generated prefix.','handoff':None,'question':None})
  send({'method':'item/agentMessage/delta','params':{**params,'itemId':'msg','delta':text}})
  send({'method':'item/completed','params':{**params,'item':{'id':'msg','type':'agentMessage','phase':'final_answer','text':text}}})
  send({'method':'turn/completed','params':{'threadId':'thread','turn':{'id':'turn','status':'completed'}}})
'''); binary.chmod(0o700)
            seen=[]
            result=await stream_codex(CodexConfig(str(binary),5), {'instructions':'Role policy','input':'{}','schema':{},'on_text':seen.append},root,
                {'HOME':str(root),'PATH':'/usr/bin:/bin'},DISABLED_FEATURES)
            self.assertEqual(result['text'],'A real generated prefix.')
            self.assertEqual(seen,['A real generated prefix.'])

    def test_mcp_names_are_disabled_without_exporting_credentials(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); (root/'config.toml').write_text('[mcp_servers.private]\nurl="https://example.test/PRIVATE_KEY"\n')
            settings=disabled_mcp_settings({'HOME':folder,'CODEX_HOME':folder})
            self.assertEqual(settings,['mcp_servers.private.enabled=false'])
            self.assertNotIn('PRIVATE_KEY',json.dumps(settings))
