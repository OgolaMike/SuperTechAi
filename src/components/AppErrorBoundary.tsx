import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = {
  failed: boolean;
  errorMessage: string;
  componentStack: string;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, errorMessage: '', componentStack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      failed: true,
      errorMessage: error?.message || 'Unknown rendering error',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SuperTech AI startup/render error:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack || '' });
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink">
          <section className="w-full max-w-lg rounded-2xl border border-line/20 bg-surface/[0.04] p-7 text-center shadow-2xl">
            <h1 className="text-2xl font-bold">SuperTech AI could not load</h1>
            <p className="mt-3 text-sm text-ink-2">A rendering error interrupted startup. Your account and trading settings have not been changed.</p>
            <details className="mt-5 rounded-xl border border-line/15 bg-black/20 p-3 text-left">
              <summary className="cursor-pointer text-sm font-semibold text-ink-2">View error details</summary>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-amber-200">{this.state.errorMessage}</pre>
              {this.state.componentStack && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-ink-3">{this.state.componentStack.slice(0, 1800)}</pre>}
            </details>
            <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-canvas">Reload app</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
