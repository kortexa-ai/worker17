import type { ReactNode } from 'react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { WebSocketContext } from './WebSocketContext';

export type WorkerStatus = 'idle' | 'working' | 'error' | 'offline';

// Define interface for the context state
export interface WebSocketContextState {
    isConnected: boolean;
    sendMessage: (message: unknown) => void;
    workerState: {
        id: string;
        active: boolean;
        status: WorkerStatus;
        position?: { x: number; y: number; z: number };
        rotation?: { x: number; y: number; z: number };
        batteryLevel?: number;
        currentTask?: string;
    } | null;
    sendCommand: (command: string, parameters?: unknown) => void;
    requestStatus: () => void;
    updateWorkerState: (state: Partial<WebSocketContextState['workerState']>) => void;
}

// Worker17 ID for this client
const WORKER_ID = 'worker17';

// WebSocket Provider Component
export function WebSocketProvider({ children }: { children: ReactNode }) {
    const [isConnected, setIsConnected] = useState(false);
    const [workerState, setWorkerState] = useState<WebSocketContextState['workerState']>(null);

    // Get WebSocket URL from environment or use default
    const wsUrl = import.meta.env.VITE_WORKER_SERVER_URL || 'ws://localhost:4000/ws';

    // Use refs to maintain stable references across renders
    const socketRef = useRef<WebSocket | null>(null);
    const connectingRef = useRef(false);
    const reconnectTimeoutRef = useRef<number | null>(null);

    // Create a stable reference to the current workerState for event handlers
    const workerStateRef = useRef(workerState);
    useEffect(() => {
        workerStateRef.current = workerState;
    }, [workerState]);

    // Setup WebSocket connection
    const setupWebSocket = useCallback(() => {
        // Don't create a new connection if we're already connecting or have a connection
        if (connectingRef.current || (socketRef.current && socketRef.current.readyState < 2)) {
            return;
        }

        // Clear any pending reconnect attempts
        if (reconnectTimeoutRef.current !== null) {
            window.clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        // Mark as connecting to prevent duplicate connections
        connectingRef.current = true;

        // Create a new WebSocket connection
        const newSocket = new WebSocket(wsUrl);

        // Setup event handlers
        newSocket.onopen = () => {
            console.log('WebSocket connected');
            connectingRef.current = false;
            setIsConnected(true);

            // Send initial worker identification message
            newSocket.send(JSON.stringify({
                type: 'connect',
                workerId: WORKER_ID,
                payload: {},
                timestamp: Date.now()
            }));
        };

        newSocket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('Received message:', message);

                // Handle different message types
                if (message.type === 'command' && message.workerId === WORKER_ID) {
                    console.log('Received command:', message.payload.command);
                    // Handle commands based on your application needs
                    const currentWorkerState = workerStateRef.current;

                    if (currentWorkerState) {
                        switch (message.payload.command) {
                            case 'activate':
                                setWorkerState({
                                    ...currentWorkerState,
                                    active: true,
                                    status: 'idle'
                                });
                                break;
                            case 'deactivate':
                                setWorkerState({
                                    ...currentWorkerState,
                                    active: false,
                                    status: 'offline'
                                });
                                break;
                            case 'setTask':
                                setWorkerState({
                                    ...currentWorkerState,
                                    currentTask: message.payload.parameters?.task || 'Unknown task',
                                    status: 'working'
                                });
                                break;
                            case 'terminate':
                                console.log('Received terminate command! Worker is being terminated');
                                setWorkerState({
                                    ...currentWorkerState,
                                    active: false,
                                    status: 'offline',
                                    currentTask: 'Termination in progress'
                                });
                                break;
                            // Add more command handlers as needed
                        }
                    }
                } else if (message.type === 'statusResponse' && message.workerId === WORKER_ID) {
                    console.log('Received status response:', message.payload);
                    // Update worker state with the received status
                    setWorkerState(message.payload);
                } else if (message.type === 'statusRequest' && message.workerId === WORKER_ID) {
                    console.log('Received status request, sending current state:', workerStateRef.current);
                    // Send back our current state - this is the only place we send state updates to server
                    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                        // Ensure we're sending the most current data
                        const currentState = workerStateRef.current || {
                            id: WORKER_ID,
                            active: true,
                            status: 'idle',
                            batteryLevel: 100,
                            position: { x: 0, y: 0, z: 0 },
                            timestamp: Date.now()
                        };
                        
                        // Make sure we're sending fresh data
                        const responsePayload = {
                            ...currentState,
                            timestamp: Date.now()
                        };
                        
                        socketRef.current.send(JSON.stringify({
                            type: 'statusResponse',
                            requestId: message.requestId,
                            workerId: WORKER_ID,
                            payload: responsePayload,
                            timestamp: Date.now()
                        }));
                        
                        console.log('Sent status response with data:', responsePayload);
                    }
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        newSocket.onclose = (event) => {
            console.log('WebSocket disconnected', event.code, event.reason);
            connectingRef.current = false;
            setIsConnected(false);

            // Clear socket ref if this was our active socket
            if (socketRef.current === newSocket) {
                socketRef.current = null;
            }

            // Try to reconnect after a delay, if this wasn't an intentional close
            if (event.code !== 1000) {
                reconnectTimeoutRef.current = window.setTimeout(() => {
                    console.log('Attempting to reconnect...');
                    reconnectTimeoutRef.current = null;
                    setupWebSocket();
                }, 5000);
            }
        };

        newSocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            // Error handling is done in onclose
        };

        // Save the socket in ref
        socketRef.current = newSocket;
    }, [wsUrl]);

    // Function to send messages to the server  
    const sendMessage = useCallback((message: unknown) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(message));
        } else {
            console.warn('Cannot send message, WebSocket is not connected');

            // Try to reconnect if socket is closed
            if (!socketRef.current || socketRef.current.readyState >= 2) {
                setupWebSocket();
            }
        }
    }, [setupWebSocket]);

    // Function to send commands to the worker
    const sendCommand = useCallback((command: string, parameters?: unknown) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            const message = {
                type: 'command',
                workerId: WORKER_ID,
                payload: {
                    command,
                    parameters
                },
                timestamp: Date.now()
            };
            socketRef.current.send(JSON.stringify(message));
        } else {
            console.warn('Cannot send command, WebSocket is not connected');

            // Try to reconnect if socket is closed
            if (!socketRef.current || socketRef.current.readyState >= 2) {
                setupWebSocket();
            }
        }
    }, [setupWebSocket]);
    
    // Function to request the latest worker status
    const requestStatus = useCallback(() => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            const requestId = Date.now().toString();
            const message = {
                type: 'statusRequest',
                workerId: WORKER_ID,
                requestId,
                payload: {},
                timestamp: Date.now()
            };
            socketRef.current.send(JSON.stringify(message));
            console.log('Status request sent');
        } else {
            console.warn('Cannot request status, WebSocket is not connected');
            
            // Try to reconnect if socket is closed
            if (!socketRef.current || socketRef.current.readyState >= 2) {
                setupWebSocket();
            }
        }
    }, [setupWebSocket]);
    
    // Function to update worker state locally (no server updates)
    const updateWorkerState = useCallback((newState: Partial<WebSocketContextState['workerState']>) => {
        setWorkerState(currentState => {
            if (!currentState) return null;
            
            // Create updated state (local only)
            const updatedState = { ...(currentState), ...newState };
            return updatedState;
        });
    }, []);

    // Initialize WebSocket connection on mount
    useEffect(() => {
        // Initial connection
        setupWebSocket();

        // Clean up the WebSocket on unmount
        return () => {
            // Clear any reconnection attempts
            if (reconnectTimeoutRef.current !== null) {
                window.clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }

            // Close the connection if it exists
            if (socketRef.current) {
                console.log('Closing WebSocket connection');
                const socket = socketRef.current;

                // Mark the connection as manually closed
                try {
                    socket.close(1000, 'Component unmounting');
                } catch (err) {
                    console.error('Error closing WebSocket:', err);
                }

                socketRef.current = null;
            }
        };
    }, [setupWebSocket]);

    // Initialize worker state
    useEffect(() => {
        if (!isConnected) return;

        // Initialize worker state if not already set
        if (!workerState) {
            const initialState = {
                id: WORKER_ID,
                active: true,
                status: 'idle' as WorkerStatus,
                position: { x: 0, y: 0, z: 0 },
                batteryLevel: 100,
                currentTask: undefined
            };
            setWorkerState(initialState);
            // Don't send state update - only respond to requests
        }
    }, [isConnected, workerState]);

    return (
        <WebSocketContext.Provider value={{ 
            isConnected, 
            sendMessage, 
            workerState, 
            sendCommand, 
            requestStatus,
            updateWorkerState
        }}>
            {children}
        </WebSocketContext.Provider>
    );
};