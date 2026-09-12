# Momobot Build & Deployment Guide

This guide outlines the process for building the fullstack desktop application from the project root.

## 🚨 Pre-Build Cleanup
Before building, ensure no instances of the application are running to avoid "File in Use" errors.
Run from root:
`taskkill /F /IM Momobot.exe /T`

---

## 🛠 Step-by-Step Build Process

### 1. Backend Compilation (Python)
The Electron wrapper expects a compiled binary in the `resources` folder.
1. Install PyInstaller: `pip install pyinstaller`
2. Build the binary: `pyinstaller momobot_backend.spec`
3. Move binary to resources: 
   - Remove the `resources` dir: `rmdir resources && mkdir resources`
   - Windows: `move dist\momobot_backend.exe resources\ && copy backend/.env resourses/.env`
   - Linux/Mac: `mv dist/momobot_backend.exe resources/`

### 2. Frontend Build (Web)
Compile the frontend assets into the production folder.
Run from root:
`npm run build`

### 3. Application Packaging (Electron)
Package the Electron wrapper, the built frontend, and the backend binary into a distributable installer.
Run from root:
`npm run dist`

---

## 📁 Directory Map
- **Root**: Run all commands here.
- **backend/**: Python source code.
- **frontend/**: Web source code.
- **resources/**: Target for `momobot_backend.exe` before packaging.
- **dist/**: Final installers and PyInstaller temporary output.
