# Project: Electron App (Kuet Agent)

## Architecture
The application follows a decoupled architecture consisting of three main parts:
1. **Backend**: A Python-based API (`api.py`) that handles the core logic.
2. **Frontend**: A web-based UI built with HTML/CSS/JS.
3. **Electron Wrapper**: Orchestrates the backend process, manages native OS storage (encrypted tokens), and bridges the frontend to the system.

## Component Details
- **Main Process (`electron/main.js`)**: 
  - Spawns and monitors the Python backend.
  - Implements a health check loop to ensure the backend is ready before launching the UI.
  - Manages secure token storage using `electron-store` and `safeStorage`.
  - Handles IPC (Inter-Process Communication) requests from the renderer.
- **Preload Script (`electron/preload.js`)**: 
  - Exposes a safe API (`window.electronAPI`) to the frontend to communicate with the main process without compromising security.
- **Frontend (`frontend/`)**:
  - Modular JavaScript (`assets/js/`) handling authentication, chat sessions, file management, and system health checks.
  - Uses `config.js` to dynamically resolve the API URL via the Electron bridge.
  - Core pages: `index.html` (Main), `login.html`, `signup.html`, `manageFilesUI.html`.

## File Index
### Frontend
- `frontend/assets/js/auth.js`: Authentication logic & JWT handling.
- `frontend/assets/js/config.js`: API URL resolution (Web/Electron fallback).
- `frontend/assets/js/main.js`: UI Orchestration & Initialization.
- `frontend/assets/js/health.js`: Backend readiness verification.
- `frontend/assets/js/chat.js` & `sessions.js`: RAG interaction & session history.
- `frontend/assets/js/manageFiles.js`: File upload/management logic.


## Design Choices
- **Security**: `contextIsolation: true` and `nodeIntegration: false` are used in the renderer to prevent XSS attacks from accessing system-level APIs.
- **Persistence**: User tokens are encrypted using OS-level encryption before being saved to disk.
- **Reliability**: The frontend includes a health check (`health.js`) that blocks initialization if the backend is unresponsive.

## Current State & Issues
- **Observation**: The window opens, but buttons/functionality are unresponsive.
- **Probable Cause**: The frontend uses ES modules (`type="module"`), and several scripts are loaded in `index.html`. If there are runtime errors in any of the imported modules (e.g., `main.js` failing during `DOMContentLoaded`), the event listeners for buttons may never be attached.
- **Potential Conflict**: `main.js` imports `API_BASE_URL` as a constant from `config.js`, but `config.js` only exports a function `getBaseUrl`. This likely causes a `SyntaxError` or `ReferenceError` at the top level of `main.js`, killing the entire script execution before `DOMContentLoaded` triggers.
