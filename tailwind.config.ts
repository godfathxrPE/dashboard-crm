import type { Config } from 'tailwindcss';

/* v2.3: цвета объявлялись как 'var(--x)', и Tailwind не мог сгенерировать
   вариант с альфой — классы вида bg-red/5 и border-red/30 просто не
   существовали (замер: фона нет, рамка падала на --border). Функция-значение
   отдаёт var() без модификатора и color-mix с ним. Токены тем не трогаются.
   Функция-значение поддержана рантаймом Tailwind v3, но тип Config описывает
   значения цветов только как string — приведение спрятано в хелпер, чтобы блок
   colors остался читаемым и без `any`. */
const v = (name: string) =>
  ((({ opacityValue }: { opacityValue?: string }) =>
    // Tailwind зовёт функцию и для базовой утилиты, подставляя var(--tw-*-opacity).
    // Тогда отдаём чистый var(): базовые цвета обязаны остаться ровно теми же,
    // что до спринта (на этом держится плотность бордеров v2). color-mix идёт
    // только там, где в классе стоит реальный модификатор — литеральное число.
    opacityValue === undefined || opacityValue.startsWith('var(')
      ? `var(${name})`
      : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`) as unknown) as string;

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
        bg: v('--bg'),
        surface: v('--surface'),
        surface2: v('--surface2'),
        surface3: v('--surface3'),
        popover: v('--popover'),
        border: v('--border'),
        'border2': v('--border2'),
        accent: v('--accent'),
        'accent-l': v('--accent-l'),
        'accent-l2': v('--accent-l2'),
        'text-main': v('--text'),
        'text-dim': v('--text-dim'),
        'text-mute': v('--text-mute'),
        green: v('--green'),
        'green-l': v('--green-l'),
        red: v('--red'),
        'red-l': v('--red-l'),
        blue: v('--blue'),
        'blue-l': v('--blue-l'),
        yellow: v('--yellow'),
        'yellow-l': v('--yellow-l'),
        purple: v('--purple'),
        'purple-l': v('--purple-l'),
        // S-UI-SEMANTIC-1: семантический слой состояний. Палитровые токены выше
        // (red/green/yellow/blue) отвечают «какой цвет», эти — «что это значит».
        // Массовая замена 614 палитровых использований НЕ делалась намеренно: в
        // большинстве мест red — это домен (приоритет, стадия, статус сделки), а не
        // danger. Семантику берём там, где цвет означает состояние операции.
        // Источник значений — :root в конце globals.css, alias на палитру темы.
        danger: v('--danger'),
        'danger-l': v('--danger-l'),
        'danger-text': v('--danger-text'),
        success: v('--success'),
        'success-l': v('--success-l'),
        'success-text': v('--success-text'),
        warning: v('--warning'),
        'warning-l': v('--warning-l'),
        'warning-text': v('--warning-text'),
        info: v('--info'),
        'info-l': v('--info-l'),
        'info-text': v('--info-text'),
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
