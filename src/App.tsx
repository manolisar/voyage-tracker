import { ThemeProvider } from './contexts/ThemeProvider';
import { ToastProvider } from './contexts/ToastProvider';
import { SessionProvider } from './contexts/SessionProvider';
import { AuthGate } from './components/auth/AuthGate';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SessionProvider>
          <AuthGate />
        </SessionProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
