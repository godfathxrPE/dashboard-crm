import { resolveDwellThreshold, type DwellThresholds } from '@/lib/utils/deal-health';

// ═══════════════════════════════════════════════════════
// S-PIPELINE-COCKPIT-1: норма дней на стадии и тайм-датчик ячейки кокпита.
//
// Чистая логика: «сейчас» параметром, ноль запросов, юнит-тесты в tests/unit.
//
// ⚠️ Норма — ТА ЖЕ величина, что порог «залипания» (resolveDwellThreshold):
// колонки `pipeline_stages.target_days` не будет. `pipelines`/`pipeline_stages` —
// глобальные словари вне тенант-модели (RLS `USING true`), org-специфичной
// настройке в них не место; развилка S-R2-DWELL-CFG закрыта решением
// «четвёртая сущность не заводится, `stage_dwell_defaults` — единственный
// источник порога UI-сигнала». Поэтому заливка ячейки и бейдж «залипла» на
// ProjectCard согласованы по построению, а не по договорённости.
// ═══════════════════════════════════════════════════════

export type StageTimeState = 'ok' | 'warn' | 'over';

export interface StageTimeGauge {
  days: number | null; // дней на стадии; null — stage_entered_at пуст/невалиден
  norm: number | null; // норма дней; null — нормы нет (заливка не рисуется)
  pct: number | null; // min(100, days/norm*100); null без нормы/дней
  state: StageTimeState; // ok <70% · warn ≥70% · over >100%
}

/**
 * Норма дней стадии: org-оверрайд по stage_id → порог phase_group
 * (общий с бейджем «залипла»).
 *
 * `stage_target_days` пока никем не пишется — ключ читается, UI редактирования
 * появится отдельным спринтом. До тех пор всегда работает вторая ветка.
 */
export function resolveStageNorm(
  stage: { id: string; phase_group: string | null },
  targetDays: Record<string, number> | undefined,
  dwell: DwellThresholds | undefined,
): number {
  return targetDays?.[stage.id] ?? resolveDwellThreshold(stage.phase_group, dwell);
}

/**
 * Расход нормы дней текущей стадии.
 *
 * ⚠️ `days` считается ровно как в `getStageAging` (floor от разницы мс) — иначе
 * ячейка кокпита и бейдж «залипла» разошлись бы на сутки на границе.
 *
 * ⚠️ Порог `over` — по ДНЯМ (`days > norm`), а не по проценту: `pct` зажат в 100,
 * и сравнение `pct > 100` не сработало бы никогда. Ровно на норме (days === norm)
 * состояние ещё `warn` — день нормы отработан не полностью.
 */
export function stageTimeGauge(
  stageEnteredAt: string | null,
  norm: number | null,
  now: Date,
): StageTimeGauge {
  if (!stageEnteredAt) return { days: null, norm, pct: null, state: 'ok' };
  const t = new Date(stageEnteredAt).getTime();
  if (Number.isNaN(t)) return { days: null, norm, pct: null, state: 'ok' };
  const days = Math.max(0, Math.floor((now.getTime() - t) / 86400000));
  if (!norm || norm <= 0) return { days, norm: null, pct: null, state: 'ok' };
  const raw = (days / norm) * 100;
  const state: StageTimeState = days > norm ? 'over' : raw >= 70 ? 'warn' : 'ok';
  return { days, norm, pct: Math.min(100, Math.round(raw)), state };
}
