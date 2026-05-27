import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface ConnectionInfo {
  ip: string;
  port: number;
  token: string;
}

export interface TraceBlock {
  id: string;
  type?: string;
  content: string;
  timestamp: number;
  [key: string]: any;
}

interface LatticeState {
  status: ConnectionStatus;
  connectionInfo: ConnectionInfo | null;
  traceBlocks: TraceBlock[];
  errorMessage: string | null;

  // Actions
  setConnectionInfo: (info: ConnectionInfo) => void;
  setStatus: (status: ConnectionStatus, errorMessage?: string | null) => void;
  appendTrace: (trace: TraceBlock) => void;
  clearTraces: () => void;
  disconnect: () => void;
}

export const useLatticeStore = create<LatticeState>((set) => ({
  status: 'idle',
  connectionInfo: null,
  traceBlocks: [],
  errorMessage: null,

  setConnectionInfo: (info) => set({ connectionInfo: info }),
  
  setStatus: (status, errorMessage = null) => 
    set({ status, errorMessage }),
  
  appendTrace: (trace) => 
    set((state) => ({ traceBlocks: [...state.traceBlocks, trace] })),
    
  clearTraces: () => set({ traceBlocks: [] }),
  
  disconnect: () => set({ 
    status: 'idle', 
    connectionInfo: null, 
    traceBlocks: [],
    errorMessage: null 
  }),
}));
