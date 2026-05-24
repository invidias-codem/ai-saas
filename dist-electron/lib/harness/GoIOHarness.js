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
exports.GoIOHarness = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
/**
 * A TypeScript IOHarness implementation that acts as an IPC client
 * to the compiled Go binary execution daemon (`go-harness/bin/lattice-harness`).
 */
class GoIOHarness {
    workspaceRoot;
    binaryPath = '';
    child = null;
    pendingRequests = new Map();
    stdoutBuffer = '';
    requestIdCounter = 0;
    constructor(workspaceRoot) {
        this.workspaceRoot = path.resolve(workspaceRoot);
    }
    async initialize() {
        // Cross-Platform Suffix Resolution: Check if on Windows
        const suffix = os.platform() === 'win32' ? '.exe' : '';
        const binaryName = `lattice-harness${suffix}`;
        // Dynamic Binary Lookup checking multiple paths
        const pathsToTry = [
            process.env.LATTICE_HARNESS_BINARY_PATH,
            path.resolve(process.cwd(), `go-harness/bin/${binaryName}`),
            path.resolve(__dirname, `../../go-harness/bin/${binaryName}`),
            path.resolve(__dirname, `../go-harness/bin/${binaryName}`),
        ].filter((p) => typeof p === 'string' && p.length > 0);
        let found = false;
        for (const p of pathsToTry) {
            try {
                await fs.access(p, fs.constants.X_OK);
                this.binaryPath = p;
                found = true;
                break;
            }
            catch {
                // Path inaccessible or not executable; try next option
            }
        }
        if (!found) {
            throw new Error(`Go harness execution binary not found or not executable. Checked paths: ${pathsToTry.join(', ')}. Please make sure it is compiled inside go-harness first.`);
        }
        // Spawn the persistent daemon
        this.child = (0, child_process_1.spawn)(this.binaryPath, [], {
            cwd: this.workspaceRoot,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        this.child.stderr?.on('data', (chunk) => {
            // Diagnostic traces routed to stderr
            process.stderr.write(`[Go Daemon Debug] ${chunk.toString('utf-8')}`);
        });
        this.child.stdout?.on('data', (chunk) => {
            this.stdoutBuffer += chunk.toString('utf-8');
            let newlineIdx;
            while ((newlineIdx = this.stdoutBuffer.indexOf('\n')) !== -1) {
                // Extract line and remove \r to prevent Windows CRLF issues
                const line = this.stdoutBuffer.substring(0, newlineIdx).trim();
                this.stdoutBuffer = this.stdoutBuffer.substring(newlineIdx + 1);
                if (line) {
                    this.handleDaemonResponse(line);
                }
            }
        });
        this.child.on('error', (err) => {
            console.error(`[Lattice OS] Failed to spawn Go harness execution bridge: ${err.message}`);
            this.cleanupPending(null);
        });
        this.child.on('close', (code) => {
            if (code !== 0 && code !== null) {
                console.warn(`[Lattice OS] Go Harness Daemon closed unexpectedly with exit code: ${code}`);
            }
            this.cleanupPending(code);
        });
    }
    handleDaemonResponse(line) {
        try {
            const response = JSON.parse(line);
            const callback = this.pendingRequests.get(response.id);
            if (callback) {
                this.pendingRequests.delete(response.id);
                if (response.error) {
                    callback({ ok: false, error: response.error.message, code: 'DAEMON_RPC_ERROR' });
                }
                else {
                    callback(response.result);
                }
            }
        }
        catch (err) {
            console.error(`[Lattice OS] Failed to decode JSON-RPC frame line: ${err.message}. Line: ${line}`);
        }
    }
    sendRequest(action, inputs) {
        return new Promise((resolve) => {
            if (!this.child || this.child.killed || !this.child.stdin?.writable) {
                return resolve({ ok: false, error: 'Harness daemon process is dead or uninitialized', code: 'DAEMON_DOWN' });
            }
            const id = `req_${++this.requestIdCounter}_${Date.now()}`;
            this.pendingRequests.set(id, resolve);
            const payload = {
                id,
                jsonrpc: "2.0",
                workspaceRoot: this.workspaceRoot,
                action,
                inputs
            };
            this.child.stdin.write(JSON.stringify(payload) + '\n');
        });
    }
    cleanupPending(exitCode) {
        for (const [id, resolve] of this.pendingRequests.entries()) {
            resolve({
                ok: false,
                error: `Harness daemon terminated with exit status: ${exitCode}. Call aborted.`,
                code: 'DAEMON_CRASH'
            });
        }
        this.pendingRequests.clear();
    }
    async readFile(filePath) {
        return this.sendRequest('read_file', { filePath });
    }
    async writeFile(filePath, content) {
        return this.sendRequest('write_file', { filePath, content });
    }
    async patchFile(filePath, searchBlock, replaceBlock) {
        return this.sendRequest('patch_file', { filePath, search_block: searchBlock, replace_block: replaceBlock });
    }
    async runCommand(command, timeoutMs) {
        return this.sendRequest('run_command', { command, timeoutMs });
    }
    shutdown() {
        if (this.child && !this.child.killed) {
            this.child.kill('SIGTERM');
        }
    }
}
exports.GoIOHarness = GoIOHarness;
