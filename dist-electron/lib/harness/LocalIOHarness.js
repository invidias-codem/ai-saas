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
exports.LocalIOHarness = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const child_process_1 = require("child_process");
/**
 * A local implementation of the IOHarness for development and verified local execution.
 *
 * Security bounds:
 * - Enforces path locking (cannot traverse outside workspaceRoot).
 * - Caps command output sizes (512KB).
 * - Enforces strict command timeouts (30000ms).
 */
class LocalIOHarness {
    workspaceRoot;
    defaultCommandTimeoutMs = 30000;
    maxOutputBytes = 1024 * 512; // 512KB
    constructor(workspaceRoot) {
        // Normalize and resolve to an absolute path to serve as the jail root
        this.workspaceRoot = path.resolve(workspaceRoot);
    }
    async initialize() {
        try {
            const stat = await fs.stat(this.workspaceRoot);
            if (!stat.isDirectory()) {
                throw new Error('Workspace root is not a directory');
            }
        }
        catch (err) {
            throw new Error(`Failed to initialize harness: Workspace root inaccessible. ${err.message}`);
        }
    }
    /**
     * Resolves a path and ensures it does not escape the workspace.
     */
    resolveAndValidatePath(requestedPath) {
        const resolvedPath = path.resolve(this.workspaceRoot, requestedPath);
        // Check if the resolved path is strictly inside the workspace root.
        // Adding path.sep ensures we don't match partial directory names 
        // (e.g. /my-workspace vs /my-workspace-evil)
        const isInsideWorkspace = resolvedPath === this.workspaceRoot ||
            resolvedPath.startsWith(this.workspaceRoot + path.sep);
        if (!isInsideWorkspace) {
            throw new Error(`Path validation failed: ${requestedPath} escapes workspace root.`);
        }
        return resolvedPath;
    }
    async readFile(filePath) {
        try {
            const safePath = this.resolveAndValidatePath(filePath);
            const content = await fs.readFile(safePath, 'utf8');
            return { ok: true, output: content };
        }
        catch (err) {
            return {
                ok: false,
                error: `Failed to read file: ${err.message}`,
                code: 'READ_ERROR'
            };
        }
    }
    async writeFile(filePath, content) {
        try {
            const safePath = this.resolveAndValidatePath(filePath);
            // Ensure the parent directory exists before writing
            await fs.mkdir(path.dirname(safePath), { recursive: true });
            await fs.writeFile(safePath, content, 'utf8');
            return { ok: true, output: `Successfully wrote to ${filePath}` };
        }
        catch (err) {
            return {
                ok: false,
                error: `Failed to write file: ${err.message}`,
                code: 'WRITE_ERROR'
            };
        }
    }
    async patchFile(filePath, searchBlock, replaceBlock) {
        try {
            const safePath = this.resolveAndValidatePath(filePath);
            const content = await fs.readFile(safePath, 'utf8');
            const occurrences = content.split(searchBlock).length - 1;
            if (occurrences === 0) {
                return {
                    ok: false,
                    error: `Search block not found in ${filePath}`,
                    code: 'SEARCH_BLOCK_NOT_FOUND'
                };
            }
            if (occurrences > 1) {
                return {
                    ok: false,
                    error: `Multiple matches found for search block in ${filePath}. Please provide a more specific search block.`,
                    code: 'MULTIPLE_MATCHES'
                };
            }
            const newContent = content.replace(searchBlock, () => replaceBlock);
            await fs.writeFile(safePath, newContent, 'utf8');
            return { ok: true, output: `Successfully patched ${filePath}` };
        }
        catch (err) {
            return {
                ok: false,
                error: `Failed to patch file: ${err.message}`,
                code: 'PATCH_ERROR'
            };
        }
    }
    async runCommand(command, timeoutMs) {
        const timeout = timeoutMs ?? this.defaultCommandTimeoutMs;
        return new Promise((resolve) => {
            let outputBuffer = '';
            let isTruncated = false;
            let isTimedOut = false;
            let totalBytes = 0;
            // Execute command in shell to support standard pipes and operators
            const child = (0, child_process_1.spawn)(command, {
                cwd: this.workspaceRoot,
                shell: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            const handleData = (chunk) => {
                if (isTruncated)
                    return;
                totalBytes += chunk.length;
                if (totalBytes > this.maxOutputBytes) {
                    isTruncated = true;
                    const allowedBytes = chunk.length - (totalBytes - this.maxOutputBytes);
                    outputBuffer += chunk.toString('utf8', 0, allowedBytes);
                    outputBuffer += '\n...[OUTPUT TRUNCATED DUE TO SIZE LIMIT]...\n';
                    // Aggressively kill process to prevent further spam/DOS
                    child.kill('SIGKILL');
                }
                else {
                    outputBuffer += chunk.toString('utf8');
                }
            };
            if (child.stdout)
                child.stdout.on('data', handleData);
            if (child.stderr)
                child.stderr.on('data', handleData);
            const timer = setTimeout(() => {
                if (isTruncated)
                    return; // Already handled by size limit
                isTimedOut = true;
                outputBuffer += '\n...[OUTPUT TRUNCATED DUE TO TIMEOUT]...\n';
                child.kill('SIGKILL'); // Aggressively kill
            }, timeout);
            child.on('close', (code, signal) => {
                clearTimeout(timer);
                const meta = {
                    code: code ?? undefined,
                    signal: signal ?? undefined,
                    isTruncated,
                    isTimedOut
                };
                const trimmedOutput = outputBuffer.trim();
                if (code === 0 && !isTimedOut && !isTruncated) {
                    resolve({
                        ok: true,
                        output: trimmedOutput || 'Command completed successfully with no output.',
                        meta
                    });
                }
                else {
                    let reason = `Command failed with code ${code}`;
                    if (isTimedOut)
                        reason = 'Command timed out';
                    else if (isTruncated)
                        reason = 'Command terminated due to output size limit';
                    else if (signal)
                        reason = `Command terminated by signal ${signal}`;
                    resolve({
                        ok: false,
                        error: `${reason}\nOutput:\n${trimmedOutput}`,
                        code: 'COMMAND_FAILED',
                        meta
                    });
                }
            });
            child.on('error', (err) => {
                clearTimeout(timer);
                resolve({
                    ok: false,
                    error: `Failed to spawn command: ${err.message}`,
                    code: 'SPAWN_ERROR'
                });
            });
        });
    }
}
exports.LocalIOHarness = LocalIOHarness;
