// src/lib/data/okved.ts — S-OKVED-1, реэкспорт с S-TG-3.
//
// ⚠️ СПРАВОЧНИК ПЕРЕЕХАЛ, А НЕ РАЗДВОИЛСЯ: тело живёт в
//    `supabase/functions/_shared/okved.ts`. Причина — второй потребитель: быстрый
//    ввод из Telegram (`telegram-webhook`) выводит `companies.industry` из ОКВЭД
//    той же функцией, что и веб-виджет, а Deno до `src/` не дотягивается.
//
//    Импорт здесь БЕЗ расширения `.ts` (tsc не берёт его без
//    `allowImportingTsExtensions`), в Deno-функции — С расширением. Один файл, два
//    специфера; та же схема, что у `capture-helpers` и `telegram-capture`.
//
// Потребители не менялись: путь `@/lib/data/okved` и имя экспорта прежние.

export { okvedToIndustry } from '../../../supabase/functions/_shared/okved';
