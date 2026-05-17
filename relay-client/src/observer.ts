import { ObservationPayload } from './types';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ContextObserver {
    private gatewayUrl: string;
    private userId: string;
    private deviceId: string;
    private intervalId: NodeJS.Timeout | null = null;

    constructor(gatewayUrl: string, userId: string, deviceId: string) {
        this.gatewayUrl = gatewayUrl.replace(/\/$/, '');
        this.userId = userId;
        this.deviceId = deviceId;
    }

    start(intervalMs: number = 60000) { // Default every minute
        if (this.intervalId) return;
        this.intervalId = setInterval(() => this.observeAndReport(), intervalMs);
        console.log(`[ContextObserver] Started background observation every ${intervalMs}ms`);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log(`[ContextObserver] Stopped observation`);
        }
    }

    async getSnapshot(): Promise<ObservationPayload> {
        let activeApp = 'Unknown';
        try {
            if (process.platform === 'darwin') {
                const { stdout } = await execAsync(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`);
                activeApp = stdout.trim();
            }
        } catch (err) {
            console.error('[ContextObserver] Failed to get active app:', err);
        }

        return {
            activeApp,
            screenContextSummary: `User is currently focused on ${activeApp}.`,
            batteryState: 'unknown',
            networkClass: 'wifi',
            fileContext: {}
        };
    }

    private async observeAndReport() {
        try {
            const snapshot = await this.getSnapshot();
            
            const url = `${this.gatewayUrl}/api/relay/observe`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deviceId: this.deviceId,
                    userId: this.userId,
                    snapshot
                })
            });

            if (!response.ok) {
                console.error(`[ContextObserver] Failed to report observation: ${response.status}`);
            } else {
                console.log(`[ContextObserver] Reported device state successfully`);
            }
        } catch (err) {
            console.error(`[ContextObserver] Error reporting observation:`, err);
        }
    }
}
