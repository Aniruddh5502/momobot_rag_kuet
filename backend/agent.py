import os
import operator
from typing                     import Annotated, TypedDict, List
from langchain_ollama           import ChatOllama
from langchain.tools            import tool
from langchain_core.messages    import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph            import StateGraph, END
from langgraph.prebuilt         import ToolNode
from rag_processor              import query_knowledge_base
from supabase                   import create_client
from dotenv                     import load_dotenv

load_dotenv()
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]

supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

class RAGAgent:
    def __init__(self, model_name: str = "gemma4:31b-cloud", checkpointer=None, user_id: str = None):
        print(f"[AGENT] Initializing with model: {model_name}")
        self.llm = ChatOllama(model=model_name, streaming=True)
        self.tools = [self._create_query_tool()]
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        self.checkpointer = checkpointer
        self.graph = None
        print("[AGENT] Initialization complete")


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
        print("[AGENT] Building LangGraph workflow...")
        workflow = StateGraph(AgentState)
        workflow.add_node("agent", self.call_model)
        workflow.add_node("tools", ToolNode(self.tools))
        workflow.set_entry_point("agent")

        def should_continue(state: AgentState):
            messages = state["messages"]
            last_message = messages[-1]
            if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
                print("[AGENT] Decision: Continue to tools")
                return "tools"
            print("[AGENT] Decision: End")
            return END

        workflow.add_conditional_edges("agent", should_continue)
        workflow.add_edge("tools", "agent")
        compiled = workflow.compile(checkpointer=self.checkpointer)
        print("[AGENT] Graph compiled successfully")
        return compiled

    def ensure_graph(self):
        if self.graph is None:
            print("[AGENT] Graph is None, building now...")
            if self.checkpointer is None:
                raise RuntimeError("Checkpointer not provided to RAGAgent")
            self.graph = self._build_graph()

    def call_model(self, state: AgentState):
        print(f"[AGENT] Calling LLM with {len(state['messages'])} messages")
        SYSTEM_PROMPT_FILE = "MOMO.md"
        with open(SYSTEM_PROMPT_FILE, "r", encoding='utf-8') as f:
            SYSTEM_PROMPT = SystemMessage(content=f.read())
        response = self.llm_with_tools.invoke( [SYSTEM_PROMPT] + state["messages"])
        print(f"[AGENT] LLM response received")
        return {"messages": [response]}

    async def stream_response(self, user_input: str, thread_id: str):
        print(f"[AGENT] stream_response called with thread_id: {thread_id}")
        self.ensure_graph()
        inputs = {"messages": [HumanMessage(content=user_input)]}
        config = {"configurable": {"thread_id": thread_id}}
        print("[AGENT] Starting graph stream...")
        
        async for event in self.graph.astream(inputs, config=config, stream_mode="messages"):
            msg, metadata = event
            if isinstance(msg, AIMessage):
                if msg.content:
                    yield {"type": "ai", "content": msg.content}
            elif isinstance(msg, ToolMessage):
                # Tool content is JSON string (from query_knowledge_base)
                yield {"type": "tool", "content": msg.content}