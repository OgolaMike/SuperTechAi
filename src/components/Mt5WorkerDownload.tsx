import { Download, MonitorDown, ShieldCheck, Smartphone, Terminal } from 'lucide-react';

const WORKER_RELEASE_URL = 'https://github.com/OgolaMike/SuperTechAi/releases/latest';

export function Mt5WorkerDownload() {
  return (
    <section className="rounded-2xl border border-accent/20 bg-accent/[0.045] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-accent"><MonitorDown className="h-5 w-5" /><p className="text-xs font-bold uppercase tracking-[0.18em]">Windows companion</p></div>
          <h3 className="mt-2 text-xl font-semibold text-ink">Install the MT5 Worker on your PC</h3>
          <p className="mt-2 text-sm leading-6 text-ink-2">Your Windows computer runs the worker beside the official MetaTrader 5 terminal. Your Android or iPhone can then monitor the connection and control permitted settings.</p>
        </div>
        <a href={WORKER_RELEASE_URL} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent px-4 py-3 text-sm font-semibold text-white hover:brightness-110">
          <Download className="h-4 w-4" /> Get Windows worker
        </a>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line/10 bg-surface/[0.04] p-3"><Terminal className="h-4 w-4 text-accent" /><p className="mt-2 text-sm font-semibold text-ink">1. Install on Windows</p><p className="mt-1 text-xs leading-5 text-ink-2">Windows 10/11, Python 3.11 (64-bit) and MT5 desktop are required.</p></div>
        <div className="rounded-xl border border-line/10 bg-surface/[0.04] p-3"><ShieldCheck className="h-4 w-4 text-accent" /><p className="mt-2 text-sm font-semibold text-ink">2. Pair securely</p><p className="mt-1 text-xs leading-5 text-ink-2">Create a worker pairing below. The one-time token is stored in Windows Credential Manager.</p></div>
        <div className="rounded-xl border border-line/10 bg-surface/[0.04] p-3"><Smartphone className="h-4 w-4 text-accent" /><p className="mt-2 text-sm font-semibold text-ink">3. Control from mobile</p><p className="mt-1 text-xs leading-5 text-ink-2">Use SuperTech AI on Android or iPhone to monitor the PC worker. The phone does not run MT5.</p></div>
      </div>
      <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-ink-2">The release page hosts the Windows worker package when a version is published. If no release is listed yet, the packaged download is not published; do not install unverified scripts from third-party sources. Live and demo accounts are supported, but every pending order remains subject to the app's separate permissions, risk checks and confirmation.</p>
    </section>
  );
}
