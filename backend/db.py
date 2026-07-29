# db.py
import os
from dotenv import load_dotenv
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from contextlib import asynccontextmanager
from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")

@asynccontextmanager
async def get_checkpointer_context():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is not set.")

    # Connection pool configuration
    connection_kwargs = {
        "autocommit": True,
        "row_factory": dict_row,
        "prepare_threshold": None,  # Disables prepared statements
    }

    async with AsyncConnectionPool(
        conninfo=DATABASE_URL,
        min_size=1,
        max_size=10,
        kwargs=connection_kwargs,
    ) as pool:
        # Pass the pool directly to AsyncPostgresSaver
        checkpointer = AsyncPostgresSaver(pool)
        try:
            await checkpointer.setup()
        except Exception as e:
            # Ignore errors if tables already exist
            if "already exists" not in str(e).lower():
                raise
        yield checkpointer