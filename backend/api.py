import os, logging, json, httpx, tempfile, mammoth, markdownify

from dotenv                         import load_dotenv
load_dotenv()
from supabase                       import AsyncClient, create_async_client
from tenacity                       import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from typing                         import Optional, List, Dict, Any
from contextlib                     import asynccontextmanager
from checkPointer                   import getCheckpointerContext
from ragProcessor                   import process_upload
from fastapi                        import FastAPI, HTTPException, Depends
from fastapi                        import status, File, UploadFile
from fastapi.responses              import StreamingResponse, JSONResponse
from fastapi.middleware.cors        import CORSMiddleware
from auth                           import getCurrentUser, currentUser
from pydantic                       import BaseModel, EmailStr
from agent                          import Agent
import uuid
from files_api                        import router as files_router


logging.basicConfig(level=logging.INFO)

# Supress verbose logging from libraries
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("hpack").setLevel(logging.WARNING)

log = logging.getLogger(__name__)

SUPABASE_URL               = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the .env file")

# Global instances
agent           = None
supabaseClient  : Optional[AsyncClient] = None
http_client     : Optional[httpx.AsyncClient] = None

AUTH_RETRYABLE_EXCEPTIONS = (
    httpx.ReadTimeout,
    httpx.ConnectTimeout,
    httpx.ConnectError,
    httpx.RemoteProtocolError,
    httpx.PoolTimeout,
)


def auth_retry_policy() -> AsyncRetrying:
    return AsyncRetrying(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type(AUTH_RETRYABLE_EXCEPTIONS),
        reraise=True,
    )


@asynccontextmanager
async def lifeSpan(app: FastAPI):
    global agent, supabaseClient, http_client

    log.info("Initializing Supabase async client...")
    supabaseClient = await create_async_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    app.state.supabase_client = supabaseClient
    log.info("Supabase client ready")

    # Singleton HTTP client for all backend requests to prevent socket exhaustion
    log.info("Initializing singleton HTTP client...")
    http_client = httpx.AsyncClient(
        timeout=30.0, 
        http2=False, 
        follow_redirects=True
    )

    log.info("Initializing agent in lifespan...")
    async with getCheckpointerContext() as checkpointer:
        log.info("Checkpointer ready, creating agent...")
        agent = Agent(checkpointer=checkpointer, supabase_client=supabaseClient)
        agent.ensure_graph()
        log.info("Agent initialized and graph compiled succesfully")
        yield
        
        log.info("Shutting down")
        await http_client.aclose()


app = FastAPI(lifespan=lifeSpan)
app.include_router(files_router)

app.add_middleware(
    CORSMiddleware,
    allow_headers=["*"],
    allow_methods=["*"],
    allow_credentials=True,
    allow_origins=["*"],
)


class chatRequest(BaseModel):
    message     :   str
    thread_id   :   str =   "default_session"


class userAuth(BaseModel):
    email       :   EmailStr
    password    :   str



@app.get("/health")
async def health_check():
    """
    System diagnostic endpoint to verify dependencies.
    Returns a detailed status of Supabase and Ollama connectivity.
    """
    status_report = {
        "supabase": "down",
        "ollama": "down",
        "model": "missing",
        "overall": "unhealthy"
    }

    # 1. Check Supabase
    try:
        # Simple check to see if the client can communicate with Supabase
        await supabaseClient.table("chat_sessions").select("*", count="exact").limit(1).execute()
        status_report["supabase"] = "up"
    except Exception as e:
        log.error(f"Health Check: Supabase unreachable: {e}")

    # 2. Check Ollama
    ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
    try:
        log.info(f"Health Check: Pinging Ollama at {ollama_url}...")
        resp = await http_client.get(f"{ollama_url}/api/tags")
        log.info(f"Health Check: Ollama responded with status {resp.status_code}")
        if resp.status_code == 200:
            status_report["ollama"] = "up"
            
            # 3. Check for specific model
            tags = resp.json().get("models", [])
            log.info(f"Health Check: Available models: {[m.get('name') for m in tags]}")
            model_name = "gemma4:31b-cloud" 
            if any(m.get("name") == model_name or m.get("name") == f"{model_name}:latest" for m in tags):
                status_report["model"] = "ready"
            else:
                status_report["model"] = f"missing ({model_name})"
    except Exception as e:
        log.error(f"Health Check: Ollama unreachable: {type(e).__name__}: {e}")

    if status_report["supabase"] == "up" and status_report["ollama"] == "up" and status_report["model"] == "ready":
        status_report["overall"] = "healthy"
    
    return status_report


@app.post("/auth/signup")
async def signup(user: userAuth):
    try:
        response_data = None
        async for attempt in auth_retry_policy():
            with attempt:
                resp = await http_client.post(
                    f"{SUPABASE_URL}/auth/v1/signup",
                    headers={
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                        "Content-Type": "application/json",
                    },
                    json={"email": user.email, "password": user.password},
                )
                if resp.status_code >= 400:
                    raise HTTPException(status_code=resp.status_code, detail=resp.text)
                response_data = resp.json()

        log.info("Signup Succesful")
        return {
            "message"   :   "Signup succesful. Please check your mailbox for confirmation email",
            "user"      :   response_data.get("user") if response_data else None
            }
    except HTTPException:
        raise
    except AUTH_RETRYABLE_EXCEPTIONS as e:
        log.error(f"Signup failed after retries - network issue: {type(e).__name__}: {e!r}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Authentication service is temporarily unreachable. Please try again."
        )
    except Exception as e:
        log.debug(f"Signup Failed.")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/signin")
