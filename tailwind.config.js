const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        line: token('line'),
        ink: token('ink'),
        'ink-2': token('ink-2'),
        'ink-3': token('ink-3'),
        up: token('up'),
        down: token('down'),
        accent: token('accent'),
        warn: token('warn'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: ['0.875rem', { lineHeight: '1.5' }],
        sm: ['1rem', { lineHeight: '1.5' }],
        base: ['1.125rem', { lineHeight: '1.5' }],
        lg: ['1.25rem', { lineHeight: '1.4' }],
        xl: ['1.375rem', { lineHeight: '1.3' }],
        '2xl': ['1.75rem', { lineHeight: '1.2' }],
        '3xl': ['2.25rem', { lineHeight: '1.15' }],
      },
      keyframes: {
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-drain': {
          '0%': { transform: 'scaleX(1)' },
          '100%': { transform: 'scaleX(0)' },
        },
        'orb-drift-a': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(6%, 8%, 0) scale(1.12)' },
        },
        'orb-drift-b': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(-8%, -6%, 0) scale(0.92)' },
        },
        'grid-pan': {
          '0%': { transform: 'translate3d(0, 0, 0)' },
          '100%': { transform: 'translate3d(48px, 48px, 0)' },
        },
        'scan-sweep': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'toast-drain': 'toast-drain 15s linear forwards',
        'orb-a': 'orb-drift-a 18s ease-in-out infinite',
        'orb-b': 'orb-drift-b 22s ease-in-out infinite',
        'grid-pan': 'grid-pan 24s linear infinite',
        'scan-sweep': 'scan-sweep 9s linear infinite',
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--accent) / 0.3), 0 0 28px -6px rgb(var(--accent) / 0.45)',
        'glow-up': '0 0 0 1px rgb(var(--up) / 0.3), 0 0 28px -6px rgb(var(--up) / 0.4)',
        'glow-down': '0 0 0 1px rgb(var(--down) / 0.3), 0 0 28px -6px rgb(var(--down) / 0.4)',
      },
    },
  },
  plugins: [],
};
