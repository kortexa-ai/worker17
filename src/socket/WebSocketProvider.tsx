import type { ReactNode } from 'react';
import { useEffect, useState, useCallback } from 'react';
import { WebSocketContext } from './WebSocketContext';

// Define interface for the context state
export interface WebSocketContextState {
  isConnected: boolean;
  sendMessage: (message: unknown) => void;
  workerState: {
    id: string;
    active: boolean;
    status: 'idle' | 'working' | 'error' | 'offline';
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
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [workerState, setWorkerState] = useState<WebSocketContextState['workerState']>(null);
  
  // Get WebSocket URL from environment or use default
  const wsUrl = import.meta.env.VITE_WORKER_SERVER_URL || 'ws://localhost:4000';
  
  // Function to send messages to the server
  const sendMessage = useCallback((message: unknown) => {
    if (socket && isConnected) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn('Cannot send message, WebSocket is not connected');
    }
  }, [socket, isConnected]);
  
  // Function to send commands to the worker
  const sendCommand = useCallback((command: string, parameters?: unknown) => {
    if (socket && isConnected) {
      const message = {
        type: 'command',
        workerId: WORKER_ID,
        payload: {
          command,
          parameters
        },
        timestamp: Date.now()
      };
      socket.send(JSON.stringify(message));
    } else {
      console.warn('Cannot send command, WebSocket is not connected');
    }
  }, [socket, isConnected]);
  
  // Initialize WebSocket connection
  useEffect(() => {
    // Create a new WebSocket connection
    const newSocket = new WebSocket(wsUrl);
    
    // Setup event handlers
    newSocket.onopen = () => {
      console.log('WebSocket connected');
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
          // For now, just update worker state
          if (workerState) {
            switch (message.payload.command) {
              case 'activate':
                setWorkerState({
                  ...workerState,
                  active: true,
                  status: 'idle'
                });
                break;
              case 'deactivate':
                setWorkerState({
                  ...workerState,
                  active: false,
                  status: 'offline'
                });
                break;
              case 'setTask':
                setWorkerState({
                  ...workerState,
                  currentTask: message.payload.parameters?.task || 'Unknown task',
                  status: 'working'
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
    
    newSocket.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      
      // Try to reconnect after 5 seconds
      setTimeout(() => {
        console.log('Attempting to reconnect...');
        // The effect cleanup will handle the old socket
        // This effect will run again to create a new socket
      }, 5000);
    };
    
    newSocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    // Save the socket in state
    setSocket(newSocket);
    
    // Clean up the WebSocket on unmount
    return () => {
      console.log('Closing WebSocket connection');
      if (newSocket) {
        newSocket.close();
      }
    };
  }, [wsUrl]); // Only re-run if the URL changes
  
  // Set up an interval to send periodic updates
  useEffect(() => {
    if (!isConnected) return;
    
    // Initialize worker state if not already set
    if (!workerState) {
      const initialState = {
        id: WORKER_ID,
        active: true,
        status: 'idle',
        position: { x: 0, y: 0, z: 0 },
        batteryLevel: 100,
        currentTask: undefined
      };
      setWorkerState(initialState);
    }
    
    // Send state updates every 5 seconds
    const interval = setInterval(() => {
      if (socket && isConnected && workerState) {
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
  }, [isConnected, socket, workerState, sendMessage]);
  
  return (
    <WebSocketContext.Provider value={{ isConnected, sendMessage, workerState, sendCommand }}>
      {children}
    </WebSocketContext.Provider>
  );
};