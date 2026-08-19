// src/lib/transcribe/hallucinations.ts — S-FIX-VOICE-1, реэкспорт с S-TG-VOICE-1.
//
// ⚠️ РЕАЛИЗАЦИЯ ПЕРЕЕХАЛА В `supabase/functions/_shared/hallucinations.ts`, потому что
//    с S-TG-VOICE-1 у неё два потребителя: этот бандл и Deno-функция
//    `telegram-webhook` (голосовое из Telegram). Тот же приём, что у
//    `capture-helpers` и `capture-resolve`: один файл, два специфера — Deno с
//    расширением `.ts`, TS без него (`allowImportingTsExtensions` разрешает и первое).
//
// Потребители не менялись: путь `@/lib/transcribe/hallucinations` и имена экспортов
// те же, что были в S-FIX-VOICE-1/2.

export {
  stripHallucinations,
  buildTail,
  segmentsToText,
  isLowQualitySegment,
  HALLUCINATION_STAMPS,
  SEGMENT_THRESHOLDS,
} from '../../../supabase/functions/_shared/hallucinations';

export type { WhisperSegment } from '../../../supabase/functions/_shared/hallucinations';
