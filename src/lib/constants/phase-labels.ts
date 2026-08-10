import { DELIVERY_PHASE_LABELS } from '@/lib/constants/delivery-phases';

// ═══════════════════════════════════════════════════════
// Подписи phase_group — единый словарь для карты воронки (StageRail) и кокпита.
//
// Жил внутри StackedPipeline.tsx и пережил его удаление (S-PIPELINE-COCKPIT-1).
// Слаги deal (attraction/…) и delivery (initiated/…) НЕ пересекаются, поэтому
// один плоский словарь обслуживает обе воронки — как и раньше.
//
// ⚠️ PHASE_COLOR/PHASE_TEXT сюда НЕ переехали намеренно: в едином языке воронки
// категория (фаза) больше не кодируется цветом — цвет остался только за
// состоянием (пройдено/текущая/просрочка). Токены --track-* новыми
// компонентами не используются.
// ═══════════════════════════════════════════════════════

export const PHASE_LABELS: Record<string, string> = {
  attraction: 'Привлечение',
  working: 'Проработка',
  approval: 'Согласование',
  closing: 'Закрытие',
  ...DELIVERY_PHASE_LABELS,
};

/** Подпись группы с фолбэком на сырой ключ — неизвестная группа не превращается в «—». */
export function phaseLabel(key: string | null | undefined): string {
  if (!key) return '—';
  return PHASE_LABELS[key] ?? key;
}
