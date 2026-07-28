# backend.py
import os
import json
import httpx
from contextlib                         import asynccontextmanager
from fastapi                            import FastAPI, Depends, Header, HTTPException, status
from fastapi.responses                  import StreamingResponse
from fastapi.middleware.cors            import CORSMiddleware
from pydantic                           import BaseModel, EmailStr
from dotenv                             import load_dotenv
load_dotenv()

from agent                              import RAGAgent
from auth                               import get_current_user, CurrentUser
from db                                 import get_checkpointer_context  # Import the context manager

# Global agent instance (initialized in lifespan)
agent = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent
    # Initialize the persistent checkpointer and pass it to the agent
    print("[LIFESPAN]   Starting up, initializing checkpointer: ")
    async with get_checkpointer_context() as checkpointer:
        print("[LIFESPAN]   Checkpointer ready, creating agent...")
        agent = RAGAgent(checkpointer=checkpointer)
        print("[LIFESPAN]  Agent initialized succesfully...")
        yield
        print("[LIFESPAN]   Shutting Down...")
        # Cleanup is handled automatically when exiting the 'async with' block

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message     : str
    thread_id   : str = "default_session"

class SignupRequest(BaseModel):
    email: EmailStr
    password: str

@app.post("/signup")
async def signup(payload: SignupRequest):
    # Domain restriction for KUET
    if not payload.email.endswith("@gmail.com"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is restricted to @kuet.ac.bd email addresses."
        )

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase configuration missing."
        )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/signup",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": "application/json",
            },
            json={
                "email": payload.email,
                "password": payload.password,
            },
        )
    
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    
    return {"status": "success", "message": "User created successfully. Please check your email for verification."}

@app.post("/chat")
async def chat(request: ChatRequest, user: CurrentUser = Depends(get_current_user)):
    print(f"[CHAT ENDPOINT]     Received Request - message: {request.message}\n\nThread ID: {request.thread_id}")
    print(f"[CHAT ENDPOINT]     Authenticated USER: {user.id}")

    if agent is None:
        print("[CHAT ENDPOINT]      ERROR: Agent is None!")
        raise HTTPException(status_code=500, detail="Agent not initialized")

    # Scope the thread_id to the user to prevent cross-user data leakage
    scoped_thread_id = f"{user.id}::{request.thread_id}"
    print(f"[CHAT ENDPOINT]      Scoped thread_id: {scoped_thread_id}")

    async def event_generator():
        print("[EVENT GENERATOR]    Starting to stream response...")
        try:
            async for chunk in agent.stream_response(request.message, scoped_thread_id):
                print(f"[EVENT GENERATOR]       GOT CHUNK: {chunk[:30] if chunk else chunk}...")
                yield f"data: {json.dumps({'content': chunk})}\n\n"
            print("[EVENT GENERATOR]    Streaming completed succesfully")
        except Exception as e:
            print(f"[EVENT GENERATOR]       ERROR: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    print("[CHAT ENDPOINT]      Returning Streaming Response")
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# --- Keep your existing endpoints below ---
ADMIN_API_KEY               =   os.environ.get("ADMIN_API_KEY")
SUPABASE_URL                =   os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY   =   os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

class InviteRequest(BaseModel):
    email: EmailStr

@app.post("/admin/invite")
async def invite_user(payload: InviteRequest, x_admin_key: str = Header(None)):
    if not ADMIN_API_KEY or x_admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin key.")
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured on the server.",
        )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/invite",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
            },
            json={"email": payload.email},
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"status": "invited", "email": payload.email}