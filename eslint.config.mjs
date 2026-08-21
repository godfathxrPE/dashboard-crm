import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

// S-DEBT-CONFIRM-1: запрет браузерных модальных диалогов — не стиль, а исправление
// молчаливого отказа. После галочки «Prevent this page from creating additional dialogs»
// (Chrome предлагает её со ВТОРОГО диалога подряд, а в CRM удаляют пачками) `confirm()`
// возвращает `false` мгновенно и без единого пикселя: кнопки удаления перестают работать
// без ошибки и без лога. Плюс диалог блокирует поток (realtime, таймеры) и намертво
// вешает браузерные смоки Playwright.
//
// Правило живёт в линте, а не в договорённости: договорённость уже разъехалась на две
// взаимоисключающие «конвенции проекта» — GanttTimeline объявлял `confirm` нормой, пять
// других файлов объявляли его запретом.
const noBrowserDialogs = {
  'no-restricted-globals': [
    'error',
    {
      name: 'confirm',
      message: 'Используй InlineConfirm (src/components/ui/InlineConfirm.tsx). Причина — CLAUDE.md.',
    },
    { name: 'alert', message: 'Используй toast (sonner). Причина — CLAUDE.md.' },
    { name: 'prompt', message: 'Используй форму или модалку. Причина — CLAUDE.md.' },
  ],
  // Тот же глобал можно позвать через `window.` — `no-restricted-globals` этого не видит.
  'no-restricted-properties': [
    'error',
    {
      object: 'window',
      property: 'confirm',
      message: 'Используй InlineConfirm (src/components/ui/InlineConfirm.tsx). Причина — CLAUDE.md.',
    },
    {
      object: 'window',
      property: 'alert',
      message: 'Используй toast (sonner). Причина — CLAUDE.md.',
    },
    {
      object: 'window',
      property: 'prompt',
      message: 'Используй форму или модалку. Причина — CLAUDE.md.',
    },
  ],
};

// S-CI-2: `next lint` отбрасывал артефакты сборки сам, плоский конфиг — нет. Прямой
// вызов `eslint .` без этого списка проверяет `.next/` и даёт 190 ошибок в
// сгенерированном коде (`no-explicit-any`, `ban-ts-comment`, `no-empty-object-type`).
// В CI этого бы не случилось: `.next/` в .gitignore, а шага сборки перед линтом нет —
// каталога там просто не существует. Блок нужен ради локального паритета (`npm run lint`
// без него бесполезен) и как страховка: сборка перед линтом уронила бы CI мгновенно.
// Игнор-блок обязан быть отдельным объектом без других ключей — иначе он действует
// только на свою секцию конфига.
const buildArtifacts = {
  ignores: [
    '.next/**',
    'next-env.d.ts',   // генерится Next при каждом билде, содержит triple-slash-reference
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ],
};

const eslintConfig = [
  buildArtifacts,
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: noBrowserDialogs },
];

export default eslintConfig;
