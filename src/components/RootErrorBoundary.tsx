// RootErrorBoundary — last-line defense against uncaught render errors.
//
// Without it, a single throw inside DetailPane / ReportForm / VoyageReportSection
// would white-screen the whole app. Drafts may still be in IndexedDB but the
// user sees nothing. This boundary keeps the chrome up, shows the error, and
// offers a reload — the actual recovery path is reload + the offline draft
// flush from VoyageStoreProvider.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[RootErrorBoundary]', error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: 'var(--color-bg)',
          color: 'var(--color-text)',
          fontFamily: 'Manrope, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: '100%',
            padding: '2rem',
            borderRadius: 12,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: 'var(--color-dim)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            The app hit an unexpected error and couldn't continue. Your latest edits
            may already be saved as a draft in this browser. Reloading usually
            recovers from transient issues.
          </p>
          <pre
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.75rem',
              padding: '0.75rem',
              borderRadius: 6,
              background: 'var(--color-surface2)',
              color: 'var(--color-error-fg)',
              overflow: 'auto',
              maxHeight: 200,
              marginBottom: '1.25rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error.message || String(error)}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            className="btn-primary"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 8,
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
