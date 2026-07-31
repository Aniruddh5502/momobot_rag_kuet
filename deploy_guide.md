# Deployment Guide and Checklist

This document serves as the master project tracker for the transition from local development to production.

## 🚩 Project Status: In Progress
**Current Phase:** Phase 2: Infrastructure Blueprinting

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
