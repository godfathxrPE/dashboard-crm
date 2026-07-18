// ═══════════════════════════════════════════════════════
// План-импорт (S-PLAN-IMPORT-1): чистые хелперы парсинга
// Excel-плана внедрения (фазы + этапы + даты + вехи).
// Extracted for testability — по образцу import-helpers.ts.
// ═══════════════════════════════════════════════════════

import { localDateKey } from './date-helpers';

export type PlanFieldKey = 'phase' | 'taskText' | 'start' | 'end' | 'milestone' | 'wbs' | 'skip';

/** Автодетект колонки плана по заголовку.
 *  Длинные stems — через includes; короткие/неоднозначные («С», «По», «№», «Код») —
 *  ТОЛЬКО точное равенство, иначе «Список»/«Поставщик» ловятся как даты (W1).
 *  Порядок: end-правила ДО start («Окончание» не должно поймать start-ветку). */
export function autoDetectPlanMapping(header: string): PlanFieldKey {
  const h = String(header).toLowerCase().trim();
  if (!h) return 'skip';

  // exact-правила для коротких токенов
  if (h === 'с') return 'start';
  if (h === 'по') return 'end';
  if (h === '№' || h === 'код') return 'wbs';

  if (h.includes('wbs') || h.includes('иерарх')) return 'wbs';
  if (h.includes('веха') || h.includes('milestone') || h.includes('контрольн')) return 'milestone';
  if (h.includes('фаза') || h.includes('этап') || h.includes('раздел')) return 'phase';
  // end ДО start
  if (h.includes('оконч') || h.includes('конец') || h.includes('финиш') || h.includes('завершен')) return 'end';
  if (h.includes('начал') || h.includes('старт')) return 'start';
  if (h.includes('задач') || h.includes('работа') || h.includes('наименован') || h.includes('операци')) return 'taskText';
  return 'skip';
}

/** Excel-serial → unix ms: serial 25569 = 1970-01-01 (эпоха Excel 1899-12-30).
 *  Диапазон-гард: вне 1954..2119 считаем не-датой (случайное число в ячейке). */
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
const MS_PER_DAY = 86_400_000;

/** Ячейка плана → date-ключ `YYYY-MM-DD` или null (пусто/мусор).
 *  Date (из cellDates:true) → reuse localDateKey (W5, БЕЗ toISOString — TZ-сдвиг);
 *  number (serial, если cellDates не сработал) → конверсия через UTC-геттеры;
 *  строки `дд.мм.гггг` / `гггг-мм-дд` → нормализация. */
export function parsePlanDate(cell: unknown): string | null {
  if (cell instanceof Date) {
    if (isNaN(cell.getTime())) return null;
    return localDateKey(cell);
  }

  if (typeof cell === 'number') {
    if (!isFinite(cell) || cell < 20000 || cell > 80000) return null;
    const d = new Date((Math.round(cell) - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  if (typeof cell === 'string') {
    const s = cell.trim();
    if (!s) return null;

    // гггг-мм-дд (допускаем однозначные месяц/день)
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      const [, y, m, day] = iso;
      if (Number(m) < 1 || Number(m) > 12 || Number(day) < 1 || Number(day) > 31) return null;
      return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // дд.мм.гггг
    const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (ru) {
      const [, day, m, y] = ru;
      if (Number(m) < 1 || Number(m) > 12 || Number(day) < 1 || Number(day) > 31) return null;
      return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return null;
  }

  return null;
}

/** Ячейка «Веха» → boolean. Явные yes-маркеры, иначе false. */
export function parseMilestone(cell: unknown): boolean {
  if (cell === true) return true;
  if (typeof cell === 'number') return cell === 1;
  const s = String(cell ?? '').toLowerCase().trim();
  return ['да', 'yes', 'true', '1', 'x', 'х', '✓', '+', 'веха'].includes(s);
}

export interface PlanRow {
  phase: string;
  taskText: string;
  start: string | null;
  end: string | null;
  milestone: boolean;
  wbs: string;
}

/** Сырая строка листа + маппинг колонок → нормализованная строка плана.
 *  Даты парсим из СЫРОЙ ячейки (Date/number/string), не из String(cell). */
export function applyPlanMapping(row: unknown[], mapping: Record<number, PlanFieldKey>): PlanRow {
  const raw: Partial<Record<PlanFieldKey, unknown>> = {};
  for (const [colIdx, field] of Object.entries(mapping)) {
    if (field !== 'skip') raw[field] = row[Number(colIdx)];
  }
  return {
    phase: String(raw.phase ?? '').trim(),
    taskText: String(raw.taskText ?? '').trim(),
    start: parsePlanDate(raw.start),
    end: parsePlanDate(raw.end),
    milestone: parseMilestone(raw.milestone),
    wbs: String(raw.wbs ?? '').trim(),
  };
}
