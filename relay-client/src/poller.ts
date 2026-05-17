import fetch from 'node-fetch';
import { RelayCommand, RelayCommandResult } from './types';
import { CommandExecutor } from './executor';
import { AuthManager } from './auth';

export class RelayPoller {
    private gatewayUrl: string;
    private userId: string;
    private deviceId: string;
    private executor: CommandExecutor;
    private isPolling: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;

    constructor(gatewayUrl: string, userId: string, deviceId: string) {
        this.gatewayUrl = gatewayUrl.replace(/\/$/, ''); // Remove trailing slash
        this.userId = userId;
        this.deviceId = deviceId;
        this.executor = new CommandExecutor();
    }

    start(intervalMs: number = 5000) {
        if (this.isPolling) return;
        this.isPolling = true;
        this.intervalId = setInterval(() => this.poll(), intervalMs);
        console.log(`[RelayPoller] Started polling ${this.gatewayUrl} every ${intervalMs}ms`);
        // Initial poll immediately
        this.poll();
    }

    stop() {
        if (!this.isPolling) return;
        this.isPolling = false;
        if (this.intervalId) clearInterval(this.intervalId);
        console.log(`[RelayPoller] Stopped polling`);
    }

    private async poll() {
        try {
            const url = `${this.gatewayUrl}/api/relay/poll?deviceId=${encodeURIComponent(this.deviceId)}`;
            const tokens = AuthManager.getTokens();
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(tokens?.accessToken ? { 'Authorization': `Bearer ${tokens.accessToken}` } : {})
                }
            });

            if (!response.ok) {
                console.error(`[RelayPoller] Poll failed with status: ${response.status}`);
                return;
            }

            const data = await response.json();
            const commands: RelayCommand[] = data.commands || [];

            if (commands.length > 0) {
                console.log(`[RelayPoller] Received ${commands.length} pending commands`);
                for (const cmd of commands) {
                    await this.processCommand(cmd);
                }
            }
        } catch (err) {
            console.error('[RelayPoller] Error during poll:', err);
        }
    }

    private async processCommand(command: RelayCommand) {
        console.log(`[RelayPoller] Executing command: ${command.actionType} (${command.id})`);
        
        if (command.requiresApproval) {
            // Placeholder: Prompt user for approval. 
            console.log(`[RelayPoller] Command ${command.id} requires approval. Auto-approving for development.`);
        }

        const result = await this.executor.execute(command);
        await this.reportResult(result);
    }

    private async reportResult(result: RelayCommandResult) {
        try {
            const url = `${this.gatewayUrl}/api/relay/result`;
            const tokens = AuthManager.getTokens();
            const bodyPayload = {
                ...result,
                status: result.success ? 'success' : 'failure'
            };
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(tokens?.accessToken ? { 'Authorization': `Bearer ${tokens.accessToken}` } : {})
                },
                body: JSON.stringify(bodyPayload)
            });

            if (!response.ok) {
                console.error(`[RelayPoller] Failed to report result for command ${result.commandId}`);
            } else {
                console.log(`[RelayPoller] Reported result for command ${result.commandId} (success: ${result.success})`);
            }
        } catch (err) {
            console.error(`[RelayPoller] Error reporting result for command ${result.commandId}:`, err);
        }
    }
}
