import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SuperTech AI startup/render error:', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink">
          <section className="w-full max-w-md rounded-2xl border border-line/20 bg-surface/[0.04] p-7 text-center shadow-2xl">
            <h1 className="text-2xl font-bold">SuperTech AI could not load</h1>
            <p className="mt-3 text-sm text-ink-2">A temporary app error interrupted startup. Your account and trading settings have not been changed.</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-canvas">Reload app</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
