# Deployment Guide and Checklist

This document serves as the master project tracker for the transition from local development to production.

## 🚩 Project Status: In Progress
**Current Phase:** Phase 1.5: Technical Debt Remediation (Critical)

---

## 🛠️ Deployment Roadmap

### Phase 1: Code Hardening & Feature Parity
*Goal: Ensure the code is robust and production-ready before touching a server.*
- [x] **1.1 Dynamic Environment Configuration**
    - Remove `http://localhost:8000` from `frontend/config.js`.
    - Implement environment-based API URL detection (Dev vs. Prod).
- [x] **1.2 Enhanced Document Parsing**
    - Audit `rag_processor.py` and `process_upload`.
    - Implement specific handlers for `.txt`, `.md`, and `.docx` to improve RAG quality.
- [x] **1.3 Input Sanitization & Prompt Security**
    - Add validation layer to `/chat` endpoint to prevent prompt injection.
    - Develop and implement a detailed, versioned System Prompt.
- [x] **1.4 Production CORS Policy**
    - Move `CORSMiddleware` from `allow_origins=["*"]` to a configurable `.env` list.

### Phase 1.5: Technical Debt Remediation (The "Senior Engineer" Fix)
*Goal: Fix catastrophic architectural flaws identified during technical critique.*
- [x] **1.5.1 Asynchronous I/O Overhaul**
    - Replace all `requests` calls with `httpx` (async).
    - Remove blocking synchronous calls from `async def` functions.
- [x] **1.5.2 Performance Optimization (Embeddings)**
    - Implement `asyncio.gather` to remove $O(N)$ latency in `embed_chunks`.
- [ ] **1.5.3 Database Integrity & Reliability**
    - Implement Manual Compensating Transactions (Undo pattern) to eliminate Ghost Documents.
    - Replace fragile `data[0]` access with defensive validation.
    - Add robust retry logic for API calls.
- [ ] **1.5.4 Security & Access Control**
    - (Design Choice: Institutional Shared DB) $\to$ RLS not required.
- [x] **1.5.5 Production Observability**
    - Replace all `print()` statements with a structured `logging` framework.
    - [x] **1.5.5a Centralize Config**: Move all `os.environ` calls into a single `config.py` using Pydantic `BaseSettings`.

### Phase 1.6: Loop Liberation (Foundation Strengthening)
*Goal: Pure async architecture. Remove all sync-async wrappers and "hacks".*
- [ ] **1.6.1 Pure Async Migration**
    - Convert `query_knowledge_base` and `embed_chunks` to pure async functions.
    - Remove `asyncio.run()` and `nest_asyncio` entirely from the codebase.
- [ ] **1.6.2 Native Async Tools**
    - Redefine LangGraph tools as `async def` to ensure non-blocking execution.
- [ ] **1.6.3 Reliability Layer**
    - Wrap LLM `ainvoke`/`astream` calls in error boundaries to prevent stream crashes.
    - Implement `asyncio.Semaphore` in embedding loops to prevent Ollama overload.

### Phase 2: Infrastructure Blueprinting
*Goal: Create the blueprints for cloud hosting.*
- [x] **2.1 Dependency Audit**
    - Pin all versions in `requirements.txt` to prevent breaking changes.
- [x] **2.2 Dockerization**
    - Create `Dockerfile` (Python slim image) for backend.
    - Create `.dockerignore` (exclude `.git`, `__pycache__`, `.env`).
- [x] **2.3 Secrets Management**
    - Audit `.gitignore` for security.
    - Create `.env.example` for cloud configuration.

### Phase 3: The Staging Deployment
*Goal: Get the app live in a test environment.*
- [ ] **3.1 Backend Deployment (Railway/Render)**
    - Connect GitHub $\rightarrow$ Inject secrets $\rightarrow$ Verify live endpoints.
- [ ] **3.2 Frontend Deployment (Vercel/Netlify)**
    - Connect GitHub $\rightarrow$ Inject `API_BASE_URL` $\rightarrow$ Verify connectivity.

### Phase 4: Final Polish & Launch
*Goal: Professionalize the user experience and secure the system.*
- [ ] **4.1 Domain & SSL**
    - Custom domain setup and HTTPS enforcement.
    - [ ] **4.2 End-to-End (E2E) Testing**
    - Full flow test: Signup $\rightarrow$ Upload $\rightarrow$ Chat $\rightarrow$ Logout.
    - [ ] **4.3 Monitoring**
    - Setup production logging for error tracking.

---

## 📝 Future Parsing Enhancements
*These are lower-priority improvements to be tackled after the initial deployment.*
- [ ] Implement advanced table extraction for complex PDFs.
- [ ] Add support for `.pptx` local extraction via `python-pptx`.
- [ ] Implement recursive directory parsing for bulk uploads.
- [ ] Add PDF OCR fallback for scanned (image-based) documents.
- [ ] Run tests for each file types.
