'use client';

import { Zap } from 'lucide-react';
import type { AutomationPreviewItem } from '@/lib/domain/stage-transition';

/**
 * Read-only список автоматизаций, которые сработают после перехода.
 *
 * ⚠️ Превью КЛИЕНТСКОЕ и приблизительное: dry-run на сервере нет (правила матчатся
 * внутри AFTER-триггера, то есть уже после записи), условия считает TS-порт
 * `wfEvalConditions`. Подпись под списком признаёт это прямо в UI — обещать
 * пользователю точность, которой нет, хуже, чем не показывать превью вовсе.
 */
export function AutomationPreviewList({ items }: { items: AutomationPreviewItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface2 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Zap size={13} className="text-text-dim" />
        <h4 className="text-xs font-semibold text-text-dim">После перехода сработает</h4>
      </div>

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.ruleId} className="text-body leading-snug">
            <span className="text-text-main">{item.name}</span>
            <span className="text-text-mute"> — {item.actionSummary}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-text-mute">
        Предварительно: правила сработают, если условия выполнятся на момент сохранения.
      </p>
    </div>
  );
}
