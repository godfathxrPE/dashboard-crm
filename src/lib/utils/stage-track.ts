/**
 * Путь B: 3-трек (легаси-совместимость таблицы сделок) из `phase_group` стадии
 * pipeline_stages — вместо legacy enum `stage` + STAGE_CONFIG.order.
 *
 * Сохраняет прежнее поведение фильтра ProjectsTable (3 трека), но источником делает
 * `phase_group` (истина из pipeline_stages), а не разъехавшееся зеркало `stage`.
 * Кандидат на выравнивание к 4 phase_group — отдельным UX-заходом, не рефактором.
 */
export type StageTrack = 'Подготовка' | 'Эксперимент' | 'Проект';

export function trackFromPhaseGroup(
  phaseGroup: string | null | undefined,
): StageTrack | null {
  switch (phaseGroup) {
    case 'attraction':
      return 'Подготовка';
    case 'working':
    case 'approval':
      return 'Эксперимент';
    case 'closing':
      return 'Проект';
    default:
      return null;
  }
}
