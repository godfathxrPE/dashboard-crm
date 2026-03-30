import type { DealStage } from '@/types/database';

interface StageConfig {
  value: DealStage;
  label: string;
  shortLabel: string;
  phase: 'attract' | 'develop' | 'negotiate' | 'close' | 'terminal';
  color: string;
  order: number;
}

export const STAGES: StageConfig[] = [
  { value: 'new_lead',           label: 'Новый лид',               shortLabel: 'Лид',        phase: 'attract',   color: 'bg-blue-100 text-blue-800',    order: 0 },
  { value: 'qualification',      label: 'Квалификация',            shortLabel: 'Квал.',       phase: 'attract',   color: 'bg-blue-100 text-blue-800',    order: 1 },
  { value: 'waiting_materials',  label: 'Ожидание материалов',     shortLabel: 'Мат-лы',      phase: 'attract',   color: 'bg-blue-100 text-blue-800',    order: 2 },
  { value: 'preparing_kp',       label: 'Подготовка КП',           shortLabel: 'Подг. КП',    phase: 'develop',   color: 'bg-amber-100 text-amber-800',  order: 3 },
  { value: 'kp_sent',            label: 'КП отправлено',           shortLabel: 'КП отпр.',    phase: 'develop',   color: 'bg-amber-100 text-amber-800',  order: 4 },
  { value: 'kp_review',          label: 'КП на согласовании',      shortLabel: 'Согл. КП',    phase: 'develop',   color: 'bg-amber-100 text-amber-800',  order: 5 },
  { value: 'preparing_docs',     label: 'Подготовка док.',         shortLabel: 'Док.',        phase: 'negotiate', color: 'bg-purple-100 text-purple-800', order: 6 },
  { value: 'cz_approval',        label: 'Согласование с ЧЗ',      shortLabel: 'ЧЗ',          phase: 'negotiate', color: 'bg-purple-100 text-purple-800', order: 7 },
  { value: 'trilateral_meeting', label: 'Трёхсторонняя встреча',   shortLabel: '3-стор.',     phase: 'negotiate', color: 'bg-purple-100 text-purple-800', order: 8 },
  { value: 'experiment_setup',   label: 'Оформление эксперимента', shortLabel: 'Эксп.',       phase: 'negotiate', color: 'bg-purple-100 text-purple-800', order: 9 },
  { value: 'contract_review',    label: 'Согласование договора',   shortLabel: 'Дог.',        phase: 'close',     color: 'bg-green-100 text-green-800',  order: 10 },
  { value: 'contract_signing',   label: 'Подписание договора',     shortLabel: 'Подпис.',     phase: 'close',     color: 'bg-green-100 text-green-800',  order: 11 },
  { value: 'won',                label: 'Сделка выиграна',         shortLabel: 'Выиграна',    phase: 'terminal',  color: 'bg-green-200 text-green-900',  order: 12 },
  { value: 'lost',               label: 'Сделка проиграна',        shortLabel: 'Проиграна',   phase: 'terminal',  color: 'bg-red-100 text-red-800',      order: 13 },
];

export const PHASES = [
  { key: 'attract',   label: 'Привлечение',  stages: STAGES.filter((s) => s.phase === 'attract') },
  { key: 'develop',   label: 'Проработка',   stages: STAGES.filter((s) => s.phase === 'develop') },
  { key: 'negotiate', label: 'Согласование', stages: STAGES.filter((s) => s.phase === 'negotiate') },
  { key: 'close',     label: 'Закрытие',     stages: STAGES.filter((s) => s.phase === 'close') },
] as const;

export function getStageConfig(stage: DealStage): StageConfig {
  return STAGES.find((s) => s.value === stage) ?? STAGES[0];
}