async def signin(user: userAuth):
    try:
        log.info(f"Signin attempt for email: {user.email}")

        response_data = None
        async for attempt in auth_retry_policy():
            with attempt:
                resp = await http_client.post(
                    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                    headers={
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                        "Content-Type": "application/json",
                    },
                    json={"email": user.email, "password": user.password},
                )
                if resp.status_code == 400:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid email or password"
                    )
                elif resp.status_code >= 400:
                    raise HTTPException(status_code=resp.status_code, detail=resp.text)
                response_data = resp.json()

        log.info(f"Sign in successful for: {user.email}")
        return {
            "message": "Sign in successful",
            "session": {
                "access_token": response_data.get("access_token"),
                "refresh_token": response_data.get("refresh_token"),
                "expires_in": response_data.get("expires_in"),
                "token_type": response_data.get("token_type"),
            },
            "user": response_data.get("user")
        }
    except HTTPException:
        raise
    except AUTH_RETRYABLE_EXCEPTIONS as e:
        log.error(f"Signin failed after retries - network issue: {type(e).__name__}: {e!r}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Authentication service is temporarily unreachable. Please try again."
        )
    except Exception as e:
        log.error(f"Signin failed: type={type(e).__name__} repr={e!r}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@app.get("/auth/verify")
async def verifySession(token: str):
    try:
        log.info(f"Verifying token: {token[:20]}...")

        response = await http_client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_SERVICE_ROLE_KEY
            }
        )

        if response.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired or invalid"
            )
        elif response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Verification failed: {response.status_code}"
            )

        user_data = response.json()
        log.info(f"User verified: {user_data.get('email')}")
        return {
            "status": "valid",
            "user": user_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credential or expired token"
        )


@app.post("/chat")
async def chat(request: chatRequest, user: currentUser = Depends(getCurrentUser)):
    log.info(f"Received Request - message: {request.message}, Thread ID: {request.thread_id}")
    log.info(f"Authenticated USER: {user.id}")

    if agent is None:
        log.error("Agent is None!")
        raise HTTPException(status_code=500, detail="Agent not initialized")

    scoped_thread_id = f"{user.id}::{request.thread_id}"
    log.info(f"Scoped thread_id: {scoped_thread_id}")

    try:
        existing = await supabaseClient.table('chat_sessions') \
            .select("thread_id") \
            .eq("user_id", user.id) \
            .eq("thread_id", request.thread_id) \
            .execute()

        if not existing.data:
            title = request.message[:40] + ("..." if len(request.message) > 40 else "")
            await supabaseClient.table('chat_sessions').insert({
                "user_id": user.id,
                "thread_id": request.thread_id,
                "title": title
            }).execute()
            log.info(f"New Session created in the chat_sessions table: {request.thread_id} with title: {title}")

    except Exception as e:
        log.exception(f"Session creation skipped/error: {e}")

    async def event_generator():
        log.info("Starting to stream response...")
        try:
            async for chunk in agent.stream_response(request.message, scoped_thread_id):
                yield f"data: {json.dumps(chunk)}\n\n"
            log.info("Streaming completed successfully")
        except Exception as e:
            log.error(f"Event generator error: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    log.info("Returning Streaming Response")
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/chat/session/new")
async def create_session(user: currentUser = Depends(getCurrentUser)):
    try:
        session_id = str(uuid.uuid4())
        log.info("New session creation succesfull.")
        return {"user_id": user.id, "session_id": session_id}
    except Exception as e:
        log.info("New session creation failed.")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/chat/sessions")
async def list_sessions(user: currentUser = Depends(getCurrentUser)):
    try:
        response = await supabaseClient.table("chat_sessions") \
            .select("*") \
            .eq("user_id", user.id) \
            .order("created_at", desc=True) \
            .limit(20) \
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/chat/messages/{scoped_thread_id}")
async def get_messages(scoped_thread_id: str, user: currentUser = Depends(getCurrentUser)):
    agent.ensure_graph()
    state = await agent.graph.aget_state(config={"configurable": {"thread_id": scoped_thread_id}})
    messages = state.values.get("messages", [])

    formatted = []
    for m in messages:
        if m.type == "human":
            formatted.append({"role": "user", "content": m.content})
        elif m.type == "ai":
            formatted.append({
                "role": "assistant",
                "content": m.content,
                "tool_calls": [{"id": tc["id"], "name": tc["name"], "args": tc["args"]} for tc in m.tool_calls] if hasattr(m, "tool_calls") else []
            })
        elif m.type == "tool":
            formatted.append({
                "role": "tool",
                "content": m.content,
                "tool_call_id": m.tool_call_id,
                "name": m.name
            })
        else:
            formatted.append({"role": "system", "content": m.content})
    return formatted


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user: currentUser = Depends(getCurrentUser)
):
    if not file.filename or not file.filename.lower().endswith('.docx'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .docx files are supported."
        )

    try:
        file_content = await file.read()
        result = await process_upload(
            file_bytes=file_content,
            file_name=file.filename,
            user_id=user.id,
            supabase_client=supabaseClient
        )
        return result
    except Exception as e:
        log.exception(f"Upload processing failed for user {user.id}")
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}"
        )


if __name__ == "__main__":
    import asyncio, uvicorn

    config = uvicorn.Config(app, host="127.0.0.1", port=8000)
    server = uvicorn.Server(config)

    asyncio.run(server.serve(), loop_factory=asyncio.SelectorEventLoop)