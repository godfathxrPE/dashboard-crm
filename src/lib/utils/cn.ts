import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Проектные кегли `text-meta`/`text-body` (tailwind.config.ts → fontSize) штатный
// twMerge не знает и считает цветом текста: `cn('text-meta', 'text-text-dim')`
// выбрасывал кегль. Регистрируем их в группе font-size — тогда они конфликтуют
// только с другими кеглями, а не с цветом (долг G-1).
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['meta', 'body'] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
