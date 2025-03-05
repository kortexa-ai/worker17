import type { Server as HttpServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type { 
  ConnectedClient, 
  Worker17Message, 
  StateUpdateMessage, 
  WorkerState 
} from './types.js';

export class Worker17WebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, ConnectedClient> = new Map();
  private workerStates: Map<string, WorkerState> = new Map();
  
  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server });
    this.setupWebSocketServer();
    
    // Clean up dead connections every minute
    setInterval(() => this.cleanupDeadConnections(), 60000);
  }
  
  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = randomUUID();
      
      // Initialize as a non-worker client
      this.clients.set(clientId, {
        id: clientId,
        ws,
        isWorker: false,
        lastMessage: Date.now()
      });
      
      console.log(`New client connected: ${clientId}`);
      
      // Send current worker states to the new client
      this.sendAllWorkerStates(ws);
      
      ws.on('message', (message: Buffer | string) => {
        const msgStr = message.toString();
        this.handleMessage(clientId, msgStr);
      });
      
      ws.on('close', () => {
        const client = this.clients.get(clientId);
        
        // If this was a worker, mark it as offline
        if (client?.isWorker && client.workerId) {
          const workerState = this.workerStates.get(client.workerId);
          if (workerState) {
            workerState.status = 'offline';
            workerState.active = false;
            workerState.timestamp = Date.now();
            
            // Broadcast worker disconnect
            this.broadcastWorkerState(workerState);
          }
        }
        
        this.clients.delete(clientId);
        console.log(`Client disconnected: ${clientId}`);
      });
    });
  }
  
  private handleMessage(clientId: string, rawMessage: string) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Update last message timestamp
    client.lastMessage = Date.now();
    
    try {
      const message = JSON.parse(rawMessage) as Worker17Message;
      
      // Handle different message types
      switch (message.type) {
        case 'connect':
          // Worker client identifying itself
          if (message.workerId) {
            client.isWorker = true;
            client.workerId = message.workerId;
            console.log(`Client ${clientId} identified as worker: ${message.workerId}`);
          }
          break;
          
        case 'stateUpdate':
          // Worker reporting its current state
          if (client.isWorker && client.workerId) {
            const stateMsg = message as StateUpdateMessage;
            this.updateWorkerState(client.workerId, stateMsg.payload);
          }
          break;
          
        case 'command':
          // Forward command to the appropriate worker
          if (!client.isWorker && message.workerId) {
            this.forwardCommandToWorker(message);
          }
          break;
          
        default:
          console.log(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }
  
  private updateWorkerState(workerId: string, state: WorkerState) {
    // Update our stored state
    this.workerStates.set(workerId, {
      ...state,
      timestamp: Date.now()
    });
    
    // Broadcast to all monitoring clients
    this.broadcastWorkerState(state);
  }
  
  private broadcastWorkerState(state: WorkerState) {
    const message: StateUpdateMessage = {
      type: 'stateUpdate',
      workerId: state.id,
      payload: state,
      timestamp: Date.now()
    };
    
    // Send to all non-worker clients
    this.clients.forEach(client => {
      if (!client.isWorker && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }
  
  private forwardCommandToWorker(message: Worker17Message) {
    if (!message.workerId) return;
    
    // Find the worker client
    let workerClient: ConnectedClient | undefined;
    
    this.clients.forEach(client => {
      if (client.isWorker && client.workerId === message.workerId) {
        workerClient = client;
      }
    });
    
    // Forward the command if worker is connected
    if (workerClient && workerClient.ws.readyState === workerClient.ws.OPEN) {
      workerClient.ws.send(JSON.stringify(message));
      console.log(`Command forwarded to worker ${message.workerId}`);
    } else {
      console.log(`Worker ${message.workerId} not connected, command ignored`);
    }
  }
  
  private sendAllWorkerStates(ws: WebSocket) {
    this.workerStates.forEach(state => {
      const message: StateUpdateMessage = {
        type: 'stateUpdate',
        workerId: state.id,
        payload: state,
        timestamp: Date.now()
      };
      
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }
  
  private cleanupDeadConnections() {
    const now = Date.now();
    const timeoutThreshold = 2 * 60 * 1000; // 2 minutes
    
    this.clients.forEach((client, clientId) => {
      if (now - client.lastMessage > timeoutThreshold) {
        // If this was a worker, mark it as offline
        if (client.isWorker && client.workerId) {
          const workerState = this.workerStates.get(client.workerId);
          if (workerState) {
            workerState.status = 'offline';
            workerState.active = false;
            workerState.timestamp = now;
            
            // Broadcast worker disconnect
            this.broadcastWorkerState(workerState);
          }
        }
        
        // Close and remove the connection
        if (client.ws.readyState === client.ws.OPEN) {
          client.ws.terminate();
        }
        this.clients.delete(clientId);
        console.log(`Dead connection removed: ${clientId}`);
      }
    });
  }
  
  // Method to be used by MCP server to send commands
  public sendCommandToWorker(workerId: string, command: string, parameters?: unknown) {
    const message: Worker17Message = {
      type: 'command',
      workerId,
      payload: {
        command,
        parameters
      },
      timestamp: Date.now()
    };
    
    // Find the worker client
    let workerClient: ConnectedClient | undefined;
    
    this.clients.forEach(client => {
      if (client.isWorker && client.workerId === workerId) {
        workerClient = client;
      }
    });
    
    // Forward the command if worker is connected
    if (workerClient && workerClient.ws.readyState === workerClient.ws.OPEN) {
      workerClient.ws.send(JSON.stringify(message));
      console.log(`MCP Command forwarded to worker ${workerId}: ${command}`);
      return true;
    } else {
      console.log(`Worker ${workerId} not connected, MCP command ignored`);
      return false;
    }
  }
  
  // Method for MCP server to get all worker states
  public getAllWorkerStates(): WorkerState[] {
    return Array.from(this.workerStates.values());
  }
  
  // Method for MCP server to get a specific worker state
  public getWorkerState(workerId: string): WorkerState | undefined {
    return this.workerStates.get(workerId);
  }
}