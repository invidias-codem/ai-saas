import { useLatticeStore, ConnectionInfo } from '../store/useLatticeStore';
import 'react-native-url-polyfill/auto'; // Required for robust WebSocket URL parsing in some RN versions

class SocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isIntentionalDisconnect = false;

  public connect(info: ConnectionInfo) {
    this.isIntentionalDisconnect = false;
    useLatticeStore.getState().setStatus('connecting');

    // Create the WebSocket connection. 
    // We pass the token as a query parameter so the Desktop Core (websocket-server.ts) can authenticate the upgrade request.
    const wsUrl = `ws://${info.ip}:${info.port}?token=${encodeURIComponent(info.token)}`;
    
    logger.info(`[SocketClient] Connecting to ${wsUrl}`);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      logger.info('[SocketClient] Connected successfully');
      this.reconnectAttempts = 0;
      useLatticeStore.getState().setStatus('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        // Assuming payload is a trace block or an array of trace blocks
        if (payload.type === 'trace') {
          useLatticeStore.getState().appendTrace(payload);
        } else {
          // generic fallback if it doesn't have a strict type
          useLatticeStore.getState().appendTrace({
            id: payload.id || Math.random().toString(36).substring(7),
            content: JSON.stringify(payload),
            timestamp: Date.now()
          });
        }
      } catch (err) {
        logger.warn('[SocketClient] Failed to parse message', event.data);
      }
    };

    this.ws.onerror = (error: any) => {
      logger.error('[SocketClient] WebSocket error', error.message || 'Unknown error');
    };

    this.ws.onclose = (event) => {
      logger.info(`[SocketClient] Disconnected (code: ${event.code})`);
      
      if (this.isIntentionalDisconnect) {
        useLatticeStore.getState().setStatus('idle');
      } else {
        useLatticeStore.getState().setStatus('error', 'Connection lost');
        this.attemptReconnect(info);
      }
    };
  }

  private attemptReconnect(info: ConnectionInfo) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      useLatticeStore.getState().setStatus('error', 'Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const backoffTime = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000); // Max 10 seconds
    
    logger.info(`[SocketClient] Reconnecting in ${backoffTime}ms (Attempt ${this.reconnectAttempts})`);
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.connect(info);
    }, backoffTime);
  }

  public disconnect() {
    this.isIntentionalDisconnect = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    useLatticeStore.getState().disconnect();
  }

  public haltExecution() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'halt' }));
      logger.info('[SocketClient] Halt execution payload sent');
    } else {
      logger.warn('[SocketClient] Cannot halt: WebSocket is not open');
    }
  }
}

export const socketClient = new SocketClient();
