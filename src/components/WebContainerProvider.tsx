import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';
import { WebContainerComponent } from './WebContainer';

// WebContainer Context Interface
interface WebContainerContextState {
  isLoaded: boolean;
  isRunning: boolean;
  serverUrl: string | null;
  error: Error | null;
  container: WebContainer | null;
}

// Create the context with default values
const WebContainerContext = createContext<WebContainerContextState>({
  isLoaded: false,
  isRunning: false,
  serverUrl: null,
  error: null,
  container: null
});

// Custom hook to use the WebContainer context
export function useWebContainer() {
  return useContext(WebContainerContext);
}

// WebContainer Provider props
interface WebContainerProviderProps {
  children: ReactNode;
  autoStart?: boolean;
  onServerStarted?: (url: string) => void;
  onError?: (error: Error) => void;
}

// WebContainer Provider Component
export function WebContainerProvider({ 
  children, 
  autoStart = true,
  onServerStarted: parentOnServerStarted,
  onError: parentOnError
}: WebContainerProviderProps) {
  const [state, setState] = useState<WebContainerContextState>({
    isLoaded: false,
    isRunning: false,
    serverUrl: null,
    error: null,
    container: null
  });

  // Handler for when the WebContainer is ready
  const handleContainerReady = useCallback((container: WebContainer) => {
    setState(prev => ({
      ...prev,
      isLoaded: true,
      container
    }));
  }, []);

  // Handler for when the server starts
  const handleServerStarted = useCallback((url: string) => {
    setState(prev => ({
      ...prev,
      isRunning: true,
      serverUrl: url
    }));
    
    // Call the parent callback if provided
    if (parentOnServerStarted) {
      parentOnServerStarted(url);
    }
  }, [parentOnServerStarted]);

  // Handler for WebContainer errors
  const handleError = useCallback((error: Error) => {
    console.error('WebContainer error:', error);
    setState(prev => ({
      ...prev,
      error
    }));
    
    // Call the parent callback if provided
    if (parentOnError) {
      parentOnError(error);
    }
  }, [parentOnError]);

  // Update the WebSocket URL in env vars when the server is running
  useEffect(() => {
    if (state.serverUrl) {
      // Convert http:// to ws:// for the WebSocket URL
      const wsUrl = state.serverUrl.replace('http://', 'ws://') + '/ws';
      console.log(`WebContainer server running at ${state.serverUrl}, WebSocket available at ${wsUrl}`);
      
      // Set environment variable for the WebSocket URL
      // This is a way to override the default URL without modifying .env files
      window.process = window.process || {};
      window.process.env = window.process.env || {};
      window.process.env.VITE_WORKER_SERVER_URL = wsUrl;
    }
  }, [state.serverUrl]);

  return (
    <WebContainerContext.Provider value={state}>
      {autoStart && (
        <WebContainerComponent 
          onReady={handleContainerReady}
          onServerStarted={handleServerStarted}
          onError={handleError}
        />
      )}
      {children}
    </WebContainerContext.Provider>
  );
}