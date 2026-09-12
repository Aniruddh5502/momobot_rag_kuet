# The agent core
import os, operator, httpx, logging
from typing                                 import Annotated, TypedDict, List
from langchain_ollama                       import ChatOllama
from langchain.tools                        import tool
from langchain_core.messages                import BaseMessage, HumanMessage, AIMessage
from langchain_core.messages                import SystemMessage, ToolMessage
from langgraph.graph                        import StateGraph, START, END
from langgraph.prebuilt                     import ToolNode
from supabase                               import create_async_client
from sanitizer                              import sanitize_input
from ragProcessor                           import queryKnowledgebaseAsync
from dotenv                                 import load_dotenv

logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger(__name__)

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]
    summary : str
    user_id: str # Essential for tracking and auditing

SUPABASE_URL                =       os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY   =       os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabaseClient              =       create_async_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


class Agent:
    def __init__(self, model_name:str = "gemma4:31b-cloud", checkpointer=None, user_id:str=None, supabase_client=None):
        log.info(f"Initialization with model: {model_name}")
        self.llm = ChatOllama(model=model_name, streaming=True)
        
        self.supabase_client = supabase_client
        
        # Tool integration here
        self.tools = [self._createQueryTool()]
        self.llmWithTool = self.llm.bind_tools(self.tools)
        
        self.checkpointer = checkpointer
        self.graph = None
        
        # Load system prompt once during initialization
        self.system_prompt_content = self._load_system_prompt()
        
        log.info("Initialization complete")
    
    def _load_system_prompt(self):
        try:
            with open('soul.md','r',encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            log.error(f"Failed to load soul.md: {e}")
            return "You are a helpful institutional assistant."

    def _createQueryTool(self):
        @tool
        async def query_tool(query: str)->str:
            """
            Search the institutional knowledgebase for documents related to query.
            Args:
                query: The topic you want to search in the knowledge base.
                
            Returns:
                A formatted string containing the most relevant document snippets, 
                including source filename, page number, and similarity score.
            """
            if not self.supabase_client:
                raise RuntimeError("Supabase client not initialized in Agent")
            return await queryKnowledgebaseAsync(query, self.supabase_client)
        return query_tool
    
    async def call_model(self, state:AgentState):
        
        log.info(f"Calling LLM with {len(state['messages'])} messages for user {state.get('user_id')}")
        SystemPrompt = SystemMessage(content=self.system_prompt_content)    
        response = await self.llmWithTool.ainvoke([SystemPrompt] + state["messages"])
        log.info("LLM response received")
        return {"messages":[response]}
    
    def _build_graph(self):
        log.info("Building graph")
        graph = StateGraph(AgentState)
        graph.add_node("agent", self.call_model)
        graph.add_node("tools", ToolNode(self.tools))
        graph.set_entry_point("agent")
        
        def should_continue(state:AgentState):
            messages = state["messages"]
            last_message = messages[-1]
            if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
                log.info("Decision: continuing to tools.")
                return "tools"
            log.info("Decision: 'End'")
            return END
        graph.add_conditional_edges("agent", should_continue)
        graph.add_edge("tools","agent")
        agentGraph = graph.compile(checkpointer=self.checkpointer)
        log.info("Graph compiled successfully")
        return agentGraph
    
    def ensure_graph(self):
        if self.graph is None:
            log.info("Graph is None. Building now...")
            if self.checkpointer is None:
                raise RuntimeError("Checkpointer not provided to rag agent")
            self.graph = self._build_graph()
            
    async def stream_response(self, user_input:str, thread_id:str, user_id:str = "unknown"):
        log.info(f"stream response called with thread_id: {thread_id} for user: {user_id}")
        self.ensure_graph()
        
        # Input sanitation
        sanitized_input, modified = sanitize_input(user_input)
        if modified:
            log.warning(f"Input sanitized. Original:\n{user_input} -> Result: {sanitized_input!r}")
        
        inputs = {
            "messages"    :   [HumanMessage(content=sanitized_input)],
            "user_id"     :   user_id
        }
        config = {
            "configurable"      :   {"thread_id":thread_id},
            "stream_subgraphs"  :   True
        }
        log.info("Streaming graph stream...")
        
        # Track which tool_call ids we've already announced a "decision" for,
        # so we don't emit the same tool_call event twice if it shows up
        # across multiple chunks
        announced_tool_calls = set()
        
        try:
            async for event in self.graph.astream(inputs, config=config, stream_mode="messages"):
                msg, metadata = event
                
                if isinstance(msg, AIMessage):
                    # Tool call decisions + parameters
                    tool_calls = getattr(msg, "tool_calls", None)
                    if tool_calls:
                        log.debug(f"Tool calls: {tool_calls}")
                        for tool_call in tool_calls:
                            tool_call_id = tool_call.get("id")
                            if tool_call_id in announced_tool_calls:
                                continue
                            announced_tool_calls.add(tool_call_id)
                            yield {
                                "type"  :   "tool_call",
                                "content":{
                                    "id"    :   tool_call_id,
                                    "name"  :   tool_call.get("name"),
                                    "args"  :   tool_call.get("args"),
                                },
                            }
                    if msg.content:
                        yield {"type":"ai", "content":msg.content}
                elif isinstance(msg, ToolMessage):
                    log.info(f"Tool result: tool_call_id={msg.tool_call_id} name={msg.name}")
                    yield {
                        "type"      :   "tool_result",
                        "content"   :   {
                            "tool_call_id"      :   msg.tool_call_id,
                            "name"              :   msg.name,
                            "result"            :   msg.content,
                        },
                    }
                    
        except httpx.ConnectError as e:
            log.error(f"Connection error to LLM provider: {e}")
            yield {"type":"ai", "content":"I am having problem connecting to the AI model."}
        except Exception as e:
            log.exception(f"Unexpected error during graph stream execution: {e}")
            yield {"type":"ai", "content":"An internal error occured."}
        log.info("stream finished")
