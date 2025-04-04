import { MainLayout } from "./components/MainLayout";
import { WebSocketProvider } from "./socket/WebSocketProvider";
import { lazy, Suspense } from "react";

// Only import WebContainerProvider when in WebContainer mode
const WebContainerProvider = lazy(() => 
    import.meta.env.VITE_USE_WEBCONTAINER 
        ? import("./components/WebContainerProvider") 
        : Promise.resolve({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> })
);

export function App() {
    // Get environment variables from Vite
    const port = parseInt(import.meta.env.VITE_WORKER_SERVER_PORT || '4000', 10);
    const nodeEnv = import.meta.env.MODE || 'development';
    const mcpServerName = import.meta.env.VITE_MCP_SERVER_NAME || 'worker17-mcp-server';
    const useWebContainer = import.meta.env.VITE_USE_WEBCONTAINER === 'true';
    
    return (
        <Suspense fallback={<div>Loading...</div>}>
            {useWebContainer ? (
                <WebContainerProvider
                    autoStart
                    port={port}
                    nodeEnv={nodeEnv}
                    serverOptions={{
                        // Add any additional environment variables
                        MCP_SERVER_NAME: mcpServerName,
                        WEBCONTAINER: 'true'
                    }}
                >
                    <WebSocketProvider>
                        <MainLayout />
                    </WebSocketProvider>
                </WebContainerProvider>
            ) : (
                <WebSocketProvider>
                    <MainLayout />
                </WebSocketProvider>
            )}
        </Suspense>
    );
}