"""Official GraphRAG SDK retrieval over the published catalogue only.

The caller supplies canonical discovery keys, never Cypher or a graph name.
No vector model or ontology discovery is run for exact indexed details.
"""
import json
import logging
import re
from yama_agents.embeddings import MODEL, REVISION, validate_vector
from graphrag_sdk import Context, RetrievalStrategy, RetrieverResult, RetrieverResultItem
from graphrag_sdk.core.models import RawSearchResult

logging.getLogger('graphrag_sdk').setLevel(logging.CRITICAL)


def validate_seeds(seeds):
    if not isinstance(seeds, dict) or set(seeds) != {'patterns', 'identifiers', 'details'}:
        raise ValueError('invalid_seeds')
    for kind, limit in [('patterns', 4), ('identifiers', 100), ('details', 50)]:
        values = seeds[kind]
        if not isinstance(values, list) or len(values) > limit or any(not isinstance(value, str) or not 1 <= len(value) <= 270 for value in values):
            raise ValueError('invalid_seeds')
    if any(value not in {'paid', 'promised_delivery', 'not_delivered', 'no_reply'} for value in seeds['patterns']):
        raise ValueError('invalid_seeds')
    if any(not re.match(r'^(phone|email|telegram):', value) for value in seeds['identifiers']) or any(not re.match(r'^(item|amount|reported_alias):', value) for value in seeds['details']):
        raise ValueError('invalid_seeds')


class PublishedCaseRetrieval(RetrievalStrategy):
    async def _execute(self, query, ctx, *, seeds, semantic=None):
        validate_seeds(seeds)
        if semantic is not None:
            validate_vector(semantic['vector'])
            if not re.fullmatch('[a-f0-9]{64}', semantic['queryHash']): raise ValueError('invalid_query_hash')
        keys = sorted(set(seeds['patterns'] + seeds['identifiers'] + seeds['details']))
        # A single edge is enough for discovery. Review, not this query, decides attachment.
        rows = await self._graph.query(
            'MATCH (c:CatalogueCase)-[:HAS_PATTERN|HAS_IDENTIFIER|HAS_DISCOVERY_DETAIL]->(d) '
            'WHERE c.synthetic = true AND c.published = true AND d.key IN $keys '
            'RETURN c.id AS id,c.contentVersion AS version,collect(DISTINCT d.key) AS keys '
            'ORDER BY id LIMIT 101', params={'keys': keys}, timeout=3000) if keys else None
        matches = []
        for case_id, version, shared in rows.result_set if rows else []:
            matches.append({'id': case_id, 'version': version,
                'sharedPatterns': [key for key in shared if key in seeds['patterns']],
                'sharedIdentifiers': [key for key in shared if key in seeds['identifiers']],
                'sharedDetails': [key for key in shared if key in seeds['details']]})
        matches.sort(key=lambda case: (-len(case['sharedIdentifiers']),
            -sum(key.startswith('reported_alias:') for key in case['sharedDetails']),
            -len(case['sharedDetails']), -len(case['sharedPatterns']), case['id']))
        if semantic is not None:
            rows = await self._graph.query(
                "CALL db.idx.vector.queryNodes('PublishedSemanticCase', 'embedding', 10, vecf32($vector)) YIELD node, score "
                "WHERE node.synthetic = true AND node.published = true AND node.semanticVersion = node.contentVersion "
                "AND node.semanticModel = $model AND score <= 0.22 "
                "RETURN node.id,node.contentVersion,score,node.semanticHash ORDER BY score ASC",
                params={'vector': semantic['vector'], 'model': REVISION}, timeout=3000)
            for case_id, version, distance, document_hash in rows.result_set:
                # The active FalkorDB index returns cosine distance (self-match is 0).
                hint = {'score': 1-distance, 'model': MODEL, 'revision': REVISION, 'documentHash': document_hash, 'queryHash': semantic['queryHash']}
                existing = next((match for match in matches if match['id'] == case_id), None)
                if existing: existing['semantic'] = hint
                else: matches.append({'id': case_id, 'version': version, 'sharedPatterns': [], 'sharedIdentifiers': [], 'sharedDetails': [], 'semantic': hint})
        return RawSearchResult(records=matches[:10], metadata={'truncated': len(matches) > 10})

    def _format(self, raw):
        return RetrieverResult(items=[RetrieverResultItem(content=row['id'], metadata=row) for row in raw.records], metadata=raw.metadata)


async def retrieve(connection, seeds, *, semantic=None):
    result = await PublishedCaseRetrieval(graph_store=connection).search('Confirmed case discovery', Context(), seeds=seeds, semantic=semantic)
    return {'matches': [item.metadata for item in result.items], 'truncated': result.metadata.get('truncated', False)}
