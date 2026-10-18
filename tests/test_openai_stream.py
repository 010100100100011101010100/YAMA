import json
import unittest
import httpx2
from openai import AsyncOpenAI
from yama_agents.openai_model import OpenAIModel, ProviderConfig
from yama_agents.dialogue import generate
from test_dialogue import bindings
from test_openai_model import environment

class OpenAIStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_sdk_streams_structured_text_then_validates_completed_response(self):
        text=json.dumps({'text':'A generated answer about the reviewed account.','handoff':None,'question':None})
        part={'type':'output_text','text':'','annotations':[]}
        item={'id':'msg','type':'message','role':'assistant','status':'in_progress','content':[]}
        response={'id':'resp','object':'response','created_at':1,'model':'test-model','status':'in_progress','output':[]}
        final={**response,'status':'completed','output':[{**item,'status':'completed','content':[{**part,'text':text}]}]}
        events=[{'type':'response.created','response':response},
            {'type':'response.output_item.added','output_index':0,'item':item},
            {'type':'response.content_part.added','output_index':0,'content_index':0,'item_id':'msg','part':part},
            {'type':'response.output_text.delta','output_index':0,'content_index':0,'item_id':'msg','delta':text},
            {'type':'response.completed','response':final}]
        requests=[]
        def transport(request):
            requests.append(json.loads(request.content))
            return httpx2.Response(200,headers={'content-type':'text/event-stream'},content=''.join('data: '+json.dumps(event)+'\n\n' for event in events))
        seen=[]
        async with httpx2.AsyncClient(transport=httpx2.MockTransport(transport),trust_env=False) as http:
            async with AsyncOpenAI(api_key='fake',max_retries=0,http_client=http) as client:
                model=OpenAIModel(ProviderConfig.from_env(environment()),client=client); model.on_text=seen.append
                result=await generate(bindings('saathi'),model)
        self.assertEqual(result['text'],seen[0])
        self.assertTrue(requests[0]['stream'])
        self.assertFalse(requests[0]['store'])
