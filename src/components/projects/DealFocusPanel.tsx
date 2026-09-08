'use client';

import { ChevronRight, Pin, Check } from 'lucide-react';
import { useUpdateProject, type Project } from '@/lib/hooks/use-projects';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { DealSignals, useDealSignals } from './DealSignals';
import {
  getDealHealth,
  getNextActionOverdueDays,
} from '@/lib/utils/deal-health';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// Фокус-панель сделки — ТОЛЬКО peek 440px (ProjectPeekContent).
//
// S-DEAL-RAIL-1: на полной карточке её роль разделена. Шаг и вердикт уехали в
// `DealNextStep` (рабочая колонка), заметка и сигналы — в `DealContextRail`
// (рельса справа). Трёхколоночная разметка и проп `compact` сняты: панель
// одноколоночная по определению, второго режима у неё больше нет.
//
// Кнопок CTA у сигналов здесь нет намеренно: скроллить некуда — якоря живут на
// полной карточке, а панель монтируется поверх неё.
// ═══════════════════════════════════════════════════════

// ─── Дата следующего шага: «сегодня/завтра/вчера» вблизи, иначе «7 июля» ───
function formatActionDate(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const today = new Date(new Date().toDateString());
  const target = new Date(new Date(d).toDateString());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'сегодня';
  if (diffDays === 1) return 'завтра';
  if (diffDays === -1) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function DealFocusPanel({ project }: { project: Project }) {
  const updateProject = useUpdateProject();
  // Контекст сигналов собирается ОДИН раз здесь —
  // `useActivityLog` внутри бьёт в тот же ключ кеша, второго запроса нет.
  const signals = useDealSignals(project);

  const health = getDealHealth(project);
  const overdue = health === 'overdue-action';
  const noAction = health === 'no-action';
  const overdueDays = overdue && project.next_action_date
    ? getNextActionOverdueDays(project.next_action_date)
    : 0;

  function markStepDone() {
    updateProject.mutate({ id: project.id, next_step: null, next_action_date: null });
  }

  return (
    <div
      data-card
      // px обязателен: в Aura [data-card] делает панель карточкой,
      // без горизонтальных отступов контент прилипал к её краям
      className="mb-6 grid grid-cols-1 gap-x-8 gap-y-4 border-y border-border px-5 py-4"
    >
      {/* ─── Зона 1: Следующий шаг (доминирует) ─── */}
      <div
        className={cn(
          'min-w-0',
          noAction && 'rounded-lg border border-yellow/40 bg-yellow-l px-3 py-2',
        )}
      >
        <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-accent">
          <ChevronRight size={13} />
          Следующий шаг
        </div>
        <div className="text-base leading-snug">
          <InlineEdit
            value={project.next_step ?? ''}
            placeholder="Какой следующий шаг?"
            // S-UI-CLARITY-1: пустое состояние выглядит пустым. Цвет (text-text-mute)
            // InlineEdit даёт сам, курсив — здесь: приглашение того же начертания,
            // что реальный шаг, пролистывалось как заполненное поле. Кликабельность
            // не меняется — редактор открывается по тому же клику.
            className={cn(!project.next_step && 'italic')}
            onSave={async (val) => {
              updateProject.mutate({ id: project.id, next_step: val || null });
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
          <span className="flex items-center gap-1">
            <span className="text-text-dim">Дата:</span>
            <InlineEdit
              value={project.next_action_date ?? ''}
              type="date"
              placeholder="назначить"
              formatDisplay={formatActionDate}
              onSave={async (val) => {
                updateProject.mutate({ id: project.id, next_action_date: val || null });
              }}
              // Тот же принцип: «назначить» — приглашение, а не значение даты.
              className={cn(project.next_action_date ? 'font-medium' : 'italic', overdue && 'text-red')}
            />
          </span>
          {overdue && (
            <span className="font-medium text-red">
              просрочен {overdueDays} дн.
            </span>
          )}
          {project.next_step && (
            <button
              onClick={markStepDone}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5
                         text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-green"
            >
              <Check size={12} />
              Шаг сделан
            </button>
          )}
        </div>
      </div>

      {/* ─── Зона 2: Закреплено ─── */}
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-text-dim">
          <Pin size={12} />
          Закреплено
        </div>
        <div className="text-body leading-relaxed">
          <InlineEdit
            as="textarea"
            value={project.pinned_note ?? ''}
            placeholder="Закрепить заметку…"
            onSave={async (val) => {
              updateProject.mutate({ id: project.id, pinned_note: val || null });
            }}
          />
        </div>
      </div>

      {/* ─── Зона 3: Здоровье ─── */}
      {/* Строки «N дн. без активности» здесь больше нет: она стала сигналом
          `silence` и живёт внутри панели вместе с порогом и действием. */}
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-text-dim">
          Здоровье
        </div>
        <DealSignals result={signals} />
      </div>
    </div>
  );
}
