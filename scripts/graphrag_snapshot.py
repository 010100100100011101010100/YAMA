"""Private SDK IPC: fixed catalogue, bounded seeds, no arbitrary query capability."""
import asyncio
import json
import os
import re
import sys
from graphrag_sdk import ConnectionConfig, FalkorDBConnection, __version__
from yama_agents.graph_retrieval import retrieve


async def main():
    raw = sys.stdin.buffer.read(64 * 1024 + 1)
    if len(raw) > 64 * 1024:
        raise ValueError('input_limit')
    request = json.loads(raw)
    if not {'namespace', 'seeds'} <= set(request) or set(request) - {'namespace', 'seeds', 'semanticQuery'} or not re.fullmatch(r'yama[a-z0-9_]{0,80}', request['namespace']):
        raise ValueError('invalid_request')
    semantic = None
    if request.get('semanticQuery'):
        from yama_agents.embeddings import query_embedding, text_hash
        semantic = {'vector': query_embedding(request['semanticQuery']), 'queryHash': text_hash(request['semanticQuery'])}
    connection = FalkorDBConnection(ConnectionConfig(host=os.environ['YAMA_SDK_GRAPH_HOST'], port=int(os.environ['YAMA_SDK_GRAPH_PORT']),
        username=os.environ.get('YAMA_SDK_GRAPH_USERNAME') or None, password=os.environ['YAMA_SDK_GRAPH_PASSWORD'],
        ssl=os.environ['YAMA_SDK_GRAPH_TLS'] == 'true', graph_name=request['namespace'] + '_catalogue',
        max_connections=1, retry_count=1, pool_timeout=5, query_timeout_ms=3000))
    try:
        result = await retrieve(connection, request['seeds'], semantic=semantic)
        return {**result, 'sdkVersion': __version__}
    finally:
        await connection.close()


if __name__ == '__main__':
    try:
        print(json.dumps(asyncio.run(main())))
    except Exception:
        # Driver failures may contain a connection address; diagnostics never leave IPC.
        print(json.dumps({'error': 'graphrag_unavailable'}))
