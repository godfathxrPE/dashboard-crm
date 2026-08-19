// src/lib/utils/capture-resolve.ts — S-TG-TASK-1, реэкспорт.
//
// ⚠️ РЕАЛИЗАЦИЯ НЕ РАЗДВОЕНА. Тело живёт в
//    `supabase/functions/_shared/capture-resolve.ts`: его читает Deno-функция
//    `telegram-webhook`, а отсюда — тесты и (в будущем) веб-виджет. Тот же приём,
//    что у `capture-helpers`: один файл, два специфера — Deno с расширением `.ts`,
//    TS без него (`allowImportingTsExtensions` в tsconfig разрешает и первое).

export {
  resolveAssignee,
  resolveProject,
  resolveCompany,
  pickSingleMatch,
  hintMatchesName,
  significantHintTokens,
  coarseNeedle,
  RESOLVE_FETCH_LIMIT,
} from '../../../supabase/functions/_shared/capture-resolve';

export type {
  Resolved,
  ResolveReason,
  ResolveCandidate,
  ResolveDb,
  ResolveBuilder,
  MatchMode,
} from '../../../supabase/functions/_shared/capture-resolve';
