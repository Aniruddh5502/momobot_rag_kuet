# Technical Transition Plan: Web to Electron Desktop Application

## 1. Process Management (Main $\leftrightarrow$ Backend)
To ensure the Python backend and Electron frontend operate as a single unit:
- **Spawning**: The Electron Main process will use `child_process.spawn` to launch the Python executable. In development, it will spawn `python backend/api.py`; in production, it will spawn the PyInstaller-generated binary located in `resources/backend/`.
- **Monitoring**: The Main process will implement a "Ready-Check" loop. It will poll the `/health` endpoint of the FastAPI server every 500ms. The application window will remain hidden or show a splash screen until the health check returns `{"overall": "healthy"}`.
- **Lifecycle Sync**: 
    - `app.on('will-quit')`: Sends a `SIGTERM` to the Python process.
    - `process.on('exit')`: A fail-safe to ensure no orphaned Python processes remain.

## 2. Communication Architecture (Bridge)
To maintain security and prevent the frontend from having direct Node.js access:
- **Preload Script**: A `preload.js` file will be used to expose a limited, secure API to the renderer.
- **Context Bridge**: 
    ```javascript
    contextBridge.exposeInMainWorld('electronAPI', {
      saveToken: (token) => ipcRenderer.invoke('store-token', token),
      getToken: () => ipcRenderer.invoke('get-token'),
      getApiUrl: () => ipcRenderer.invoke('get-api-url'),
      systemInfo: () => ipcRenderer.invoke('get-system-info')
    });
    ```
- **IPC Flow**: Renderer $\to$ Preload $\to$ Main Process $\to$ OS/File System.

## 3. Security Enhancements (JWT Storage)
Current `localStorage` is vulnerable to XSS and plain-text access.
- **Migration**: The frontend will be modified to call `window.electronAPI.saveToken(token)` upon successful login.
- **SafeStorage**: The Main process will receive the token and use Electron's `safeStorage.encryptString()` to encrypt the JWT before saving it to a local configuration file (via `electron-store`).
- **Retrieval**: Upon app launch, the Main process decrypts the token using `safeStorage.decryptString()` and passes it back to the renderer via the preload bridge.

## 4. Asset Loading & API Configuration
- **Asset Loading**: Assets will be loaded using the `file://` protocol via `mainWindow.loadFile('frontend/index.html')`.
- **Dynamic API URL**: 
    - Remove the hardcoded `API_BASE_URL` from `config.js`.
    - The Main process will determine the port (default 8000) and provide it to the renderer via `window.electronAPI.getApiUrl()`.
    - This allows the app to dynamically switch ports if 8000 is occupied.

## 5. Distribution & Packaging
- **Bundling Tool**: `electron-builder` will be used for creating installers (.exe, .dmg, .deb).
- **Python Bundling**: 
    - The backend will be frozen using **PyInstaller** into a single-file executable.
    - The resulting binary will be placed in the `extraResources` folder of the Electron build configuration.
- **Ollama Dependency**: Since Ollama is a heavy external dependency, the installer will include a "Dependency Check" on first run, guiding the user to install Ollama if not detected via the `/health` check.

## 6. Risk Assessment
| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Python Portability** | High | Build PyInstaller binaries on each target OS (Windows/Mac/Linux) using CI/CD. |
| **Port Collisions** | Medium | Implement a port-scanning mechanism in Main to find an available port and notify the backend via CLI arguments. |
| **OS Permissions** | Medium | Request necessary permissions (e.g., file system access) via Electron's manifest. |
| **Ollama Versioning** | Low | Include a version check in the `/health` endpoint to ensure compatibility. |

---

## Implementation Roadmap

### Phase 1: Infrastructure (Week 1)
- [ ] Setup Electron boilerplate.
- [ ] Implement `preload.js` and `contextBridge`.
- [ ] Configure `child_process` spawning for the Python backend.

### Phase 2: Security & State (Week 2)
- [ ] Implement `safeStorage` for JWT encryption.
- [ ] Replace `localStorage` calls in `auth.js` with `electronAPI` calls.
- [ ] Implement the Dynamic API URL discovery.

### Phase 3: Packaging & Distribution (Week 3)
- [ ] Create PyInstaller build script for the backend.
- [ ] Configure `electron-builder` with `extraResources`.
- [ ] Test installers on clean OS environments.

---

## Proposed Folder Structure
```text
project-root/
├── backend/                # Existing FastAPI code
│   └── ...
├── frontend/               # Existing Vanilla JS code
│   └── ...
├── electron/               # NEW: Electron Core
│   ├── main.js             # Main process logic
│   ├── preload.js          # Context bridge
│   ├── store.js            # safeStorage wrapper
│   └── package.json        # Electron dependencies
├── resources/              # Bundled binaries
│   └── backend_bin/        # PyInstaller output
├── build/                  # electron-builder output
└── package.json            # Root build scripts
```

---

## Verification Checklist
- [ ] **Cold Boot**: Does the app wait for the backend `/health` check before showing the UI?
- [ ] **Auth Persistence**: Does the app remember the user after restart using `safeStorage`?
- [ ] **Process Cleanup**: Is the Python process killed immediately when the Electron window is closed?
- [ ] **File Uploads**: Do `.docx` uploads still work through the Electron $\to$ FastAPI bridge?
- [ ] **Ollama Connectivity**: Does the app correctly report "unhealthy" if Ollama is not running?
- [ ] **Installer**: Does the `.exe` install and run on a machine without Python installed?
