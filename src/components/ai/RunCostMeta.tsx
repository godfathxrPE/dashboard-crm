'use client';

import { actualRunCostRub, formatTokens } from '@/lib/constants/ai-presets';
import type { AiRunRow, CompanyBriefResult } from '@/types/database';

/**
 * S-COMPANY-AI-1a — ФАКТ прогона рядом со статусом: «· 42 с · ≈ 18 ₽».
 *
 * Оценка на кнопке считается до прогона и всегда врёт (у брифа с веб-поиском врала
 * в десять раз); факт берётся из `ai_runs.input_tokens` / `output_tokens` /
 * `duration_ms`, которые пишутся с 085, но до сих пор не показывались нигде.
 *
 * Правило `null` = «неизвестно», а не «ноль», держится в трёх местах:
 *   • токенов нет (API не отдал usage) → строка стоимости не рендерится вовсе,
 *     остаётся только время;
 *   • `duration_ms` нет → нет и куска со временем;
 *   • `meta.searches` нет → веб-запросы в цену не входят (см. actualRunCostRub);
 *   • S-LLM-OPENROUTER-1: `ai_runs.model` не знаком таблице цен → строки с
 *     рублями нет вовсе, а токены и слаг остаются. Пустое место честнее
 *     неверного числа: после переезда роль пресета цену не определяет.
 *
 * Показывается у ЛЮБОГО пресета, где есть чем считать, а не только у брифа: старым
 * шести это тоже полезно и ничего не ломает.
 */
export function RunCostMeta({ run }: { run: AiRunRow }) {
  if (run.status !== 'done') return null;

  const parts: string[] = [];

  if (typeof run.duration_ms === 'number') parts.push(formatDuration(run.duration_ms));

  if (typeof run.input_tokens === 'number' && typeof run.output_tokens === 'number') {
    parts.push(`${formatTokens(run.input_tokens + run.output_tokens)} токенов`);

    // Веб-запросы известны только у брифа — у остальных пресетов их нет по определению.
    const searches = run.preset_key === 'company_brief'
      ? (run.result as CompanyBriefResult | null)?.meta?.searches ?? null
      : null;
    // ⚠️ Считаем по ФАКТИЧЕСКОМУ слагу из строки прогона, а не по роли пресета:
    // роль после S-LLM-OPENROUTER-1 о цене не говорит ничего.
    const rub = actualRunCostRub(run.input_tokens, run.output_tokens, run.model, searches);
    if (rub != null) parts.push(`≈ ${rub} ₽`);
  }

  if (parts.length === 0) return null;
  return <span className="text-xs text-text-mute">· {parts.join(' · ')}</span>;
}

/** «42 с» / «1 мин 25 с». Прогон длиннее минуты в секундах читается плохо. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} с`;
  return `${Math.floor(total / 60)} мин ${total % 60} с`;
}
