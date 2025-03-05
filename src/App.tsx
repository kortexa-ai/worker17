import { MainLayout } from "./components/MainLayout";
import { WebSocketProvider } from "./lib/WebSocketContext";

export function App() {
    return (
        <WebSocketProvider>
            <MainLayout />
        </WebSocketProvider>
    );
}