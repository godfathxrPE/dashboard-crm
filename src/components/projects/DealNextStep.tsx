'use client';

import { ChevronRight, Check } from 'lucide-react';
import { useUpdateProject, type Project } from '@/lib/hooks/use-projects';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { DealVerdictChip } from './DealSignals';
import type { DealSignalsResult } from '@/lib/domain/deal-signals';
import { getDealHealth, getNextActionOverdueDays } from '@/lib/utils/deal-health';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// S-DEAL-RAIL-1 (R-09): «Следующий шаг» — рабочая зона левой колонки.
//
// Выделен из `DealFocusPanel`: панель тянула в один ряд шаг, закреплённую
// заметку и здоровье, и справочное соседство отбирало у шага вес. Заметка и
// сигналы уехали в рельсу контекста, здесь остался шаг и одна строка вердикта
// под ним — чтобы «что делать» и «как дела» стояли рядом.
//
// Вердикт здесь ЕДИНСТВЕННЫЙ на экране: в рельсе панель сигналов рисуется без
// него (`showVerdict={false}`). Два вердикта — воспроизведение F-01.
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

export function DealNextStep({
  project,
  signals,
}: {
  project: Project;
  /** Контекст сигналов собирается один раз в `ProjectDetail` — второго запроса нет. */
  signals: DealSignalsResult;
}) {
  const updateProject = useUpdateProject();

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
    // Якорь CTA сигнала `next_step`. В peek-панели (DealFocusPanel) id не ставится
    // вовсе: она монтируется поверх страницы, и дубль увёл бы getElementById.
    <div id="deal-next-step" className="min-w-0">
      <div
        data-card
        className={cn(
          // Нормальное состояние — лист с акцентной левой границей: шаг обязан
          // читаться как рабочая зона, но не кричать. Заливка `bg-yellow-l`
          // остаётся ровно за одним состоянием — шага нет вовсе.
          'sheet border-l-[3px] border-l-accent px-4 py-3',
          noAction && 'border-yellow/40 border-l-yellow bg-yellow-l',
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
            // что реальный шаг, пролистывалось как заполненное поле.
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
                         text-xs text-text-dim transition-colors hover:bg-surface-hover hover:text-green"
            >
              <Check size={12} />
              Шаг сделан
            </button>
          )}
        </div>
      </div>

      {/* Вердикт — строкой под карточкой, без рамки: он комментирует шаг, а не
          спорит с ним за внимание. Пилюля «нет даты» рядом с полем даты НЕ
          добавляется (R-10) — тот же факт уже несёт сигнал в рельсе. */}
      {signals.signals.length > 0 && (
        <div className="mt-1.5 flex items-center gap-2 px-1">
          <DealVerdictChip verdict={signals.verdict} />
          {signals.top && (
            <span className="min-w-0 flex-1 truncate text-xs text-text-dim">
              причина: {signals.top.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
