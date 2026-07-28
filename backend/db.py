# db.py
import os
from dotenv import load_dotenv
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from contextlib import asynccontextmanager
import psycopg

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")

@asynccontextmanager
async def get_checkpointer_context():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is not set. Check your .env file.")
    
    async with AsyncPostgresSaver.from_conn_string(DATABASE_URL) as checkpointer:
        try:
            await checkpointer.setup()
        except psycopg.errors.DuplicatePreparedStatement:
            # The tables already exist, this is fine.
            pass
        yield checkpointer