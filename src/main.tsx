import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthGate } from '@/components/AuthGate';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW registration is best-effort; ignore failures silently. */
    });
  });
}
