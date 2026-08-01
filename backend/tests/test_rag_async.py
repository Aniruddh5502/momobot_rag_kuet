# tests/test_rag_async.py
import pytest
import asyncio
import httpx
from rag_processor import embed_chunks_async, query_knowledge_base_async

@pytest.mark.asyncio
async def test_embed_chunks_async_performance():
    """
    Test that async embedding works and is logically correct.
    """
    chunks = ["Hello world", "Test async batch", "Concurrent embedding check"]
    # We use a real call here to verify it actually hits Ollama
    try:
        embeddings = await embed_chunks_async(chunks)
        assert len(embeddings) == 3
        assert len(embeddings[0]) > 0
    except Exception as e:
        pytest.fail(f"Async embedding failed: {e}")

@pytest.mark.asyncio
async def test_query_kb_async():
    """
    Test async KB query logic.
    Note: This requires a running Supabase instance.
    """
    # Mocking supabase_client for a pure logic test if needed, 
    # but here we check if the async chain works.
    from unittest.mock import MagicMock
    mock_supabase = MagicMock()
    mock_supabase.rpc.return_value.execute.return_value.data = [
        {"chunk_id": "1", "document_id": "doc1", "file_name": "test.pdf", "chunk_content": "content", "similarity": 0.9}
    ]
    
    result = await query_knowledge_base_async("test query", mock_supabase)
    assert "test.pdf" in result
    assert "content" in result
