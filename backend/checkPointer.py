import os, logging, asyncio, sys
from dotenv                                 import load_dotenv
from langgraph.checkpoint.postgres.aio      import AsyncPostgresSaver
from contextlib                             import asynccontextmanager
from psycopg_pool                           import AsyncConnectionPool
from psycopg.rows                           import dict_row
load_dotenv()

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger(__name__)

DATABASE_URL        =   os.environ.get("DATABASE_URL")

@asynccontextmanager
async def getCheckpointerContext():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE URL not in the env file.")
    
    log.info("DATABASE_URL acquired from .env")
    
    # Connection pools configurations
    connection_kwargs = {
        "autocommit"        :   True,
        "row_factory"       :   dict_row,
        "prepare_threshold" :   None,       # disables prepared statements
    }
    async with AsyncConnectionPool(
        conninfo=DATABASE_URL,
        min_size=1,
        max_size=10,
        kwargs=connection_kwargs,
    ) as pool:
        # Pass the pool directly to the AsyncProgressSaver
        checkpointer = AsyncPostgresSaver(pool)
        try:
            await checkpointer.setup()
            log.info("Checkpointer setup succesfull")
        except Exception as e:
            log.info("Checkpointer setup failed")
            # ignore errors if tables already exists
            if "already exists" not in str(e).lower():
                raise
        yield checkpointer