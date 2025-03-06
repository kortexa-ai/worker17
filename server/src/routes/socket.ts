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

// Helper to get all connected worker IDs
export const getAllWorkerIds = (): string[] => {
    return Array.from(workerConnections.keys());
};

// Helper to get worker's state directly from the worker
export const getWorkerState = (workerId: string): Promise<WorkerState | undefined> => {
    return new Promise((resolve) => {
        const ws = workerConnections.get(workerId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log(`Cannot get status for worker ${workerId}: not connected`);
            // Return a basic offline state
            resolve({
                id: workerId,
                active: false,
                status: 'offline',
                timestamp: Date.now()
            });
            return;
        }
        
        // Generate a unique request ID
        const requestId = `status-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Create a one-time message handler for this specific request
        const handleResponse = (event: WebSocket.MessageEvent) => {
            try {
                const data = JSON.parse(event.data.toString());
                if (data.type === 'statusResponse' && data.requestId === requestId) {
                    // We got our response, remove the listener
                    ws.removeEventListener('message', handleResponse);
                    
                    // Resolve with the received state
                    resolve(data.payload);
                }
            } catch (error) {
                console.error('Error parsing status response:', error);
            }
        };
        
        // Add temporary listener for this specific response
        ws.addEventListener('message', handleResponse);
        
        // Set a timeout to clean up and return default offline state if no response
        setTimeout(() => {
            ws.removeEventListener('message', handleResponse);
            console.log(`Status request for worker ${workerId} timed out`);
            resolve({
                id: workerId,
                active: false,
                status: 'offline',
                timestamp: Date.now()
            });
        }, 5000);
        
        // Send the status request
        ws.send(JSON.stringify({
            type: 'statusRequest',
            workerId,
            requestId,
            payload: {},
            timestamp: Date.now()
        }));
        
        console.log(`Status requested for worker: ${workerId}`);
    });
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
                        console.log(`Worker connected and registered: ${workerId}`);
                    }
                    break;
                    
                case 'statusRequest':
                    // Client or MCP server requesting worker status
                    const requestedWorkerId = data.payload?.targetWorkerId || data.workerId;
                    console.log(`Status requested for worker: ${requestedWorkerId}`);
                    
                    // Get the worker connection
                    const targetWorkerWs = workerConnections.get(requestedWorkerId);
                    
                    if (targetWorkerWs && targetWorkerWs.readyState === WebSocket.OPEN) {
                        // Forward the status request to the worker
                        targetWorkerWs.send(JSON.stringify({
                            type: 'statusRequest',
                            workerId: requestedWorkerId,
                            requestId: data.requestId,
                            timestamp: Date.now()
                        }));
                        
                        // Wait for response via one-time listener
                        const responsePromise = new Promise<void>((resolve) => {
                            const responseHandler = (responseMsg: WebSocket.MessageEvent) => {
                                try {
                                    const responseData = JSON.parse(responseMsg.data.toString());
                                    
                                    // Check if this is the response we're waiting for
                                    if (responseData.type === 'statusResponse' && 
                                        responseData.requestId === data.requestId) {
                                        
                                        // Forward the response back to the original requester
                                        ws.send(responseMsg.data.toString());
                                        resolve();
                                    }
                                } catch (error) {
                                    console.error('Error processing response:', error);
                                }
                            };
                            
                            // Set up the listener
                            targetWorkerWs.once('message', responseHandler);
                            
                            // Set a timeout to clean up and send fallback
                            setTimeout(() => {
                                // Remove the listener to avoid memory leaks
                                targetWorkerWs.removeListener('message', responseHandler);
                                
                                console.log(`Status request for worker ${requestedWorkerId} timed out`);
                                ws.send(JSON.stringify({
                                    type: 'statusResponse',
                                    requestId: data.requestId,
                                    workerId: requestedWorkerId,
                                    payload: { 
                                        id: requestedWorkerId, 
                                        active: false, 
                                        status: 'offline',
                                        timestamp: Date.now()
                                    },
                                    timestamp: Date.now()
                                }));
                                resolve();
                            }, 5000);
                        });
                        
                        // Wait for the response to be handled
                        await responsePromise;
                    } else {
                        // Worker is not connected, send offline status
                        ws.send(JSON.stringify({
                            type: 'statusResponse',
                            requestId: data.requestId,
                            workerId: requestedWorkerId,
                            payload: { 
                                id: requestedWorkerId, 
                                active: false, 
                                status: 'offline',
                                timestamp: Date.now()
                            },
                            timestamp: Date.now()
                        }));
                    }
                    break;
                
                case 'statusResponse':
                    // Pass through - a worker responding to a status request
                    console.log(`Received status response for worker: ${data.workerId}`);
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
            // Remove from active connections
            workerConnections.delete(workerId);
            console.log(`Worker disconnected: ${workerId}`);
        }
    });
};

export function setSocketRoutes(wsApp: Instance) {
    wsApp.app.ws('/ws', wsClient);
}