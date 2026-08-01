import os
import operator
from typing                     import Annotated, TypedDict, List
from langchain_openrouter       import ChatOpenRouter
from langchain.tools            import tool
from langchain_core.messages    import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph            import StateGraph, END
from langgraph.prebuilt         import ToolNode
from rag_processor              import query_knowledge_base
from supabase                   import create_client
from dotenv                     import load_dotenv
from logger                         import get_logger

logger = get_logger(__name__)

load_dotenv()
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]

supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# OpenRouter free models:
# - google/gemma-4-31b-it:free
# - google/gemma-4-26b-a4b-it:free
# - meta-llama/llama-3.3-70b-instruct:free
# - deepseek/deepseek-v4-flash:free
# Set your preferred model via environment variable OPENROUTER_MODEL
# Default: "google/gemma-4-31b-it:free"

class RAGAgent:
    def __init__(self, model_name: str = None, checkpointer=None, user_id: str = None):
        # Use environment variable if provided, else fallback to default
        if model_name is None:
            model_name = os.environ.get("OPENROUTER_MODEL", "google/gemma-4-31b-it:free")
        logger.info(f"Initializing with OpenRouter model: {model_name}")
        
        # ChatOpenRouter reads OPENROUTER_API_KEY from environment automatically.
        # Do NOT pass openai_api_key, base_url, or default_headers.
        self.llm = ChatOpenRouter(
            model=model_name,
            temperature=0.7,
            streaming=True,
            max_retries=5,           # optional: auto-retry on transient failures
        )
        self.tools = [self._create_query_tool()]
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        self.checkpointer = checkpointer
        self.graph = None
        logger.info("Initialization complete")

    def _create_query_tool(self):
        @tool
        def query_knowledge_base_tool(query: str) -> str:
            """
            Search the institutional knowledge base for documents related to the query.
            Returns a JSON list of relevant chunks. Each chunk object has:
            - chunk_id (uuid)
            - document_id (uuid)
            - file_name (string)
            - content (string)
            - similarity (float)
            When using this information in your answer, cite each claim with the 
            index (1-based) of the chunk in this list. At the end, list the sources 
            with file names.
            """
            return query_knowledge_base(query, supabase_client)
        return query_knowledge_base_tool

    def _build_graph(self):
        logger.info("Building LangGraph workflow...")
        workflow = StateGraph(AgentState)
        workflow.add_node("agent", self.call_model)
        workflow.add_node("tools", ToolNode(self.tools))
        workflow.set_entry_point("agent")

        def should_continue(state: AgentState):
            messages = state["messages"]
            last_message = messages[-1]
            if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
                logger.info("Decision: Continue to tools")
                return "tools"
            logger.info("Decision: End")
            return END

        workflow.add_conditional_edges("agent", should_continue)
        workflow.add_edge("tools", "agent")
        compiled = workflow.compile(checkpointer=self.checkpointer)
        logger.info("Graph compiled successfully")
        return compiled

    def ensure_graph(self):
        if self.graph is None:
            logger.info("Graph is None, building now...")
            if self.checkpointer is None:
                raise RuntimeError("Checkpointer not provided to RAGAgent")
            self.graph = self._build_graph()

    async def call_model(self, state: AgentState):
        logger.info(f"Calling LLM with {len(state['messages'])} messages")
        SYSTEM_PROMPT_FILE = "MOMO.md"
        with open(SYSTEM_PROMPT_FILE, "r", encoding='utf-8') as f:
            SYSTEM_PROMPT = SystemMessage(content=f.read())
        response = await self.llm_with_tools.ainvoke([SYSTEM_PROMPT] + state["messages"])
        logger.info("LLM response received")
        return {"messages": [response]}

    async def stream_response(self, user_input: str, thread_id: str):
        logger.info(f"stream_response called with thread_id: {thread_id}")
        self.ensure_graph()
        inputs = {"messages": [HumanMessage(content=user_input)]}
        config = {
            "configurable": {"thread_id": thread_id},
            "stream_subgraphs": True
        }
        logger.info("Starting graph stream...")

        async for event in self.graph.astream(inputs, config=config, stream_mode="messages"):
            msg, metadata = event
            logger.debug(f"Event: type={type(msg).__name__} metadata_keys={list(metadata.keys())} langgraph_node={metadata.get('langgraph_node')} content={msg.content!r}")

            if isinstance(msg, AIMessage):
                # tool_calls is where "decision to call a tool + its parameters" lives
                if getattr(msg, 'tool_calls', None):
                    logger.debug(f"Tool calls: {msg.tool_calls}")
                if getattr(msg, 'tool_call_chunks', None):
                    logger.debug(f"Tool call chunks: {msg.tool_call_chunks}")
                if msg.content:
                    yield {"type": "ai", "content": msg.content}

            elif isinstance(msg, ToolMessage):
                logger.debug(f"Tool result: tool_call_id={msg.tool_call_id} name={msg.name}")
                yield {"type": "tool", "content": msg.content}

        logger.info("Stream finished")