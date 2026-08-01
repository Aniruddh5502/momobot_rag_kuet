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
from fastapi                            import File, UploadFile
load_dotenv()

from agent                              import RAGAgent
from auth                               import get_current_user, CurrentUser
from db                                 import get_checkpointer_context  # Import the context manager
from rag_processor                      import process_upload
from fastapi                            import File, UploadFile
from supabase                           import create_client
import logging
from logger import setup_logging, get_logger

setup_logging()
logger = get_logger(__name__)


# Global agent instance (initialized in lifespan)
agent = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent
    # Initialize the persistent checkpointer and pass it to the agent
    logger.info("Starting up, initializing checkpointer...")
    async with get_checkpointer_context() as checkpointer:
        logger.info("Checkpointer ready, creating agent...")
        agent = RAGAgent(checkpointer=checkpointer)
        logger.info("Agent initialized successfully...")
        yield
        logger.info("Shutting down...")
        # Cleanup is handled automatically when exiting the 'async with' block

# Load CORS origins from .env
CORS_ORIGINS_STR = os.environ.get("CORS_ALLOWED_ORIGINS", "*")
# Handle both comma-separated strings and single "*"
CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS_STR.split(",")] if CORS_ORIGINS_STR != "*" else ["*"]

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True if "*" not in CORS_ORIGINS else False,
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
    if not payload.email.endswith("@kuet.ac.bd"):
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
    logger.info(f"Received Request - message: {request.message}, Thread ID: {request.thread_id}")
    logger.info(f"Authenticated USER: {user.id}")

    if agent is None:
        logger.error("Agent is None!")
        raise HTTPException(status_code=500, detail="Agent not initialized")

    # Scope the thread_id to the user to prevent cross-user data leakage
    scoped_thread_id = f"{user.id}::{request.thread_id}"
    logger.info(f"Scoped thread_id: {scoped_thread_id}")

    async def event_generator():
        logger.info("Starting to stream response...")
        try:
            async for chunk in agent.stream_response(request.message, scoped_thread_id):
                # chunk is a dict: {'type': 'ai'|'tool', 'content': ...}
                yield f"data: {json.dumps(chunk)}\n\n"
            logger.info("Streaming completed successfully")
        except Exception as e:
            logger.error(f"Event generator error: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    logger.info("Returning Streaming Response")
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# --- Keep your existing endpoints below ---
ADMIN_API_KEY               =   os.environ.get("ADMIN_API_KEY")
SUPABASE_URL                =   os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY   =   os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


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


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user)
):
    """
    Upload a file, parse it to Markdown, chunk, embed, and store in Supabase.
    """
    # 1. Validate file extension
    allowed_extensions = {"pdf", "docx", "txt", "md", "pptx"}
    ext = file.filename.split(".")[-1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(allowed_extensions)}"
        )

    # 2. Read file content
    content = await file.read()

    try:
        # 3. Process the file (parse, chunk, embed, store)
        result = await process_upload(
            file_bytes=content,
            file_name=file.filename,
            user_id=user.id,
            supabase_client=supabase_client
        )
        return result
    except Exception as e:
        logger.exception(f"Upload processing failed for user {user.id}")
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}"
        )