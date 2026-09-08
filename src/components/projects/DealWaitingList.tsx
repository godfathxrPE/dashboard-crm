'use client';

import { useState } from 'react';
import { useProjectColumns } from '@/lib/hooks/use-project-columns';
import { useProjectBoard } from '@/lib/hooks/use-tasks';
import { TaskModal } from '@/components/tasks/TaskModal';
import type { Task } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-DEAL-ORG-1 (W4): «Ждём» — чего по сделке не хватает и от кого.
//
// ⚠️ ЭТО НЕ «ОЖИДАЕМЫЙ ФАЙЛ» ИЗ СПЕКИ, И ЭТО ОСОЗНАННО. Спека W4 просит рисовать
// ожидаемый файл пунктирной строкой В ОБЩЕМ РЯДУ материалов. Признака `expected` у
// `project_files` (014) нет, и заводить его пришлось бы ради строки, за которой нет
// файла. Но главное — врал бы сам ряд: «ждём согласования юристов» встало бы рядом с
// PDF и прочиталось бы как документ, которого просто не видно.
//
// Источник — задачи сделки в колонках категории `paused` (`lane='wait'`, биекция
// из 032): «ждём» у проекта уже описано, и описано задачей, у которой есть срок и
// ответственный. Интент спеки (видно, чего не хватает) выполнен, задача осталась
// задачей — отдельным списком ПОД материалами, а не строкой среди файлов.
//
// ⚠️ ЗАПРОС ОДИН НА ПАРУ ВИДЖЕТОВ — КОГДА ОТКРЫТЫ ОБА. `useProjectBoard`/
// `useProjectColumns` зовутся теми же ключами кэша, что и в `ProjectBoardSection`/
// `ProjectBoard`, и React Query их дедуплицирует. Но виджеты живут в РАЗНЫХ
// `CollapsibleSection` (этот — в орг. блоке, доска — в своей), а секции независимы:
// при раскрытом орг. блоке и свёрнутой доске `DealWaitingList` остаётся
// единственным потребителем ключа и запрос инициирует сам. Это не дефект — запрос
// законный и дешевле, чем монтировать всю доску ради общего кэша.
//
// Пусто → блока нет вовсе: заголовок «Ждём» над пустотой сообщает ровно ничего.
// ═══════════════════════════════════════════════════════

export interface DealWaitingListProps {
  projectId: string;
}

export function DealWaitingList({ projectId }: DealWaitingListProps) {
  const { data: columns = [] } = useProjectColumns(projectId);
  const { tasksByColumn } = useProjectBoard(projectId);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const waiting: Task[] = [];
  for (const col of columns) {
    if (col.category !== 'paused') continue;
    for (const t of tasksByColumn[col.id] ?? []) waiting.push(t);
  }

  if (waiting.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-text-main">Ждём</span>
        <span className="rounded-full bg-bg px-1.5 py-0.5 text-xs text-text-mute">
          {waiting.length}
        </span>
      </div>

      {/* Пунктир и приглушённый тон — строка про то, чего ЕЩЁ НЕТ. Иконки файла у
          строк намеренно нет: это задачи, и путать их с материалами нельзя. */}
      <ul className="space-y-1.5">
        {waiting.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => setEditTask(t)}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border
                         px-3 py-2 text-left transition-colors hover:bg-surface2"
              style={{ borderWidth: '1.5px' }}
            >
              <span className="min-w-0 flex-1 truncate text-xs text-text-dim">{t.text}</span>
              <span className="shrink-0 text-meta text-warning-text">в ожидании</span>
            </button>
          </li>
        ))}
      </ul>

      <TaskModal
        isOpen={editTask != null}
        onClose={() => setEditTask(null)}
        editTask={editTask}
        defaultProjectId={projectId}
      />
    </div>
  );
}
