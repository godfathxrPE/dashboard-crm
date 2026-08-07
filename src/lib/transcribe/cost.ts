// S-R3-VOICE-1: оценка стоимости расшифровки — по образцу `estimateRunCostRub`
// из `lib/constants/ai-presets.ts` (та же таблица цен, тот же курс).
//
// Считается ОТ ДЛИТЕЛЬНОСТИ аудио, а не от размера файла: байты зависят от битрейта
// и о деньгах не говорят ничего. Длительность известна до запуска (`probeDuration`
// или секундомер записи); неизвестна — оценки не показываем вовсе.

import { PRICE_PER_MTOK, USD_RUB } from '@/lib/constants/ai-presets';

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
 * Выход вычитки ≈ вход: Claude возвращает ТОТ ЖЕ текст, только с пунктуацией и
 * метками говорящих. Именно этим оценка вычитки отличается от `estimateRunCostRub`,
 * где выход фиксирован ~2К токенов структурированного ответа: там модель пишет
 * сводку, здесь — переписывает всё целиком, и выходные токены (в 5 раз дороже
 * входных у sonnet) дают основную часть счёта.
 */
const CLEANUP_OUTPUT_RATIO = 1.15;

/** Кириллица в токенизаторе Claude — примерно 2.5 символа на токен (константа проекта). */
const CHARS_PER_TOKEN = 2.5;

export type TranscribeCost = {
  /** Распознавание в Groq, ₽ */
  groq: number;
  /** Вычитка в Claude, ₽. Ноль, если вычитка выключена. */
  cleanup: number;
  /** Сумма, ₽ */
  total: number;
};

function rub(usd: number): number {
  return Math.round(usd * USD_RUB * 10) / 10;
}

/**
 * Оценка прогона расшифровки.
 *
 * Модель вычитки берётся sonnet: дефолт edge-функции (`CLEANUP_MODEL`). Реальную
 * модель задаёт секрет `TRANSCRIBE_CLEANUP_MODEL`, клиенту он не виден — на haiku
 * счёт выйдет примерно вчетверо меньше показанного.
 */
export function estimateTranscribeCost(
  durationSec: number,
  opts: { model: WhisperModel; cleanup: boolean },
): TranscribeCost {
  const hours = Math.max(0, durationSec) / 3600;
  const groq = rub(hours * GROQ_USD_PER_HOUR[opts.model]);

  let cleanup = 0;
  if (opts.cleanup) {
    const inTok = (Math.max(0, durationSec) * SPEECH_CHARS_PER_SEC) / CHARS_PER_TOKEN;
    const outTok = inTok * CLEANUP_OUTPUT_RATIO;
    const usd =
      (inTok * PRICE_PER_MTOK.sonnet.in + outTok * PRICE_PER_MTOK.sonnet.out) / 1_000_000;
    cleanup = rub(usd);
  }

  return { groq, cleanup, total: Math.round((groq + cleanup) * 10) / 10 };
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
