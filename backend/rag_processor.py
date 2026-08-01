# rag_processor.py
import os
import json
import tempfile
import logging
import asyncio
import httpx

from typing                         import List, Dict, Any
from llama_cloud import LlamaCloud
from langchain_text_splitters       import RecursiveCharacterTextSplitter
from supabase                       import Client
from docx                           import Document
import io
from config import settings

logger = logging.getLogger(__name__)

_http_client = None

def get_http_client() -> httpx.AsyncClient:
    """Returns a singleton httpx.AsyncClient for reusing connections."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT)
    return _http_client

def _parse_text_like(file_bytes: bytes) -> str:
    """Handles .txt and .md files via simple decoding."""
    try:
        return file_bytes.decode('utf-8')
    except UnicodeDecodeError:
        return file_bytes.decode('latin-1', errors="ignore")

def _parse_docx(file_bytes: bytes) -> str:
    """Handles .docx files using python-docx."""
    doc = Document(io.BytesIO(file_bytes))
    return "\n".join([para.text for para in doc.paragraphs])

def _parse_heavy(file_bytes: bytes, file_name: str) -> str:
    """Handles complex files (PDF, PPTX) using LlamaCloud."""
    client = LlamaCloud() # reads LLAMA_CLOUD_API_KEY
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file_name)[1]) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name
    try:
        file = client.files.create(file=tmp_path, purpose="parse")
        result = client.parsing.parse(
            file_id=file.id, 
            tier="agentic", 
            version="latest", 
            expand=["markdown"]
        )
        
        pages_with_markers = []
        for i, page in enumerate(result.markdown.pages, start=1):
            pages_with_markers.append(f"--- Page {i} ---\n{page.markdown}")
            
        full_markdown = "\n\n".join(pages_with_markers)
        return full_markdown
    finally:
        os.unlink(tmp_path)

def parse_file(file_bytes: bytes, file_name: str) -> str:
    """Dispatcher that routes files to the appropriate parser based on extension."""
    ext = os.path.splitext(file_name)[1].lower()
    if ext in [".txt", ".md"]:
        return _parse_text_like(file_bytes)
    if ext == ".docx":
        return _parse_docx(file_bytes)
    return _parse_heavy(file_bytes, file_name)

def chunk_text(text: str, chunk_size: int = 1200, overlap: int = 100) -> List[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return splitter.split_text(text)

async def embed_single_chunk(client: httpx.AsyncClient, chunk: str) -> List[float]:
    """Helper for concurrent embedding requests."""
    response = await client.post(
        settings.OLLAMA_URL,
        json={"model": settings.OLLAMA_EMBEDDING_MODEL, "prompt": chunk},
        timeout=settings.OLLAMA_TIMEOUT
    )
    response.raise_for_status()
    return response.json()["embedding"]

async def embed_chunks_async(chunks: List[str]) -> List[List[float]]:
    """
    Embeds chunks concurrently using httpx.
    Limits concurrency via Semaphore to prevent Ollama overload.
    Implements a simple retry mechanism for transient failures.
    """
    if not chunks:
        return []

    semaphore = asyncio.Semaphore(10) 

    client = get_http_client()
    async def wrapped_call(chunk, attempt=1):
        async with semaphore:
            try:
                return await embed_single_chunk(client, chunk)
            except Exception as e:
                if attempt < 3: # Retry up to 3 times
                    logger.warning(f"[EMBED] Attempt {attempt} failed for chunk: {e}. Retrying...")
                    return await wrapped_call(chunk, attempt + 1)
                raise e
        
        tasks = [wrapped_call(chunk) for chunk in chunks]
        embeddings = await asyncio.gather(*tasks, return_exceptions=True)
        
        results = []
        for i, res in enumerate(embeddings):
            if isinstance(res, Exception):
                logger.error(f"[EMBED] Permanent failure on chunk {i+1} after retries: {res}")
                raise res
            results.append(res)
            
        return results

async def process_upload(file_bytes: bytes, file_name: str, user_id: str, supabase_client: Client) -> Dict[str, Any]:
    logger.info(f"Processing upload: {file_name} for user {user_id}")
    document_id = None

    try:
        # 1. Parse (CPU/Network Bound)
        markdown = await asyncio.to_thread(parse_file, file_bytes, file_name)
        
        # 2. Insert document (Defensive)
        doc_data = {
            "user_id": user_id,
            "file_name": file_name,
            "file_type": os.path.splitext(file_name)[1][1:],
            "markdown_content": markdown,
        }
        
        doc_result = await asyncio.to_thread(lambda: supabase_client.table("documents").insert(doc_data).execute())
        
        if not doc_result.data or len(doc_result.data) == 0:
            raise RuntimeError("Failed to create document record in Supabase")
            
        document_id = doc_result.data[0]["id"]

        # 3. Chunk
        chunks = chunk_text(markdown)
        if not chunks:
            logger.warning(f"No text extracted from {file_name}, skipping chunk insertion.")
            return {"document_id": document_id, "chunk_count": 0}

        # 4. Embed (CONCURRENT + SEMAPHORE)
        embeddings = await embed_chunks_async(chunks)

        # 5. Insert chunks
        chunk_records = [
            {
                "document_id": document_id,
                "chunk_index": i,
                "content": chunk,
                "embedding": emb,
            }
            for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
        ]
        
        await asyncio.to_thread(lambda: supabase_client.table("document_chunks").insert(chunk_records).execute())

        logger.info(f"Document {document_id} stored with {len(chunks)} chunks.")
        return {"document_id": document_id, "chunk_count": len(chunks)}

    except Exception as e:
        logger.exception(f"Critical failure during upload of {file_name}: {e}")
        
        # --- COMPENSATING TRANSACTION (Undo) ---
        if document_id:
            logger.info(f"Cleaning up ghost document and associated chunks {document_id} due to failure...")
            try:
                # Delete associated chunks first (prevent orphan vectors)
                await asyncio.to_thread(lambda: supabase_client.table("document_chunks").delete().eq("document_id", document_id).execute())
                # Delete the document record
                await asyncio.to_thread(lambda: supabase_client.table("documents").delete().eq("id", document_id).execute())
            except Exception as cleanup_err:
                logger.error(f"Cleanup failed for document {document_id}: {cleanup_err}")
        
        raise e

async def query_knowledge_base_async(query: str, supabase_client: Client, top_k: int = 5) -> str:
    """Async version of knowledge base query."""
    client = get_http_client()
    response = await client.post(
        settings.OLLAMA_URL,
        json={"model": settings.OLLAMA_EMBEDDING_MODEL, "prompt": query},
        timeout=settings.OLLAMA_TIMEOUT // 2 
    )
    response.raise_for_status()
    query_embedding = response.json()["embedding"]

    # Wrap blocking RPC call in thread
    result = await asyncio.to_thread(
        lambda: supabase_client.rpc(
            "match_documents_global",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.5,
                "match_count": top_k
            }
        ).execute()
    )

    if not result.data:
        return "No relevant documents found in the knowledge base."

    chunks = []
    for row in result.data:
        chunks.append({
            "chunk_id": row["chunk_id"],
            "document_id": row["document_id"],
            "file_name": row["file_name"],
            "content": row["chunk_content"],
            "similarity": row["similarity"]
        })

    return json.dumps(chunks, ensure_ascii=False)
