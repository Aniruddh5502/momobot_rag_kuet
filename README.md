# Kuet Agent (Electron/Python RAG)

A desktop application combining an Electron wrapper with a Python backend to implement a local RAG (Retrieval-Augmented Generation) system.

## 🏗 Architecture
The system is decoupled into three layers:
- **Backend**: FastAPI server (`backend/`) handling core RAG logic and API endpoints.
- **Frontend**: Vanilla JS/HTML/CSS (`frontend/`) providing the user interface.
- **Electron Wrapper**: Manages the Python process lifecycle, OS-level secure storage for tokens, and IPC bridging via a preload script.

## 🛠 Tech Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES Modules)
- **Backend**: Python, FastAPI, LangChain/LangGraph
- **Wrapper**: Electron
- **Database**: Supabase (PostgreSQL + Vector)
- **LLM Engine**: Ollama (Local)

## 📋 Prerequisites
- **Node.js** (v18+)
- **Python 3.10+**
- **Ollama** (Running locally)
- **Supabase Account** (For vector storage)

## ⚙️ Setup & Installation

### 1. Backend Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Supabase and Ollama credentials
```

### 2. Frontend & Electron Setup
```bash
# Install Node dependencies
npm install
```

## 🚀 Execution

### Development Mode
1. **Start the Backend**: Run the FastAPI server manually.
2. **Start Electron**: 
   ```bash
   npm start
   ```

### Production Build
To package the app into a distributable:
1. **Clean existing processes**:
   ```powershell
   taskkill /F /IM KuetAgent.exe /T
   ```
2. **Compile Backend**:
   ```bash
   pip install pyinstaller
   pyinstaller momobot_backend.spec
   # Move the resulting binary to the resources folder
   mv dist/momobot_backend.exe resources/
   ```
3. **Build & Package**:
   ```bash
   npm run build
   npm run dist
   ```

## ⚠️ Current Development State
**Note**: This project is currently in active development. 
- **Known Issue**: Some UI components may be unresponsive due to ES module import conflicts in `main.js` and `config.js`.
- **Focus**: Improving the reliability of the Electron-to-Backend health check and fixing frontend event listener attachments.

## 📁 Project Structure
- `backend/`: Python source code.
- `frontend/`: HTML/JS/CSS assets.
- `electron/`: Main process (`main.js`) and preload script.
- `resources/`: Compiled backend binaries for the wrapper.
- `dist/`: Final application installers.
