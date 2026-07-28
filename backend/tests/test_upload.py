# tests/test_upload.py
import os
import pytest
from fastapi.testclient import TestClient
from backend import app, get_current_user
from auth import CurrentUser

# Override the auth dependency to bypass authentication
def mock_get_current_user():
    return CurrentUser(id="620c0728-44ce-494a-84d7-ee1c2fd63109", email="aniruddh5502@gmail.com")

app.dependency_overrides[get_current_user] = mock_get_current_user

client = TestClient(app)

# Path to a test file (you need to create this file)
TEST_FILE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "sample.pdf")
# If you don't have a PDF, create a small text file for testing (bypass LlamaParse)
# For simplicity, we'll test with a TXT file first to verify the pipeline without LlamaParse
# LlamaParse expects files like PDF/DOCX; we'll create two tests: one with TXT (mock) and one with PDF.

@pytest.fixture
def test_file_txt():
    # Create a temporary text file
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w+", suffix=".txt", delete=False) as f:
        f.write("This is a test document.\nIt has multiple lines.\nAnd some content for chunking.")
        return f.name

    
def test_upload_txt(test_file_txt):
    with open(test_file_txt, "rb") as f:
        response = client.post(
            "/upload",
            files={"file": ("test.txt", f, "text/plain")}
        )
    print("Status:", response.status_code)
    print("Body:", response.text)
    assert response.status_code == 200
    data = response.json()
    assert "document_id" in data


def test_upload_pdf():
    pdf_path = os.path.join(os.path.dirname(__file__), "fixtures", "test.pdf")
    if not os.path.exists(pdf_path):
        pytest.skip("Test file not found")
    with open(pdf_path, "rb") as f:
        response = client.post(
            "/upload",
            files={"file": ("test.pdf", f, "application/pdf")}
        )
    assert response.status_code == 200
    data = response.json()
    assert "document_id" in data
    assert "chunk_count" in data
    assert data["chunk_count"] > 0

# Isolate parser, chunker, embedder using local calls (not via API)
from rag_processor import parse_file, chunk_text, embed_chunks

def test_parse_file():
    if not os.path.exists(TEST_FILE_PATH):
        pytest.skip("No test PDF file")
    with open(TEST_FILE_PATH, "rb") as f:
        content = f.read()
        markdown = parse_file(content, "sample.pdf")
        assert isinstance(markdown, str)
        assert len(markdown) > 10

def test_chunk_text():
    text = "This is a test. " * 50
    chunks = chunk_text(text, chunk_size=100, overlap=20)
    assert len(chunks) > 0
    assert all(isinstance(c, str) for c in chunks)

def test_embed_chunks():
    chunks = ["Hello world", "Testing embeddings"]
    embeddings = embed_chunks(chunks)
    assert len(embeddings) == 2
    # Check dimension (should match 768 for nomic-embed-text)
    assert len(embeddings[0]) == 768  # or whatever your Ollama model outputs