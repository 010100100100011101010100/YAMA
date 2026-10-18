import unittest
from yama_agents.backend import BackendError
from yama_agents.candidate_review import review

class Model:
    async def review_connections(self, profile, context):
        return {'cases':[{'id':'weak','decision':'omit','reason':'Only a common amount matches.'}]}

class ReviewTests(unittest.IsolatedAsyncioTestCase):
    async def test_agent_can_reject_a_single_detail_candidate(self):
        context={'agent':'drishti','language':'en','question':'Is this related?', 'assertions':[], 'candidates':[
            {'id':'weak','title':'Different shop','summary':'Different account.', 'sharedContacts':[], 'sharedDetails':[{'kind':'amount','value':'7200'}], 'sharedPatterns':[], 'outcome':None}]}
        self.assertEqual((await review(context,Model()))['cases'][0]['decision'],'omit')
    async def test_missing_candidate_decision_is_not_accepted(self):
        class Missing(Model):
            async def review_connections(self,profile,context):return {'cases':[]}
        context={'agent':'drishti','language':'en','question':'Compare', 'assertions':[], 'candidates':[
            {'id':'weak','title':'A report','summary':'A report.', 'sharedContacts':[], 'sharedDetails':[], 'sharedPatterns':['paid'], 'outcome':None}]}
        with self.assertRaises(BackendError):await review(context,Missing())
