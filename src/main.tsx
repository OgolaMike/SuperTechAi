import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
const App = lazy(() => import('./App.tsx'));
import { AuthGate } from '@/components/AuthGate';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
const NfcPublicProfile = lazy(() => import('@/components/SmartCommunity').then((module) => ({ default: module.NfcPublicProfile })));
import './index.css';

const rootElement = document.getElementById('root');
const pathParts = window.location.pathname.split('/').filter(Boolean);
const isNfcTap = pathParts.length === 2 && pathParts[0] === 'tap' && /^[a-f0-9]{64}$/i.test(pathParts[1]);

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AppErrorBoundary>
        {isNfcTap ? <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#050914] text-sm text-white/60">Verifying membership…</div>}><NfcPublicProfile /></Suspense> : <AuthGate><Suspense fallback={<div className="min-h-screen bg-canvas" />}><App /></Suspense></AuthGate>}
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
