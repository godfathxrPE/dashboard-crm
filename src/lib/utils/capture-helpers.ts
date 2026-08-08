// src/lib/utils/capture-helpers.ts — S-QUICK-CAPTURE-1, реэкспорт с S-TG-3.
//
// ⚠️ РЕАЛИЗАЦИЯ ПЕРЕЕХАЛА, А НЕ РАЗДВОИЛАСЬ. Тело живёт в
//    `supabase/functions/_shared/capture-helpers.ts`, потому что с S-TG-3 у него два
//    потребителя: этот бандл и Deno-функция `telegram-webhook` (быстрый ввод из
//    Telegram). Дублировать файл было альтернативой — и она отвергнута: расхождение
//    зеркал стоило проекту времени уже дважды.
//
//    Импортный путь здесь БЕЗ расширения `.ts` (tsc не берёт его без
//    `allowImportingTsExtensions`), а в Deno-функции — С расширением. Один файл, два
//    специфера; `exclude: ["supabase/functions"]` в tsconfig этому не мешает —
//    он фильтрует только поиск по `include`, импортированный файл в программу
//    попадает всегда.
//
// Модули-потребители не менялись: путь `@/lib/utils/capture-helpers` и имена
// экспортов те же, что были в S-QUICK-CAPTURE-1.

export {
  hasValidInnChecksum,
  extractInn,
  phoneKey,
  extractEmail,
  normalizeCompanyName,
  findCaptureDuplicate,
} from '../../../supabase/functions/_shared/capture-helpers';

export type {
  CaptureDuplicate,
  DedupCaptureInput,
  DedupContactRow,
  DedupCompanyRow,
} from '../../../supabase/functions/_shared/capture-helpers';
