# KUET RAG Assistant

A professional, agentic RAG (Retrieval-Augmented Generation) application designed to provide intelligent, context-aware conversations. The system leverages a stateful agentic loop to handle multi-turn dialogues and is integrated with a robust authentication system and a modern frontend.

## 🚀 Features

### ✅ Completed
- **User Authentication**: Secure Sign-up, Sign-in, and Sign-out functionality integrated via Supabase.
- **Multi-turn Chat**: Stateful conversations using thread-based memory, allowing the agent to remember context across a session.
- **Agentic Workflow**: A backend powered by LangGraph, utilizing a state-machine approach to manage LLM interactions and tool calling.
- **Real-time Streaming**: Server-Sent Events (SSE) implementation for a fluid, token-by-token response experience in the UI.
- **Modern Frontend**: A responsive, theme-aware (Light/Dark mode) interface built with Vanilla JavaScript and CSS3.

### ⏳ Under Development
- **Retrieval Pipeline**: Implementing high-performance vector search for domain-specific knowledge retrieval.
- **Indexing System**: Automated document ingestion and indexing into a vector database (e.g., ChromaDB or Pinecone).

## 📂 Project Structure

```text
.
├── backend/                 # FastAPI Backend
│   ├── agent.py             # Core RAG Agent logic and state graph
│   ├── auth.py              # Authentication middleware and user verification
│   ├── backend.py           # Main FastAPI application and API endpoints
│   ├── db.py                # Database connectivity and session checkpointer
│   └── tests/               # Backend test suite
├── frontend/                # Vanilla JS Frontend
│   ├── index.html           # Main entry point
│   ├── app.js               # Application orchestration
│   ├── auth.js              # Authentication logic and session management
│   ├── chat.js              # Chat interface and message handling
│   ├── style.css           # Global styles and theming
│   └── tests/               # Frontend test suite (Vitest)
├── supabase/                # Database Configuration
│   └── schema.sql           # Database schema definitions and migrations
└── requirements.txt         # Python dependencies
```

## 🛠️ Installation & Setup

### Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   pip install -r ../requirements.txt
   ```
3. Create a `.env` file in the `backend/` folder with the following variables:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ADMIN_API_KEY=your_admin_key
   ```
4. Run the server:
   ```bash
   uvicorn backend:app --reload
   ```

### Frontend
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Open `index.html` in a browser or serve it using a live server.

## ⚙️ Technical Stack
- **Backend**: Python, FastAPI, LangGraph, LangChain, Ollama.
- **Frontend**: HTML5, CSS3, Vanilla JavaScript.
- **Database & Auth**: Supabase (PostgreSQL).
- **Testing**: Pytest (Backend), Vitest (Frontend).

## License
This project is proprietary. All rights reserved. This repository is available for portfolio demonstration purposes only.
