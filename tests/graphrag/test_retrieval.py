import unittest
from types import SimpleNamespace
from graphrag_sdk import RetrievalStrategy
from yama_agents.graph_retrieval import PublishedCaseRetrieval, retrieve

class Graph:
    def __init__(self, rows): self.rows=rows; self.calls=[]
    async def query(self, query, **kwargs):
        self.calls.append((query,kwargs)); return SimpleNamespace(result_set=self.rows)

class RetrievalTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_detail_is_sufficient_and_does_not_require_contact_overlap(self):
        graph=Graph([['case-1','a'*64,['amount:18400']]])
        result=await retrieve(graph,{'patterns':[],'identifiers':[],'details':['amount:18400']})
        self.assertIsInstance(PublishedCaseRetrieval(), RetrievalStrategy)
        self.assertEqual(result['matches'][0]['sharedDetails'],['amount:18400'])
        self.assertEqual(result['matches'][0]['sharedIdentifiers'],[])
        self.assertEqual(graph.calls[0][1]['params'],{'keys':['amount:18400']})
    async def test_contact_matches_rank_ahead_of_weak_candidates_and_no_keys_runs_no_query(self):
        graph=Graph([['weak','b'*64,['paid']],['contact','a'*64,['phone:+12025550101']]])
        result=await retrieve(graph,{'patterns':['paid'],'identifiers':['phone:+12025550101'],'details':[]})
        self.assertEqual(result['matches'][0]['id'],'contact')
        graph.calls=[]
        self.assertEqual((await retrieve(graph,{'patterns':[],'identifiers':[],'details':[]}))['matches'],[])
        self.assertEqual(graph.calls,[])
    async def test_invalid_keys_cannot_become_a_query(self):
        graph=Graph([])
        with self.assertRaises(Exception):
            await retrieve(graph,{'patterns':[], 'identifiers':[], 'details':['MATCH (n) DETACH DELETE n']})
        self.assertEqual(graph.calls,[])
