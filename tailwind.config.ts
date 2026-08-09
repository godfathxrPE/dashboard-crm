import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // W4a: Geist убран (2 семейства woff2 без живой роли: body всё равно
      // перекрывал sans через --font-app, mono на kbd — системный достаточен).
      fontFamily: {
        sans: ['var(--font-app)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Семантические токены мелкого текста (rem, a11y-scalable). Только размер —
        // lineHeight намеренно не задан (сохранить текущее наследование, 0 сдвига).
        meta: '0.6875rem',   // 11px — подписи, мета, второстепенное
        body: '0.8125rem',   // 13px — осознанный body примитивов (Card/Table/Button/Input)
      },
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        surface3: 'var(--surface3)',
        popover: 'var(--popover)',
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
        // S-UI-SEMANTIC-1: семантический слой состояний. Палитровые токены выше
        // (red/green/yellow/blue) отвечают «какой цвет», эти — «что это значит».
        // Массовая замена 614 палитровых использований НЕ делалась намеренно: в
        // большинстве мест red — это домен (приоритет, стадия, статус сделки), а не
        // danger. Семантику берём там, где цвет означает состояние операции.
        // Источник значений — :root в конце globals.css, alias на палитру темы.
        danger: 'var(--danger)',
        'danger-l': 'var(--danger-l)',
        'danger-text': 'var(--danger-text)',
        success: 'var(--success)',
        'success-l': 'var(--success-l)',
        'success-text': 'var(--success-text)',
        warning: 'var(--warning)',
        'warning-l': 'var(--warning-l)',
        'warning-text': 'var(--warning-text)',
        info: 'var(--info)',
        'info-l': 'var(--info-l)',
        'info-text': 'var(--info-text)',
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
        lg: 'var(--radius-l)',
        xl: 'calc(var(--radius-l) + 2px)',
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
