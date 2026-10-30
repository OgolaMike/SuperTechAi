import { Moon, Sun } from 'lucide-react';
import type { Theme } from '@/hooks/useTheme';

type Props = {
  theme: Theme;
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: Props) {
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-line/10 bg-surface/[0.03] text-ink-2 transition-all duration-200 hover:border-line/20 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <span className="transition-transform duration-300 hover:rotate-12">
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </span>
    </button>
  );
}
