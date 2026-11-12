import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthGate } from '@/components/AuthGate';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import './index.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AppErrorBoundary>
        <AuthGate>
          <App />
        </AuthGate>
      </AppErrorBoundary>
    </StrictMode>,
  );
} else {
  document.body.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;background:#03070f;color:#ecfeff;font:16px system-ui;padding:24px;text-align:center"><div><h1>SuperTech AI</h1><p>The app could not start. Please refresh the page.</p></div></main>';
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      void registration.update().catch(() => {
        /* A failed update check must not block app startup. */
      });
    }).catch(() => {
      /* SW registration is best-effort; ignore failures silently. */
    });
  });
}
