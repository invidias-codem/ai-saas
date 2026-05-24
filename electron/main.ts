import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as path from 'path';
import { SecureVault } from './store';
import { GoIOHarness } from '../lib/harness/GoIOHarness';
import { generateConversationReply } from '../lib/llm/conversationEngine';

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    if (app.isPackaged) {
        // In a packaged app, load the static HTML (we will build this later)
        // mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
        mainWindow.loadURL('http://localhost:3000'); // placeholder
    } else {
        // In dev, load Next.js or Vite dev server
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(async () => {
    // 1. Initialize Secure Vault
    await SecureVault.init();

    // 2. Setup IPC Handlers
    
    // Store IPC
    ipcMain.handle('store:setApiKey', async (_, provider: 'google' | 'anthropic', key: string) => {
        await SecureVault.setApiKey(provider, key);
        return true;
    });

    ipcMain.handle('store:getApiKey', async (_, provider: 'google' | 'anthropic') => {
        return await SecureVault.getApiKey(provider);
    });

    // Native Workspace Picker
    ipcMain.handle('dialog:openDirectory', async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        return result.filePaths[0];
    });

    // Agent Invocation
    ipcMain.handle('agent:invoke', async (event, workspacePath: string, query: string) => {
        try {
            // Setup dynamic binary path
            const exeName = process.platform === 'win32' ? 'lattice-harness.exe' : 'lattice-harness';
            let binaryPath: string;
            
            if (app.isPackaged) {
                binaryPath = path.join(process.resourcesPath, 'bin', exeName);
            } else {
                binaryPath = path.join(__dirname, '..', 'go-harness', 'bin', exeName);
            }

            console.log(`[Main] Launching Go Daemon from: ${binaryPath}`);

            process.env.LATTICE_HARNESS_BINARY_PATH = binaryPath;

            // Initialize GoIOHarness with the target workspace
            const ioHarness = new GoIOHarness(workspacePath);
            await ioHarness.initialize();

            const streamCallback = (step: any) => {
                event.sender.send('agent:stream', step);
            };

            const agentRes = await generateConversationReply({
                userId: 'local-desktop-user',
                clerkUser: null as any,
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
                if (done) break;
                finalAnswer += decoder.decode(value, { stream: true });
            }

            ioHarness.shutdown();
            return { ok: true, result: finalAnswer };

        } catch (error: any) {
            console.error('[Agent Error]', error);
            return { ok: false, error: error.message };
        }
    });

    // Create Window
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
