import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        surface3: 'var(--surface3)',
        border: 'var(--border)',
        'border2': 'var(--border2)',
        accent: 'var(--accent)',
        'accent-l': 'var(--accent-l)',
        'accent-l2': 'var(--accent-l2)',
        'text-main': 'var(--text)',
        'text-dim': 'var(--text-dim)',
        'text-mute': 'var(--text-mute)',
        green: 'var(--green)',
        'green-l': 'var(--green-l)',
        red: 'var(--red)',
        'red-l': 'var(--red-l)',
        blue: 'var(--blue)',
        'blue-l': 'var(--blue-l)',
        yellow: 'var(--yellow)',
        'yellow-l': 'var(--yellow-l)',
        purple: 'var(--purple)',
        'purple-l': 'var(--purple-l)',
        chart: {
          fjord: '#5B5EA6',
          granit: '#6D5D7B',
          skog: '#3E6B58',
          is: '#3D6B7E',
          stal: '#4A5E8A',
        },
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-s)',
        md: 'var(--radius-m)',
        lg: 'var(--radius-l)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
      },
      transitionTimingFunction: {
        'ease-out-custom': 'var(--ease-out)',
        spring: 'var(--ease-spring)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        normal: 'var(--duration-normal)',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
        input: 'var(--border-input)',
      },
      divideColor: {
        DEFAULT: 'var(--border)',
      },
      outlineColor: {
        DEFAULT: 'var(--border)',
      },
      ringColor: {
        DEFAULT: 'var(--accent)',
      },
    },
  },
  plugins: [],
};

export default config;
