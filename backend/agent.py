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
from sanitizer                  import sanitize_input

load_dotenv()
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]

supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Model Available (Ollama)
# gemma4:31b-cloud
# deepseek-v4-flash
# deepseek-v4-pro

# Get the directory where agent.py is located
AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
SYSTEM_PROMPT_FILE = os.path.join(AGENT_DIR, "MOMO.md")


class RAGAgent:
    def __init__(self, model_name: str = "gemma4:31b-cloud", checkpointer=None, user_id: str = None):
        print(f"[AGENT] Initializing with model: {model_name}")
        self.llm = ChatOllama(model=model_name, streaming=True)
        self.tools = [self._create_query_tool()]
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        self.checkpointer = checkpointer
        self.graph = None

        # Read the system prompt once at startup instead of on every single
        # turn - it doesn't change, no reason to hit disk on every call.
        with open(SYSTEM_PROMPT_FILE, "r", encoding='utf-8') as f:
            self.system_prompt = SystemMessage(content=f.read())

        print("[AGENT] Initialization complete")

    def _create_query_tool(self):
        @tool
        def query(query: str) -> str:
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
        return query

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

    async def call_model(self, state: AgentState):
        print(f"[AGENT] Calling LLM with {len(state['messages'])} messages")
        response = await self.llm_with_tools.ainvoke([self.system_prompt] + state["messages"])
        print(f"[AGENT] LLM response received")
        return {"messages": [response]}

    async def stream_response(self, user_input: str, thread_id: str):
        print(f"[AGENT] stream_response called with thread_id: {thread_id}")
        self.ensure_graph()
        
        # --- Input Sanitization ---
        sanitized_input, modified = sanitize_input(user_input)
        if modified:
            print(f"[SECURITY] Input sanitized. Original: {user_input!r} -> Result: {sanitized_input!r}")
        
        inputs = {"messages": [HumanMessage(content=sanitized_input)]}
        config = {
            "configurable": {"thread_id": thread_id},
            "stream_subgraphs": True
        }
        print("[AGENT] Starting graph stream...")

        # Track which tool_call ids we've already announced a "decision" for,
        # so we don't emit the same tool_call event twice if it shows up
        # across multiple chunks.
        announced_tool_calls = set()

        async for event in self.graph.astream(inputs, config=config, stream_mode="messages"):
            msg, metadata = event
            print("=" * 60)
            print(f"[RAW EVENT] type={type(msg).__name__}  langgraph_node={metadata.get('langgraph_node')}")
            print(f"  content: {msg.content!r}")

            if isinstance(msg, AIMessage):
                # --- Tool call decision + parameters ---
                tool_calls = getattr(msg, 'tool_calls', None)
                if tool_calls:
                    print(f"  tool_calls: {tool_calls}")
                    for tc in tool_calls:
                        tc_id = tc.get('id')
                        if tc_id in announced_tool_calls:
                            continue
                        announced_tool_calls.add(tc_id)
                        yield {
                            "type": "tool_call",
                            "content": {
                                "id": tc_id,
                                "name": tc.get('name'),
                                "args": tc.get('args'),
                            },
                        }

                # --- Regular assistant text ---
                if msg.content:
                    yield {"type": "ai", "content": msg.content}

            elif isinstance(msg, ToolMessage):
                print(f"  tool_call_id: {msg.tool_call_id}  name: {msg.name}")
                yield {
                    "type": "tool_result",
                    "content": {
                        "tool_call_id": msg.tool_call_id,
                        "name": msg.name,
                        "result": msg.content,
                    },
                }

        print("[AGENT] Stream finished")