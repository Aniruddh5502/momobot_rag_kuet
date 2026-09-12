const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const Store = require('electron-store');

const store = new Store();

let mainWindow;
let backendProcess;
const BACKEND_PORT = 8000;
const API_BASE_URL = `http://127.0.0.1:${BACKEND_PORT}`;

async function startBackend() {
    console.log('Starting backend process...');

    const isPackaged = app.isPackaged;
    let binaryPath;
    let args = [];
    let options = {};

    if (isPackaged) {
        binaryPath = path.join(process.resourcesPath, 'resources', 'momobot_backend.exe');
        // Set working directory to the binary's folder so .env is found
        options = { cwd: path.dirname(binaryPath) };
        console.log(`Production mode: Spawning binary at ${binaryPath} with cwd ${options.cwd}`);
    } else {
    // Development: Use the local python environment
    binaryPath = 'python';
    args = ['api.py'];
    options = {
        cwd: path.join(__dirname, '..', 'backend')
    };
    console.log('Development mode: Spawning python api.py');
}

backendProcess = spawn(binaryPath, args, options);

backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
});

backendProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
});

return new Promise((resolve) => {
    const poll = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 3000 });
            console.log('Health check response:', response.data);
            if (response.data.overall === 'healthy') {
                console.log('Backend is healthy! Ready to launch UI.');
                resolve(true);
                return;
            }
        } catch (e) {
            console.log('Waiting for backend to become healthy...', e.message);
        }
        setTimeout(poll, 1000);
    };
    poll();
});
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Load the frontend
    mainWindow.loadFile(path.join(__dirname, '../frontend/index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC Handlers for the Preload Bridge
ipcMain.handle('get-api-url', () => API_BASE_URL);

ipcMain.handle('store-token', (event, token) => {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('OS encryption not available');
    }
    const encrypted = safeStorage.encryptString(token);
    store.set('auth_token', encrypted.toString('base64'));
    return { success: true };
});

ipcMain.handle('get-token', () => {
    const encryptedB64 = store.get('auth_token');
    if (!encryptedB64) return null;

    const encrypted = Buffer.from(encryptedB64, 'base64');
    return safeStorage.decryptString(encrypted);
});

ipcMain.handle('clear-token', () => {
    store.delete('auth_token');
    return { success: true };
});

app.whenReady().then(async () => {
    // Launch the window immediately so the app doesn't feel "dead"
    createWindow();

    // Start the backend in the background without 'await'
    startBackend().then(() => {
        console.log('Backend successfully started in background.');
    }).catch(err => {
        console.error('Backend failed to start:', err);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    if (backendProcess) {
        console.log('Killing backend process...');
        backendProcess.kill();
    }
});
