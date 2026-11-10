import { Sparkles } from 'lucide-react';

type Props = {
  lessons: Array<{ id: string; title: string }>;
  isAdmin: boolean;
};

export function AcademyBackgroundPublisher({ isAdmin }: Props) {
  // Video rendering and publishing are handled by the backend GitHub Actions worker.
  // Never start a second browser-bound publishing queue when an administrator opens Academy.
  if (!isAdmin) return null;
  return (
    <section className="rounded-2xl border border-cyan-300/20 bg-surface/[0.035] p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Academy publishing</p>
          <p className="mt-1 text-sm font-semibold text-ink">Backend publishing only</p>
          <p className="mt-1 text-xs text-ink-3">Videos are rendered by the automated publishing worker. Opening this page will not start a browser-based rendering job.</p>
        </div>
        <span className="rounded-full border border-cyan-300/20 px-3 py-1 text-xs font-semibold text-cyan-300">Backend</span>
      </div>
    </section>
  );
}
