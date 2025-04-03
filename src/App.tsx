import { MainLayout } from "./components/MainLayout";
import { WebSocketProvider } from "./socket/WebSocketProvider";
import { WebContainerToggle } from "./components/WebContainerToggle";

export function App() {
    return (
        <WebContainerToggle>
            <WebSocketProvider>
                <MainLayout />
            </WebSocketProvider>
        </WebContainerToggle>
    );
}