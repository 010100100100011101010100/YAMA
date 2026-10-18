"""Bounded local embedding IPC, with no graph or provider credentials."""
import json
import sys
from yama_agents.embeddings import LocalEmbeddings, text_hash

try:
    raw = sys.stdin.buffer.read(1024*1024+1)
    if len(raw) > 1024*1024: raise ValueError('input_limit')
    request = json.loads(raw)
    if set(request) != {'documents'} or not 1 <= len(request['documents']) <= 100: raise ValueError('invalid_request')
    model = LocalEmbeddings()
    documents = []
    for document in request['documents']:
        if set(document) != {'id', 'text'} or not isinstance(document['id'], str) or not 1 <= len(document['id']) <= 100: raise ValueError('invalid_document')
        documents.append({'id': document['id'], 'hash': text_hash(document['text']), 'vector': model.encode(document['text'], query=False)})
    print(json.dumps({'documents': documents}))
except Exception:
    print(json.dumps({'error': 'semantic_index_failed'}))
