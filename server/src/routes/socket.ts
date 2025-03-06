import type { Instance } from 'express-ws';
import { WebSocket, type RawData } from 'ws';
import type { Request } from 'express';

// Simple worker state type
interface WorkerState {
    id: string;
    active: boolean;
    status: 'idle' | 'working' | 'error' | 'offline';
    batteryLevel?: number;
    currentTask?: string;
    timestamp: number;
}

// Store worker states by worker ID
const workerStates = new Map<string, WorkerState>();

// Store active connections by worker ID (for commands)
const workerConnections = new Map<string, WebSocket>();

// Helper to add a worker connection
const addWorkerConnection = (workerId: string, ws: WebSocket) => {
    workerConnections.set(workerId, ws);
    console.log(`Worker registered: ${workerId}`);
};

// Helper to send a terminate command to a worker
export const terminateWorker = (workerId: string): boolean => {
    const ws = workerConnections.get(workerId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log(`Cannot terminate worker ${workerId}: not connected`);
        return false;
    }
    
    // Send terminate command
    ws.send(JSON.stringify({
        type: 'command',
        workerId,
        payload: {
            command: 'terminate'
        },
        timestamp: Date.now()
    }));
    
    console.log(`Terminate command sent to worker: ${workerId}`);
    return true;
};

// Helper to get a worker's state
export const getWorkerState = (workerId: string): WorkerState | undefined => {
    return workerStates.get(workerId);
};

// Helper to get all workers' states
export const getAllWorkerStates = (): WorkerState[] => {
    return Array.from(workerStates.values());
};

// WebSocket client handler
const wsClient = (ws: WebSocket, _req: Request) => {
    // Keep track of which worker this is
    let workerId: string | null = null;
    
    // Set up message handler
    ws.on('message', async (message: RawData) => {
        try {
            const data = JSON.parse(message.toString());
            console.log(`Received WebSocket message:`, data.type);
            
            // Handle different message types
            switch (data.type) {
                case 'connect':
                    // Client identifying itself as a worker
                    workerId = data.workerId;
                    if (workerId) {
                        addWorkerConnection(workerId, ws);
                    }
                    break;
                    
                case 'stateUpdate':
                    // Worker reporting its state
                    if (data.workerId && data.payload) {
                        // Update stored state
                        workerStates.set(data.workerId, {
                            ...data.payload,
                            timestamp: Date.now()
                        });
                        console.log(`Worker state updated: ${data.workerId}`);
                    }
                    break;
            }
            
            // Always acknowledge receipt
            ws.send(JSON.stringify({ type: 'ack' }));
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Failed to process message' 
            }));
        }
    });
    
    // Handle disconnection
    ws.on('close', () => {
        if (workerId) {
            // Update worker state to offline
            const state = workerStates.get(workerId);
            if (state) {
                state.active = false;
                state.status = 'offline';
                state.timestamp = Date.now();
                workerStates.set(workerId, state);
            }
            
            // Remove from active connections
            workerConnections.delete(workerId);
            console.log(`Worker disconnected: ${workerId}`);
        }
    });
};

export function setSocketRoutes(wsApp: Instance) {
    wsApp.app.ws('/ws', wsClient);
}