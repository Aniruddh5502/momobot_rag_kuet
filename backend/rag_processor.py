# rag_processor.py
import os
import json
import tempfile
import logging
import requests

from typing                         import List, Dict, Any
from llama_parse                    import LlamaParse
from langchain_text_splitters       import RecursiveCharacterTextSplitter
from supabase                       import Client
from docx                           import Document
import io

logger = logging.getLogger(__name__)

OLLAMA_EMBEDDING_MODEL = os.environ.get("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/embeddings")

def _parse_text_like(file_bytes: bytes) -> str:
    """Handles .txt and .md files via simple decoding."""
    try:
        return file_bytes.decode('utf-8')
    except UnicodeDecodeError:
        # Fallback to latin-1 if utf-8 fails
        return file_bytes.decode('latin-1', errors="ignore")

def _parse_docx(file_bytes: bytes) -> str:
    """Handles .docx files using python-docx."""
    doc = Document(io.BytesIO(file_bytes))
    return "\n".join([para.text for para in doc.paragraphs])

def _parse_heavy(file_bytes: bytes, file_name: str) -> str:
    """Handles complex files (PDF, PPTX) using LlamaParse."""
    api_key = os.environ.get("LLAMA_CLOUD_API_KEY")
    if not api_key:
        raise ValueError("LLAMA_CLOUD_API_KEY environment variable not set.")

    parser = LlamaParse(api_key=api_key, result_type="markdown")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file_name)[1]) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name
    try:
        documents = parser.load_data(tmp_path)
        full_markdown = "\n\n".join(doc.text for doc in documents)
        return full_markdown
    finally:
        os.unlink(tmp_path)

def parse_file(file_bytes: bytes, file_name: str) -> str:
    """
    Dispatcher that routes files to the appropriate parser based on extension.
    """
    ext = os.path.splitext(file_name)[1].lower()
    
    # 1. Simple text-based files
    if ext in [".txt", ".md"]:
        return _parse_text_like(file_bytes)
    
    # 2. Word documents
    if ext == ".docx":
        return _parse_docx(file_bytes)
    
    # 3. Complex documents (PDF, PPTX, etc.)
    # We treat everything else as "heavy" provided it's in our allowed list
    return _parse_heavy(file_bytes, file_name)

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return splitter.split_text(text)


def embed_chunks(chunks: List[str]) -> List[List[float]]:
    embeddings = []
    for i, chunk in enumerate(chunks):
        print(f"[EMBED] Embedding chunk {i+1}/{len(chunks)}...")
        try:
            response = requests.post(
                OLLAMA_URL,
                json={"model": OLLAMA_EMBEDDING_MODEL, "prompt": chunk},
                timeout=120                         # increased from 30
            )
            response.raise_for_status()
            embedding = response.json()["embedding"]
            embeddings.append(embedding)
            print(f"[EMBED] Chunk {i+1} done (dim {len(embedding)})")
        except Exception as e:
            print(f"[EMBED] Error on chunk {i+1}: {e}")
            raise
    return embeddings


async def process_upload( file_bytes: bytes, file_name: str, user_id: str, supabase_client: Client) -> Dict[str, Any]:

    logger.info(f"Processing upload: {file_name} for user {user_id}")

    markdown = parse_file(file_bytes, file_name)    # 1. Parse
    doc_data = {                                    # 2. Insert document
        "user_id": user_id,
        "file_name": file_name,
        "file_type": os.path.splitext(file_name)[1][1:],
        "markdown_content": markdown,
    }
    doc_result = supabase_client.table("documents").insert(doc_data).execute()
    document_id = doc_result.data[0]["id"]

    chunks = chunk_text(markdown)                   # 3. chunk
    embeddings = embed_chunks(chunks)               # 4. Embed
    chunk_records = [                               # 5. Insert chunks
        {
            "document_id": document_id,
            "chunk_index": i,
            "content": chunk,
            "embedding": emb,
        }
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
    ]
    supabase_client.table("document_chunks").insert(chunk_records).execute()

    logger.info(f"Document {document_id} stored with {len(chunks)} chunks.")
    return {"document_id": document_id, "chunk_count": len(chunks)}



def query_knowledge_base(query: str, supabase_client: Client, top_k: int = 5) -> str:
    """
    Search all documents and return a JSON‑encoded list of relevant chunks.
    Each chunk includes: chunk_id, document_id, file_name, content, similarity.
    The LLM should cite chunks using the index in this list (1‑based).
    """
    # 1. Embed query
    response = requests.post(
        OLLAMA_URL,
        json={"model": OLLAMA_EMBEDDING_MODEL, "prompt": query},
        timeout=60
    )
    response.raise_for_status()
    query_embedding = response.json()["embedding"]

    # 2. Call the global search function
    result = supabase_client.rpc(
        "match_documents_global",
        {
            "query_embedding": query_embedding,
            "match_threshold": 0.5,
            "match_count": top_k
        }
    ).execute()

    print(f"[TOOL] Retrieved {result.data} chunks with similarities:")
    for row in result.data:
        print(f"  - similarity: {row['similarity']:.3f}, file: {row['file_name']}")

    if not result.data:
        return "No relevant documents found in the knowledge base."

    # 3. Build structured list
    chunks = []
    for row in result.data:
        chunks.append({
            "chunk_id": row["chunk_id"],
            "document_id": row["document_id"],
            "file_name": row["file_name"],
            "content": row["chunk_content"],
            "similarity": row["similarity"]
        })

    # 4. Return as JSON string
    return json.dumps(chunks, ensure_ascii=False)
