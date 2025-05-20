import { auth } from './firebase/firebase';
import { AuthProvider } from '@kortexa-ai/auth';
import { MainLayout } from "./components/MainLayout";

export function App() {
    return (
        // Standalone mode with anonymous access
        <AuthProvider auth={auth} allowAnonymous={true}>
            <AuthProvider.Login title="Worker 17">
                <MainLayout />
            </AuthProvider.Login>
        </AuthProvider>
    );
}