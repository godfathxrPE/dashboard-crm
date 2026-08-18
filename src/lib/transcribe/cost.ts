// S-R3-VOICE-1 → S-LLM-OPENROUTER-1: оценка прогона расшифровки.
//
// Считается ОТ ДЛИТЕЛЬНОСТИ аудио, а не от размера файла: байты зависят от битрейта
// и о деньгах не говорят ничего. Длительность известна до запуска (`probeDuration`
// или секундомер записи); неизвестна — оценки не показываем вовсе.
//
// ⚠️ ДВЕ ПОЛОВИНЫ ПРОГОНА ОЦЕНИВАЮТСЯ ПО-РАЗНОМУ, и это не непоследовательность:
//
//   • РАСПОЗНАВАНИЕ (Groq) — в рублях. Модель выбирает сам пользователь тумблером
//     «быстро/точно», тариф Groq привязан к часу аудио, и на OpenRouter этот путь
//     НЕ переезжал: ASR ходит в api.groq.com напрямую (`GROQ_URL` в edge-функции).
//     Все три множителя клиенту известны — значит, число обосновано.
//
//   • ВЫЧИТКА (Claude/LLM) — в токенах, без рублей. Модель задаёт секрет
//     `TRANSCRIBE_CLEANUP_MODEL`, провайдера — `TRANSCRIBE_PROVIDER`; клиенту не
//     видно ни того, ни другого. Прежняя версия считала вычитку по прайсу sonnet
//     и приписывала: «на haiku выйдет вчетверо меньше». Приписка честная, число —
//     нет: после переезда там может стоять модель на порядок дешевле, а цифра
//     выглядела бы так же достоверно. Фактический расход виден после прогона.

import { CHARS_PER_TOKEN, USD_RUB, formatTokens } from '@/lib/constants/ai-presets';

/**
 * Прайс Groq на аудио, $ за час (сверено 2026-08). Цены провайдеров меняются молча —
 * при расхождении с фактом по счёту править здесь, а не подгонять коэффициент.
 */
const GROQ_USD_PER_HOUR = { 'whisper-large-v3': 0.111, 'whisper-large-v3-turbo': 0.04 };

export type WhisperModel = keyof typeof GROQ_USD_PER_HOUR;

/**
 * Плотность русской деловой речи — символов в секунду. ~14 симв/с ≈ 840 в минуту
 * ≈ 50К символов на час разговора. Эвристика для ПРОГНОЗА; факт по завершении
 * известен точно (длина полученного текста), но к моменту показа кнопки его нет.
 */
const SPEECH_CHARS_PER_SEC = 14;

/**
 * Выход вычитки ≈ вход: модель возвращает ТОТ ЖЕ текст, только с пунктуацией и
 * метками говорящих. Именно этим вычитка отличается от пресетов ai-run, где выход
 * фиксирован ~2К токенов структурированного ответа: там пишется сводка, здесь —
 * переписывается всё целиком, и выходные токены дают основную часть счёта.
 */
const CLEANUP_OUTPUT_RATIO = 1.15;

export type TranscribeEstimate = {
  /** Распознавание в Groq, ₽. */
  groqRub: number;
  /** Объём вычитки в токенах. null — вычитка выключена тумблером. */
  cleanup: { inTok: number; outTok: number } | null;
};

function rub(usd: number): number {
  return Math.round(usd * USD_RUB * 10) / 10;
}

export function estimateTranscribeCost(
  durationSec: number,
  opts: { model: WhisperModel; cleanup: boolean },
): TranscribeEstimate {
  const sec = Math.max(0, durationSec);
  const groqRub = rub((sec / 3600) * GROQ_USD_PER_HOUR[opts.model]);

  if (!opts.cleanup) return { groqRub, cleanup: null };

  const inTok = Math.round((sec * SPEECH_CHARS_PER_SEC) / CHARS_PER_TOKEN);
  return { groqRub, cleanup: { inTok, outTok: Math.round(inTok * CLEANUP_OUTPUT_RATIO) } };
}

/** Подпись оценки рядом с кнопкой: рубли Groq + объём вычитки. */
export function formatTranscribeEstimate(est: TranscribeEstimate): string {
  const parts = [`≈ ${est.groqRub} ₽ распознавание`];
  if (est.cleanup) {
    parts.push(`${formatTokens(est.cleanup.inTok + est.cleanup.outTok)} токенов вычитки`);
  }
  return parts.join(' · ');
}

/** «1:23:45» / «7:12» — длительность для подписи рядом с оценкой. */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}
