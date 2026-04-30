import { ThemeProvider } from './contexts/ThemeProvider';
import { ToastProvider } from './contexts/ToastProvider';
import { SessionProvider } from './contexts/SessionProvider';
import { AuthGate } from './components/auth/AuthGate';
import { RootErrorBoundary } from './components/RootErrorBoundary';

export default function App() {
  return (
    <RootErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <SessionProvider>
            <AuthGate />
          </SessionProvider>
        </ToastProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  );
}
