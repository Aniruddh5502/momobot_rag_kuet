# db.py
import os
from dotenv import load_dotenv
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from contextlib import asynccontextmanager

# Load environment variables from .env file
load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")

@asynccontextmanager
async def get_checkpointer_context():
    """
    Context manager for the LangGraph Postgres checkpointer.
    Ensures proper setup and teardown of the connection pool.
    """
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is not set. Check your .env file.")
    
    # Enter the async context manager
    async with AsyncPostgresSaver.from_conn_string(DATABASE_URL) as checkpointer:
        # ⚠️ CRUCIAL: This creates the required tables (checkpoints, checkpoint_blobs, checkpoint_writes)
        await checkpointer.setup()
        yield checkpointer