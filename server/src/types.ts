// Import WebSocket from ws package
import type { WebSocket } from 'ws';

// Worker state model
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface WorkerState {
  id: string;
  position?: Vector3;
  rotation?: Vector3;
  active: boolean;
  status: 'idle' | 'working' | 'error' | 'offline';
  batteryLevel?: number;
  currentTask?: string;
  timestamp: number;
}

// Message types for WebSocket communication
export interface SocketMessage {
  type: 'stateUpdate' | 'command' | 'error' | 'connect' | 'disconnect';
  workerId?: string;
  payload: unknown;
  timestamp: number;
}

export interface StateUpdateMessage extends SocketMessage {
  type: 'stateUpdate';
  payload: WorkerState;
}

export interface CommandMessage extends SocketMessage {
  type: 'command';
  payload: {
    command: 'terminate';
    parameters?: unknown;
  };
}

// Client connection tracking
export interface ConnectedClient {
  id: string;
  ws: WebSocket;
  isWorker: boolean;
  workerId?: string;
  lastMessage: number;
}

// MCP Tool types
export interface WorkerCommandParameters {
  workerId: string;
  command: 'terminate';
  parameters?: unknown;
}