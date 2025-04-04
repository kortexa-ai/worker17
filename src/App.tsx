import { MainLayout } from "./components/MainLayout";
import { WebSocketProvider } from "./socket/WebSocketProvider";
import { WebContainerToggle } from "./components/WebContainerToggle";

export function App() {
    // Get environment variables from Vite
    const port = parseInt(import.meta.env.VITE_WORKER_SERVER_PORT || '4000', 10);
    const nodeEnv = import.meta.env.MODE || 'development';
    const mcpServerName = import.meta.env.VITE_MCP_SERVER_NAME || 'worker17-mcp-server';

    return (
        <WebContainerToggle
            port={port}
            nodeEnv={nodeEnv}
            serverOptions={{
                // Add any additional environment variables
                MCP_SERVER_NAME: mcpServerName,
            }}
        >
            <WebSocketProvider>
                <MainLayout />
            </WebSocketProvider>
        </WebContainerToggle>
    );
}