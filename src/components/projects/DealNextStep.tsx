'use client';

import { ChevronRight, Check } from 'lucide-react';
import { useUpdateProject, type Project } from '@/lib/hooks/use-projects';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { getDealHealth, getNextActionOverdueDays } from '@/lib/utils/deal-health';
import { useFieldMoves } from '@/lib/hooks/use-stage-story';
import { pluralRu } from '@/lib/utils/plural';
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

export function DealNextStep({ project }: { project: Project }) {
  const updateProject = useUpdateProject();
  // S-DEAL-ZONES-1B (Р8): счёт из того же queryFn, что уже считал переносы
  // дедлайна — второго ключа и второго запроса нет.
  const { data: moves } = useFieldMoves(project.id);
  const stepMoves = moves?.step.count ?? 0;

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
    // `data-next-step` — отдельный хук для замеров вертикали (S-DEAL-ZONES-1A):
    // id занят якорем scrollToSignalAnchor и переиспользованию не подлежит.
    <div id="deal-next-step" data-next-step className="min-w-0">
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
        {/* S-DEAL-ZONES-1A (F-08): 72ch на теле шага — при широкой левой колонке
            строка уходила за 100 знаков при норме 45–75. */}
        <div className="max-w-[72ch] text-base leading-snug">
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
          {/* Порог ≥2 из Р8: один перенос — работа, два и больше — диагноз. */}
          {stepMoves >= 2 && (
            <span className="text-warning-text">
              перенесён {stepMoves} {pluralRu(stepMoves, 'раз', 'раза', 'раз')}
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

      {/* Вердикт отсюда УБРАН (S-DEAL-ZONES-1B): он переехал в зону «Риски», к
          кольцу и посигнальной полосе. Держать его в обоих местах — это F-01,
          два словесных носителя одного факта. Причина («Шаг просрочен на N
          дн.») там же первой строкой списка сигналов, так что потерян дубль,
          а не смысл. Пилюля «нет даты» рядом с полем даты по-прежнему не
          добавляется (R-10). */}
    </div>
  );
}
