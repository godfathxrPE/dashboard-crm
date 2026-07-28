'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import {
  CHECKLIST_DIRECTION_OPTIONS,
  CHECKLIST_KIND_OPTIONS,
  CHECKLIST_TYPE_OPTIONS,
  slugifyChecklistKey,
} from '@/lib/constants/checklists';
import { checklistTemplateFormSchema } from '@/lib/validators/checklist';
import {
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
  useUpdateChecklistTemplate,
  type ChecklistTemplateInput,
} from '@/lib/hooks/use-project-checklists';
import type { ChecklistTemplate, ChecklistTemplateItem, ChecklistType } from '@/types/database';

/**
 * Редактор шаблона sign-off чеклиста (R2-P1-G).
 *
 * Пункты правятся здесь, а не SQL'ем — это и есть закрытие Открытого решения 1 спринта:
 * заглушечные формулировки сида заменяются реальными из 1С:ДО без миграции (labels лежат
 * в jsonb).
 *
 * `key` пункта генерируется из текста и дальше НЕ меняется при правке label: по нему
 * идёт toggle, и смена ключа осиротила бы отметки в уже развёрнутых экземплярах.
 * Кириллический label даёт пустой slug → фолбэк `item_N`.
 */

interface ChecklistTemplateEditorModalProps {
  /** null — создание нового шаблона. */
  template: ChecklistTemplate | null;
  onClose: () => void;
}

const selectClass = `rounded border border-input bg-surface px-2 py-1.5 text-xs text-text-dim
  focus:border-accent focus:outline-none`;
const inputClass = `rounded border border-input bg-surface px-2 py-1.5 text-xs text-text-main
  placeholder:text-text-mute focus:border-accent focus:outline-none`;

/** Уникальный key внутри чеклиста: slug из текста, иначе item_N, при коллизии — суффикс. */
function makeKey(label: string, taken: Set<string>, index: number): string {
  const base = slugifyChecklistKey(label) || `item_${index + 1}`;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function ChecklistTemplateEditorModal({
  template,
  onClose,
}: ChecklistTemplateEditorModalProps) {
  const [checklistType, setChecklistType] = useState<ChecklistType>(
    template?.checklist_type ?? 'doc_review',
  );
  const [title, setTitle] = useState(template?.title ?? '');
  const [direction, setDirection] = useState<'' | 'erp' | 'iiot'>(template?.direction ?? '');
  const [kind, setKind] = useState<'' | 'launch' | 'experiment'>(template?.delivery_kind ?? '');
  const [isActive, setIsActive] = useState(template?.is_active ?? true);
  const [items, setItems] = useState<ChecklistTemplateItem[]>(template?.items ?? []);
  const [error, setError] = useState<string | null>(null);

  const create = useCreateChecklistTemplate();
  const update = useUpdateChecklistTemplate();
  const remove = useDeleteChecklistTemplate();
  const busy = create.isPending || update.isPending || remove.isPending;

  function addItem() {
    setItems((prev) => [...prev, { key: '', label: '', required: true }]);
  }

  function patchItem(i: number, patch: Partial<ChecklistTemplateItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setError(null);

    // Ключи доклеиваются перед валидацией: пользователь их не вводит.
    const taken = new Set<string>();
    const withKeys = items.map((it, i) => {
      const key = it.key || makeKey(it.label, taken, i);
      taken.add(key);
      return { ...it, key, label: it.label.trim() };
    });

    const parsed = checklistTemplateFormSchema.safeParse({
      checklist_type: checklistType,
      title,
      direction,
      delivery_kind: kind,
      is_active: isActive,
      items: withKeys,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Проверь заполнение');
      return;
    }

    const input: ChecklistTemplateInput = {
      checklist_type: parsed.data.checklist_type,
      title: parsed.data.title,
      direction: parsed.data.direction === '' ? null : parsed.data.direction,
      delivery_kind: parsed.data.delivery_kind === '' ? null : parsed.data.delivery_kind,
      is_active: parsed.data.is_active,
      items: parsed.data.items,
    };

    try {
      if (template) await update.mutateAsync({ id: template.id, ...input });
      else await create.mutateAsync(input);
      toast.success(template ? 'Шаблон обновлён' : 'Шаблон создан');
      onClose();
    } catch (err) {
      // Слот занят — единственный активный шаблон на (org, тип, направление, вид),
      // uq_checklist_templates_slot. Сообщение БД про индекс менеджеру бесполезно.
      const msg = err instanceof Error ? err.message : 'Не удалось сохранить шаблон';
      setError(
        /uq_checklist_templates_slot|duplicate key/i.test(msg)
          ? 'Активный шаблон этого типа с такими направлением и видом уже есть'
          : msg,
      );
    }
  }

  async function destroy() {
    if (!template) return;
    try {
      await remove.mutateAsync(template.id);
      toast.success('Шаблон удалён');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить шаблон');
    }
  }

  return (
    <Modal
      title={template ? 'Шаблон чеклиста' : 'Новый шаблон чеклиста'}
      description="Обязательные пункты блокируют завершение внедрения"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <>
          {template && (
            <button
              type="button"
              onClick={destroy}
              disabled={busy}
              className="mr-auto rounded-lg border border-border px-3 py-2 text-sm text-red
                transition-colors hover:bg-surface-hover disabled:opacity-40"
            >
              Удалить
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-dim
              transition-colors hover:bg-surface-hover disabled:opacity-40"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white
              transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red/40 bg-red/5 p-2.5 text-xs text-red">
          {error}
        </div>
      )}

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-dim">Тип</span>
          <select
            value={checklistType}
            onChange={(e) => setChecklistType(e.target.value as ChecklistType)}
            className={selectClass}
          >
            {CHECKLIST_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-dim">Название</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Проверка документов перед сдачей"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-dim">Направление</span>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as '' | 'erp' | 'iiot')}
            className={selectClass}
          >
            {CHECKLIST_DIRECTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-dim">Вид внедрения</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as '' | 'launch' | 'experiment')}
            className={selectClass}
          >
            {CHECKLIST_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="mb-4 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--accent)]"
        />
        <span className="text-xs text-text-dim">
          Активен — разворачивается на новых внедрениях
        </span>
      </label>

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text-dim">Пункты</span>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs
            font-medium text-text-dim transition-colors hover:bg-surface2"
        >
          <Plus size={12} /> Пункт
        </button>
      </div>

      {items.length === 0 ? (
        <p className="py-2 text-center text-xs text-text-mute">Пунктов пока нет.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2">
              {/* Порядок пунктов = порядок в массиве; drag-сортировки нет намеренно
                  (переставлять пункты sign-off не планируется — см. спринт). */}
              <span className="w-4 shrink-0 text-center text-xs text-text-mute">{i + 1}</span>

              <input
                value={it.label}
                onChange={(e) => patchItem(i, { label: e.target.value })}
                placeholder="Текст пункта"
                className={`min-w-0 flex-1 ${inputClass}`}
              />

              <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-text-dim">
                <input
                  type="checkbox"
                  checked={it.required}
                  onChange={(e) => patchItem(i, { required: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                обяз.
              </label>

              <button
                type="button"
                onClick={() => removeItem(i)}
                className="shrink-0 p-1 text-text-mute transition-colors hover:text-text-main"
                aria-label="Удалить пункт"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-text-mute">
        Правка шаблона НЕ меняет уже развёрнутые чеклисты проектов — экземпляр после
        создания живёт отдельно.
      </p>
    </Modal>
  );
}
