import { MainLayout } from "./components/MainLayout";
import { WebSocketProvider } from "./socket/WebSocketProvider";

export function App() {
    return (
        <WebSocketProvider>
            <MainLayout />
        </WebSocketProvider>
    );
}