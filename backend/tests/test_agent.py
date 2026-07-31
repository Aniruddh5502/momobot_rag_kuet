# tests/test_agent.py
import pytest
from unittest.mock import MagicMock
from langgraph.checkpoint.memory import MemorySaver
from agent import RAGAgent


def test_agent_builds_graph_with_checkpointer():
    """Agent should accept a checkpointer and build the graph."""
    # Use a real MemorySaver instead of MagicMock
    checkpointer = MemorySaver()
    agent = RAGAgent(model_name="gemma4:31b-cloud", checkpointer=checkpointer)
    graph = agent._build_graph()

    assert graph is not None


def test_agent_graph_built_lazily():
    """Graph should be None until ensure_graph() is called."""
    checkpointer = MemorySaver()
    agent = RAGAgent(checkpointer=checkpointer)
    assert agent.graph is None

    agent.ensure_graph()
    assert agent.graph is not None


def test_agent_raises_without_checkpointer():
    """ensure_graph() should raise if no checkpointer was provided."""
    agent = RAGAgent(checkpointer=None)
    
    with pytest.raises(RuntimeError, match="Checkpointer not provided"):
        agent.ensure_graph()


@pytest.mark.asyncio
async def test_stream_response_yields_ai_content():
    """stream_response should yield AIMessage content tokens."""
    from langchain_core.messages import AIMessage

    mock_graph = MagicMock()

    async def fake_astream(*args, **kwargs):
        yield (AIMessage(content="Hello "), {"langgraph_node": "agent"})
        yield (AIMessage(content="world!"), {"langgraph_node": "agent"})

    mock_graph.astream = fake_astream

    # Pass a real checkpointer to satisfy __init__, but we'll override the graph
    agent = RAGAgent(checkpointer=MemorySaver())
    agent.graph = mock_graph

    chunks = []
    async for chunk in agent.stream_response("Hi", "thread-1"):
        chunks.append(chunk)

    assert chunks == [{"type": "ai", "content": "Hello "}, {"type": "ai", "content": "world!"}]