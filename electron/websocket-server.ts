import { WebSocketServer, WebSocket } from 'ws';
import * as os from 'os';
import { ChildProcess } from 'child_process';
import { parse as parseUrl } from 'url';

export class GatewayServer {
  private wss: WebSocketServer;
  private pairingToken: string;
  private goDaemon: ChildProcess;
  public port: number;

  constructor(port: number, pairingToken: string, goDaemon: ChildProcess) {
    this.port = port;
    this.pairingToken = pairingToken;
    this.goDaemon = goDaemon;
    this.wss = new WebSocketServer({ port });

    this.setupServer();
    this.setupDaemonListener();
  }

  private setupServer() {
    // The Gatekeeper: Verify connection via upgrade or initial connection
    this.wss.on('connection', (ws: WebSocket, req: any) => {
      const url = parseUrl(req.url || '', true);
      const token = url.query.token || req.headers['authorization']?.replace('Bearer ', '');

      if (token !== this.pairingToken) {
        console.error('[WSS] Unauthorized connection attempt.');
        ws.send(JSON.stringify({ error: 'Unauthorized' }));
        ws.close(4001, 'Unauthorized');
        return;
      }

      console.log('[WSS] Mobile Remote connected securely.');

      // The Router: Forward WS messages to Go Daemon
      ws.on('message', (message: string) => {
        try {
          const payload = JSON.parse(message.toString());
          
          // Inject the AuthToken into the JSON-RPC payload for the Inner Ring
          payload.authToken = this.pairingToken;
          
          if (this.goDaemon.stdin) {
            this.goDaemon.stdin.write(JSON.stringify(payload) + '\n');
          }
        } catch (error) {
          console.error('[WSS] Failed to process incoming message:', error);
        }
      });
      
      ws.on('close', () => {
        console.log('[WSS] Mobile Remote disconnected.');
      });
    });

    console.log(`[WSS] Secure gateway listening on port ${this.port}`);
  }

  private setupDaemonListener() {
    // Pipe Daemon stdout back to all active WebSocket clients
    if (this.goDaemon.stdout) {
      this.goDaemon.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        this.wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(output);
          }
        });
      });
    }

    if (this.goDaemon.stderr) {
      this.goDaemon.stderr.on('data', (data: Buffer) => {
        console.error(`[Daemon Error]: ${data.toString()}`);
      });
    }
  }

  public getLocalIP(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }
}
