import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        surface3: 'var(--surface3)',
        border: 'var(--border)',
        accent: 'var(--accent)',
        'accent-l': 'var(--accent-l)',
        'text-main': 'var(--text)',
        'text-dim': 'var(--text-dim)',
        'text-mute': 'var(--text-mute)',
        purple: 'var(--purple)',
        'purple-l': 'var(--purple-l)',
      },
      borderRadius: {
        sm: 'var(--radius-s)',
        md: 'var(--radius-m)',
        lg: 'var(--radius-l)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
      },
    },
  },
  plugins: [],
};

export default config;
