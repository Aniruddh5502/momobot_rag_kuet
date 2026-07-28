import operator
from typing import Annotated, TypedDict, List
from langchain_ollama import ChatOllama
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]

def query_knowledge_base(query: str) -> str:
    """Search the internal knowledge base for documents related to the query."""
    print(f"[RAG TOOL] Querying knowledge base for: {query}")
    return f"[SIMULATED RAG RESULT]: The user is asking about '{query}'."

class RAGAgent:
    def __init__(self, model_name: str = "gemma4:31b-cloud", checkpointer=None):
        print(f"[AGENT] Initializing with model: {model_name}")
        self.llm = ChatOllama(model=model_name, streaming=True)
        self.tools = [query_knowledge_base]
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        self.checkpointer = checkpointer
        self.graph = None
        print("[AGENT] Initialization complete")

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
        response = self.llm_with_tools.invoke(state["messages"])
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
            if isinstance(msg, AIMessage) and msg.content:
                print(f"[AGENT] Yielding content chunk")
                yield msg.content