import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import { GatewayServer } from './websocket-server';

let mainWindow: BrowserWindow | null;
let goDaemon: ChildProcess | null;
let gatewayServer: GatewayServer | null;
let localPairingToken: string = '';

const WSS_PORT = 8081;

function createDaemon() {
  // Generate the cryptographic key on boot
  localPairingToken = crypto.randomBytes(32).toString('hex');
  console.log(`[Core] Generated Secure Pairing Token: ${localPairingToken}`);

  // Resolve the path to the compiled Go daemon
  const daemonPath = path.join(
    __dirname, 
    '..', 
    'go-harness', 
    'bin', 
    `lattice-harness-${process.platform}-${process.arch}`
  );

  // Spawn the Go JSON-RPC Daemon with the injected env variable
  goDaemon = spawn(daemonPath, [], {
    env: {
      ...process.env,
      LATTICE_AUTH_TOKEN: localPairingToken,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  goDaemon.on('error', (err) => {
    console.error(`[Daemon] Failed to start Go daemon: ${err.message}`);
  });

  goDaemon.on('exit', (code) => {
    console.log(`[Daemon] Exited with code ${code}`);
  });

  // Start the WebSocket Gateway once the daemon is up
  gatewayServer = new GatewayServer(WSS_PORT, localPairingToken, goDaemon);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Setup the IPC Bridge for the React Frontend
  ipcMain.handle('get-remote-config', async () => {
    return {
      ip: gatewayServer?.getLocalIP() || '127.0.0.1',
      port: WSS_PORT,
      token: localPairingToken,
    };
  });

  // Load the Next.js app in development or production
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // In production, we'd load the static export or Next server route
    mainWindow.loadURL('http://localhost:3000');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createDaemon();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (goDaemon) {
    goDaemon.kill();
  }
});
