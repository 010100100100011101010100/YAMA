import unittest
from types import SimpleNamespace
from yama_agents.graph_retrieval import retrieve
from graphrag_sdk.core.exceptions import RetrieverError


class SemanticGraph:
    def __init__(self): self.calls = []
    async def query(self, query, **kwargs):
        self.calls.append((query, kwargs))
        if 'queryNodes' in query:
            return SimpleNamespace(result_set=[['related', 'b'*64, 0.12, 'c'*64]])
        return SimpleNamespace(result_set=[['exact', 'a'*64, ['amount:18400']]])


class SemanticTests(unittest.IsolatedAsyncioTestCase):
    async def test_semantic_only_candidate_uses_vector_index_and_keeps_exact_results_first(self):
        graph = SemanticGraph()
        result = await retrieve(graph, {'patterns': [], 'identifiers': [], 'details': ['amount:18400']},
            semantic={'vector': [0.1]*384, 'queryHash': 'd'*64})
        self.assertEqual([row['id'] for row in result['matches']], ['exact', 'related'])
        self.assertEqual(result['matches'][1]['semantic']['documentHash'], 'c'*64)
        self.assertAlmostEqual(result['matches'][1]['semantic']['score'], 0.88)
        self.assertEqual(graph.calls[1][1]['params']['vector'], [0.1]*384)
        self.assertIn('node.semanticVersion = node.contentVersion', graph.calls[1][0])

    async def test_nonfinite_or_wrong_dimension_vectors_fail_before_any_query(self):
        for vector in [[0.1], [float('nan')]*384]:
            graph = SemanticGraph()
            with self.assertRaises(RetrieverError):
                await retrieve(graph, {'patterns': [], 'identifiers': [], 'details': []}, semantic={'vector': vector, 'queryHash': 'd'*64})
            self.assertEqual(graph.calls, [])
