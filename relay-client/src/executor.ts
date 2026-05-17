import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { RelayCommand, RelayCommandResult } from './types';

const execAsync = promisify(exec);

function truncateOutput(text: string | Buffer): { text: string, truncated: boolean } {
    const str = text.toString();
    if (!str || str.length <= 4000) return { text: str, truncated: false };
    
    const head = str.substring(0, 1000);
    const tail = str.substring(str.length - 3000);
    const middle = `\n... [${(str.length - 4000).toLocaleString()} CHARACTERS TRUNCATED] ...\n`;
    return { text: head + middle + tail, truncated: true };
}

export class CommandExecutor {
    async execute(command: RelayCommand): Promise<RelayCommandResult> {
        const startTime = Date.now();
        let success = true;
        let data: any = null;
        let errorMsg: string | undefined = undefined;
        let output = { stdout: '', stderr: '', exitCode: 0, truncated: false };

        try {
            switch (command.actionType) {
                case 'run_script':
                    const script = command.payload.script;
                    if (!script) throw new Error('Missing script');
                    try {
                        const res = await execAsync(script);
                        const out = truncateOutput(res.stdout);
                        const errOut = truncateOutput(res.stderr);
                        output.stdout = out.text;
                        output.stderr = errOut.text;
                        output.truncated = out.truncated || errOut.truncated;
                    } catch (e: any) {
                        // execAsync throws on non-zero exit code
                        output.exitCode = e.code || 1;
                        const out = truncateOutput(e.stdout || '');
                        const errOut = truncateOutput(e.stderr || '');
                        output.stdout = out.text;
                        output.stderr = errOut.text;
                        output.truncated = out.truncated || errOut.truncated;
                        throw new Error(`Command exited with code ${output.exitCode}`);
                    }
                    break;
                case 'notify':
                    const title = command.payload.title || 'Relay Notification';
                    const message = command.payload.message || '';
                    await execAsync(`osascript -e 'display notification "${message}" with title "${title}"'`);
                    break;
                case 'open_url':
                    const url = command.payload.url;
                    if (!url) throw new Error('Missing URL');
                    await execAsync(`open "${url}"`);
                    break;
                case 'read_file':
                    const readPath = command.payload.path;
                    if (!readPath) throw new Error('Missing file path');
                    data = await fs.readFile(readPath, 'utf8');
                    break;
                case 'write_file':
                    const writePath = command.payload.path;
                    const content = command.payload.content;
                    if (!writePath || content === undefined) throw new Error('Missing file path or content');
                    await fs.writeFile(writePath, content, 'utf8');
                    break;
                case 'copy_to_clipboard':
                    const clipText = command.payload.text;
                    if (!clipText) throw new Error('Missing text to copy');
                    await execAsync(`echo "${clipText}" | pbcopy`);
                    break;
                default:
                    throw new Error(`Unsupported action type: ${command.actionType}`);
            }
        } catch (err: any) {
            success = false;
            errorMsg = err.message || String(err);
        }

        return {
            commandId: command.id,
            taskId: command.payload.taskId || 'unknown',
            success,
            data,
            // Update the return object to include the new output schema
            output,
            error: errorMsg,
            executedAt: new Date().toISOString(),
            durationMs: Date.now() - startTime,
            userApproved: true
        } as any; // Cast as any temporarily if types.ts hasn't been fully updated yet for the exact structure
    }
}
