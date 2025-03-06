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

            // Send initial state
            newSocket.send(JSON.stringify({
                type: 'stateUpdate',
                workerId: WORKER_ID,
                payload: {
                    id: WORKER_ID,
                    active: true,
                    status: 'idle',
                    position: { x: 0, y: 0, z: 0 },
                    batteryLevel: 100,
                    timestamp: Date.now()
                },
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

    // Set up an interval to send periodic updates
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
        }

        // Send state updates every 5 seconds
        const interval = setInterval(() => {
            if (isConnected && workerState) {
                // Update battery level (simulate draining)
                const updatedState = {
                    ...workerState,
                    batteryLevel: Math.max(0, (workerState.batteryLevel || 100) - 1),
                    timestamp: Date.now()
                };

                // Update local state
                setWorkerState(updatedState);

                // Send updated state to server
                sendMessage({
                    type: 'stateUpdate',
                    workerId: WORKER_ID,
                    payload: updatedState,
                    timestamp: Date.now()
                });
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [isConnected, workerState, sendMessage]);

    return (
        <WebSocketContext.Provider value={{ isConnected, sendMessage, workerState, sendCommand }}>
            {children}
        </WebSocketContext.Provider>
    );
};