import os, io, logging, asyncio, httpx, mammoth, uuid
from dotenv                             import load_dotenv
from supabase                           import AsyncClient, create_async_client
from typing                             import Dict, Any, List
from auth                               import getCurrentUser
from langchain_text_splitters           import RecursiveCharacterTextSplitter
load_dotenv()
logger = logging.getLogger(__name__)
_http_client = None

OLLAMA_URL              =       os.environ.get("OLLAMA_URL")
OLLAMA_EMBEDDING_MODEL  =       os.environ.get("OLLAMA_EMBEDDING_MODEL")
OLLAMA_TIMEOUT          =       os.environ.get("OLLAMA_TIMEOUT")

SUPABASE_URL            =       os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY  =    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")


def get_http_client()->httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        timeout = int(OLLAMA_TIMEOUT)
        _http_client = httpx.AsyncClient(timeout=timeout)
    return _http_client



async def queryKnowledgebaseAsync(query: str, supabase_client: Any) -> str:
    """
    Embeds a query and searches the Supabase knowledgebase using the RPC match_documents_global.
    """
    logger.info(f"Querying knowledgebase globally for: {query}")
    try:
        # 1. Embed the query
        client = get_http_client()
        response = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": OLLAMA_EMBEDDING_MODEL, "prompt": query}
        )
        response.raise_for_status()
        query_embedding = response.json()["embedding"]

        # 2. Call the global RPC function
        result = await supabase_client.rpc(
            "match_documents_global",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.5,
                "match_count": 5
            }
        ).execute()

        documents = result.data
        if not documents:
            return "No relevant documents found in the knowledgebase."

        # 3. Format the results for the LLM
        formatted_results = []
        for doc in documents:
            formatted_results.append(
                f"Source: {doc['file_name']} (Page {doc['page_num']})\n"
                f"Similarity: {doc['similarity']:.4f}\n"
                f"Content: {doc['text_content']}\n"
                "---"
            )

        return "\n\n".join(formatted_results)

    except Exception as e:
        logger.exception(f"Error during knowledgebase query: {e}")
        return f"An error occurred while searching the knowledgebase: {str(e)}"


async def process_upload(file_bytes:bytes, file_name:str, user_id:str, supabase_client:AsyncClient)->Dict[Any, Any]:
    logger.info(f"Processing upload: {file_name} for user {user_id}")
    
    try:
        logger.info(f"Starting process: ")
        # Mammoth.convert_to_markdown returns a Result object (tuple/object)
        # We need the actual text content from it.
        result = await asyncio.to_thread(mammoth.convert_to_markdown, io.BytesIO(file_bytes))
        md_content = result.value if hasattr(result, 'value') else result[0] if isinstance(result, (list, tuple)) else str(result)
        
        # storage -> use user_id and filename for a clean path
        document_id     =   uuid.uuid4()
        storage_path_docx = f"{user_id}/{document_id}/{file_name}"
        
        # necessary metadata for the docx
        u_id            =   user_id
        
        # uploading the file into the supabase storage
        logger.info("Uploading the docs document in 'docs' bucket.")
        await supabase_client.storage.from_('docs').upload(
            path            = storage_path_docx,
            file            = file_bytes,
            file_options    = {
                "content-type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "metadata":{
                    "file_name"     :   file_name,
                    "document_id"   :   str(document_id),
                    "user_id"       :   user_id
                }
            }
        )

        # now chunking the contents
        text         :  str   =       md_content
        chunk_size   :  int   =       1000
        overlap      :  int   =       100
        splitters    :  RecursiveCharacterTextSplitter = RecursiveCharacterTextSplitter(
            chunk_size      =       chunk_size,
            chunk_overlap   =       overlap,
            separators      =       ["\n\n","\n",". "," ",""],
        )
        # this is a list of the chunks
        text_chunks :   List[str] = splitters.split_text(text)
        
        # Now we embed them using ollama model
        if not text_chunks:
            return {"status": "empty", "chunk_count": 0}
        
        client = get_http_client()
        embeddings = []
        batch_size = 10
        
        for i in range(0, len(text_chunks), batch_size):
            batch = text_chunks[i : i + batch_size]
            logger.info(f"Embedding batch {i // batch_size + 1} (chunks {i} to {i + len(batch)})")
            
            async def wrapped_call(chunk, attempt=1):
                try:
                    response = await client.post(
                        f"{OLLAMA_URL}/api/embeddings",
                        json={"model": OLLAMA_EMBEDDING_MODEL, "prompt": chunk}
                    )
                    response.raise_for_status()
                    return response.json()["embedding"]
                except Exception as e:
                    if attempt < 3:
                        return await wrapped_call(chunk, attempt + 1)
                    raise e

            # Process each batch concurrently, but only the batch size
            batch_tasks = [wrapped_call(chunk) for chunk in batch]
            batch_results = await asyncio.gather(*batch_tasks)
            embeddings.extend(batch_results)
        
        # after embedding is done we need to upload them in the table
        embedding_records = [
            {
                "file_id"   :   str(document_id),
                "user_id"       :   u_id,
                "file_name"     :   file_name,
                "embedding"     :   embedding,
                "text_content"   :   chunk,
                "page_num"      :   i+1,
            }
            for i, (chunk, embedding) in enumerate(zip(text_chunks, embeddings))
        ]
        # insert the records
        await supabase_client.table('documents').insert(embedding_records).execute()
        return {"status":"success","chunk_count":len(text_chunks)}
        
        
    except Exception as e:
        logger.exception(f"Critical failure during upload of {file_name}: {e}")
        return {"status": "error", "message": str(e)}
