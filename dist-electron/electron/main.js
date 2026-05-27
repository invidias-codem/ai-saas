"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const store_1 = require("./store");
const GoIOHarness_1 = require("../lib/harness/GoIOHarness");
const conversationEngine_1 = require("../lib/llm/conversationEngine");
let mainWindow = null;
async function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    if (electron_1.app.isPackaged) {
        // In a packaged app, load the static HTML (we will build this later)
        // mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
        mainWindow.loadURL('http://localhost:3000'); // placeholder
    }
    else {
        // In dev, load Next.js or Vite dev server
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    }
}
electron_1.app.whenReady().then(async () => {
    // 1. Initialize Secure Vault
    await store_1.SecureVault.init();
    // 2. Setup IPC Handlers
    // Store IPC
    electron_1.ipcMain.handle('store:setApiKey', async (_, provider, key) => {
        await store_1.SecureVault.setApiKey(provider, key);
        return true;
    });
    electron_1.ipcMain.handle('store:getApiKey', async (_, provider) => {
        return await store_1.SecureVault.getApiKey(provider);
    });
    // Native Workspace Picker
    electron_1.ipcMain.handle('dialog:openDirectory', async () => {
        if (!mainWindow)
            return null;
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        return result.filePaths[0];
    });
    // Agent Invocation
    electron_1.ipcMain.handle('agent:invoke', async (event, workspacePath, query) => {
        try {
            // Setup dynamic binary path
            const exeName = process.platform === 'win32' ? 'lattice-harness.exe' : 'lattice-harness';
            let binaryPath;
            if (electron_1.app.isPackaged) {
                binaryPath = path.join(process.resourcesPath, 'bin', exeName);
            }
            else {
                binaryPath = path.join(__dirname, '..', 'go-harness', 'bin', exeName);
            }
            console.log(`[Main] Launching Go Daemon from: ${binaryPath}`);
            process.env.LATTICE_HARNESS_BINARY_PATH = binaryPath;
            // Initialize GoIOHarness with the target workspace
            const ioHarness = new GoIOHarness_1.GoIOHarness(workspacePath);
            await ioHarness.initialize();
            const streamCallback = (step) => {
                event.sender.send('agent:stream', step);
            };
            const agentRes = await (0, conversationEngine_1.generateConversationReply)({
                userId: 'local-desktop-user',
                clerkUser: null,
                request: {
                    messages: [{ role: 'user', text: query }],
                    mode: 'agentic'
                }
            }, {
                ioHarness,
                slackStreamCallback: streamCallback // Re-use the onStep property
            });
            // Read the final stream
            const reader = agentRes.stream.getReader();
            const decoder = new TextDecoder();
            let finalAnswer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                finalAnswer += decoder.decode(value, { stream: true });
            }
            ioHarness.shutdown();
            return { ok: true, result: finalAnswer };
        }
        catch (error) {
            console.error('[Agent Error]', error);
            return { ok: false, error: error.message };
        }
    });
    // Create Window
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
