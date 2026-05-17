import { app, BrowserWindow, shell, ipcMain } from 'electron';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { AuthManager } from './auth';
import { RelayPoller } from './poller';
import { ContextObserver } from './observer';

let mainWindow: BrowserWindow | null = null;
let poller: RelayPoller | null = null;
let observer: ContextObserver | null = null;

// PKCE State
let currentCodeVerifier: string | null = null;
let pendingDeviceId: string | null = null;

const LATTICE_API_URL = process.env.LATTICE_API_URL || 'http://localhost:3000';

// 1. Register the custom URI scheme
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('lattice', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('lattice');
}

// Ensure single instance for deep linking to work correctly on all OS
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Windows/Linux deep link handler
    const url = commandLine.pop();
    if (url?.startsWith('lattice://')) handleDeepLink(url);
  });
}

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function initiateLogin() {
  const { verifier, challenge } = generatePKCE();
  currentCodeVerifier = verifier;
  pendingDeviceId = crypto.randomUUID(); // Generate a unique ID for this installation

  const authUrl = new URL(`${LATTICE_API_URL}/app/relay-auth`);
  authUrl.searchParams.append('challenge', challenge);
  
  // Open default web browser
  await shell.openExternal(authUrl.toString());
}

// 2. macOS Deep Link Handler
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

async function handleDeepLink(urlStr: string) {
  try {
    const url = new URL(urlStr);
    if (url.hostname === 'auth') {
      const code = url.searchParams.get('code');
      
      if (code && currentCodeVerifier && pendingDeviceId) {
        await exchangeCodeForTokens(code, currentCodeVerifier, pendingDeviceId);
      }
    }
  } catch (error) {
    console.error('Invalid deep link URL:', error);
  }
}

function startBackgroundServices(userId: string, deviceId: string) {
    console.log(`[RelayClient] Starting background services for device ${deviceId}`);
    
    poller = new RelayPoller(LATTICE_API_URL, userId, deviceId);
    observer = new ContextObserver(LATTICE_API_URL, userId, deviceId);

    // Let's wire up the existing HTTP polling first.
    poller.start(3000); 
    observer.start(30000);

    // Hide the dock icon since it's a background agent
    if (app.dock) app.dock.hide();
    if (mainWindow) {
        mainWindow.close();
        mainWindow = null;
    }
}

// 3. The Exchange
async function exchangeCodeForTokens(code: string, verifier: string, deviceId: string) {
  try {
    const response = await fetch(`${LATTICE_API_URL}/api/relay/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        device_id: deviceId,
        device_name: os.hostname(),
        platform: os.platform(),
      }),
    });

    if (!response.ok) throw new Error(`Exchange failed: ${response.statusText}`);

    const data = await response.json();
    
    // Encrypt and save securely
    AuthManager.saveTokens(data.access_token, data.refresh_token, data.device_id);
    
    // Clear state
    currentCodeVerifier = null;
    
    // Notify UI / start background workers
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth-success', { deviceId: data.device_id });
    }
    
    console.log('Successfully paired device with Lattice Gateway!');
    startBackgroundServices(data.user_id, data.device_id);
    
  } catch (error) {
    console.error('Failed to exchange auth code:', error);
  }
}

app.whenReady().then(() => {
  const tokens = AuthManager.getTokens();
  
  if (!tokens) {
      mainWindow = new BrowserWindow({
        width: 400,
        height: 600,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        }
      });
      
      mainWindow.loadFile('index.html').catch(e => console.log('No index.html yet'));
      initiateLogin();
  } else {
      console.log('Already authenticated. Device ID:', tokens.deviceId);
      const userId = parseJwt(tokens.accessToken).sub;
      startBackgroundServices(userId, tokens.deviceId);
  }
});

app.on('will-quit', () => {
    if (poller) poller.stop();
    if (observer) observer.stop();
    console.log('[RelayClient] Shutting down');
});

function parseJwt(token: string) {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    } catch (e) {
        return { sub: 'unknown_user' };
    }
}
