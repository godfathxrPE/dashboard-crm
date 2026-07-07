'use client';

import { Plus } from 'lucide-react';
import type { ProtocolResult } from '@/types/database';

export type ActionItem = ProtocolResult['action_items'][number];

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-text-dim">{title}</p>
      <ul className="list-disc space-y-0.5 pl-4 text-text-main">
        {items.map((it, i) => <li key={i} className="whitespace-pre-wrap">{it}</li>)}
      </ul>
    </div>
  );
}

/**
 * Протокол встречи. Только текст (без markdown→HTML). Каждое поручение — кнопка
 * «Создать задачу»: AI предлагает, юзер подтверждает в форме (injection-защита).
 */
export function ProtocolRenderer({
  result,
  onCreateTask,
}: {
  result: ProtocolResult;
  onCreateTask: (item: ActionItem) => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <Section title="Участники" items={result.participants} />
      <Section title="Повестка" items={result.agenda} />
      <Section title="Обсуждалось" items={result.discussed} />
      <Section title="Решения" items={result.decisions} />

      {result.action_items && result.action_items.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-text-dim">Поручения</p>
          <ul className="space-y-1.5">
            {result.action_items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-text-main">{item.what}</p>
                  <p className="mt-0.5 text-xs text-text-mute">
                    {item.who ? `Кто: ${item.who}` : 'Ответственный не указан'}
                    {item.due ? ` · Срок: ${item.due}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onCreateTask(item)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-accent hover:bg-surface-hover"
                >
                  <Plus size={12} /> Создать задачу
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section title="Открытые вопросы" items={result.open_questions} />
    </div>
  );
}
