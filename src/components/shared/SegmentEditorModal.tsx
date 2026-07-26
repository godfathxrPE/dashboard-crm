'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { useCompanies } from '@/lib/hooks/use-companies';
import {
  SEGMENT_NULLARY_OPS,
  SEGMENT_OP_LABEL,
  SEGMENT_FIELDS,
  segmentFieldDef,
  type SegmentFieldDef,
} from '@/lib/constants/segments';
import { segmentFormSchema, validatePredicate } from '@/lib/validators/segment';
import {
  useCreateSegment,
  useDeleteSegment,
  useUpdateSegment,
  type SegmentInput,
} from '@/lib/hooks/use-segments';
import type { Segment, SegmentClause, SegmentEntity, SegmentOp } from '@/types/database';

/**
 * Редактор сегмента: имя, область (общий/личный), конструктор клауз.
 *
 * Сознательно НЕ JSON-редактор: сегменты заводит менеджер, а не разработчик —
 * поле выбирается из whitelist (constants/segments), оператор ограничен полем,
 * значение подставляется из справочника. Невалидную клаузу не собрать.
 */

interface SegmentEditorModalProps {
  entity: SegmentEntity;
  /** null — создание нового сегмента. */
  segment: Segment | null;
  onClose: () => void;
  /** Вызывается после успешного удаления — потребитель снимает сегмент с URL. */
  onDeleted?: (id: string) => void;
}

type Option = { value: string; label: string };

const selectClass = `rounded border border-input bg-surface px-2 py-1.5 text-xs text-text-dim
  focus:border-accent focus:outline-none`;
const inputClass = `rounded border border-input bg-surface px-2 py-1.5 text-xs text-text-main
  placeholder:text-text-mute focus:border-accent focus:outline-none`;

function defaultClause(def: SegmentFieldDef): SegmentClause {
  return { field: def.field, op: def.ops[0], value: undefined };
}

export function SegmentEditorModal({ entity, segment, onClose, onDeleted }: SegmentEditorModalProps) {
  const { data: role } = useOrgRole();
  const canShare = role === 'owner' || role === 'admin';

  const fields = useMemo(() => SEGMENT_FIELDS[entity] ?? [], [entity]);

  const [name, setName] = useState(segment?.name ?? '');
  const [isShared, setIsShared] = useState(segment?.is_shared ?? canShare);
  const [clauses, setClauses] = useState<SegmentClause[]>(segment?.predicate.and ?? []);
  const [error, setError] = useState<string | null>(null);

  const create = useCreateSegment();
  const update = useUpdateSegment();
  const remove = useDeleteSegment();
  const busy = create.isPending || update.isPending || remove.isPending;

  // Справочники значений. Грузятся всегда — модалка редкая, а условный вызов хуков запрещён.
  const { data: stages } = usePipelineStages();
  const { data: members } = useTeamMembers();
  const { data: companies } = useCompanies();

  const optionsFor = (def: SegmentFieldDef): Option[] => {
    switch (def.kind) {
      case 'enum':
        return def.options ?? [];
      case 'stage':
        return (stages ?? []).map((s) => ({ value: s.id, label: s.name }));
      case 'owner':
        return (members ?? []).map((m) => ({ value: m.id, label: m.full_name }));
      case 'company':
        return (companies ?? []).map((c) => ({ value: c.id, label: c.name }));
      default:
        return [];
    }
  };

  const patchClause = (i: number, patch: Partial<SegmentClause>) =>
    setClauses((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const addClause = () => {
    if (!fields.length) return;
    setClauses((prev) => [...prev, defaultClause(fields[0])]);
  };

  function changeField(i: number, field: string) {
    const def = segmentFieldDef(entity, field);
    if (!def) return;
    // Смена поля сбрасывает оператор и значение: старый оператор полю может быть не разрешён,
    // а старое значение почти наверняка из другого справочника.
    setClauses((prev) => prev.map((c, idx) => (idx === i ? defaultClause(def) : c)));
  }

  function changeOp(i: number, op: SegmentOp) {
    const wasNullary = SEGMENT_NULLARY_OPS.has(clauses[i].op);
    const isNullary = SEGMENT_NULLARY_OPS.has(op);
    const changesArity = op === 'in' || clauses[i].op === 'in' || wasNullary !== isNullary;
    patchClause(i, changesArity ? { op, value: undefined } : { op });
  }

  async function submit() {
    setError(null);

    const parsedName = segmentFormSchema.safeParse({ name, is_shared: isShared });
    if (!parsedName.success) {
      setError(parsedName.error.issues[0]?.message ?? 'Проверь название');
      return;
    }
    if (isShared && !canShare) {
      setError('Общий сегмент заводит владелец или администратор организации');
      return;
    }

    const predicate = { version: 1 as const, and: clauses };
    const problem = validatePredicate(entity, predicate);
    if (problem) { setError(problem); return; }

    const input: SegmentInput = {
      name: parsedName.data.name,
      entity,
      predicate,
      is_shared: isShared,
      sort_order: segment?.sort_order ?? 100,
    };

    try {
      if (segment) await update.mutateAsync({ id: segment.id, ...input });
      else await create.mutateAsync(input);
      toast.success(segment ? 'Сегмент обновлён' : 'Сегмент создан');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить сегмент');
    }
  }

  async function destroy() {
    if (!segment) return;
    try {
      await remove.mutateAsync({ id: segment.id, entity });
      toast.success('Сегмент удалён');
      onDeleted?.(segment.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить сегмент');
    }
  }

  return (
    <Modal
      title={segment ? 'Сегмент' : 'Новый сегмент'}
      description="Условия объединяются по «И»"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <>
          {segment && (
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
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-dim
              transition-colors hover:bg-surface-hover"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white
              transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="segment-name" className="mb-1 block text-xs font-medium text-text-dim">
            Название
          </label>
          <input
            id="segment-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Например: Просрочен next action"
            className={`${inputClass} w-full text-sm`}
          />
        </div>

        <fieldset>
          <legend className="mb-1 text-xs font-medium text-text-dim">Область</legend>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-text-dim">
              <input
                type="radio"
                checked={!isShared}
                onChange={() => setIsShared(false)}
                className="accent-[var(--accent)]"
              />
              Личный — вижу только я
            </label>
            <label className="flex items-center gap-1.5 text-xs text-text-dim">
              <input
                type="radio"
                checked={isShared}
                disabled={!canShare}
                onChange={() => setIsShared(true)}
                className="accent-[var(--accent)] disabled:opacity-40"
              />
              Общий — для всей организации
            </label>
            {!canShare && (
              <span className="text-xs text-text-mute">
                Общие сегменты заводит владелец или администратор
              </span>
            )}
          </div>
        </fieldset>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-text-dim">Условия</span>
            <button
              type="button"
              onClick={addClause}
              className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <Plus size={11} /> Условие
            </button>
          </div>

          {clauses.length === 0 ? (
            <p className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-text-mute">
              Условий нет — сегмент покажет все записи.
            </p>
          ) : (
            <div className="space-y-2">
              {clauses.map((clause, i) => {
                const def = segmentFieldDef(entity, clause.field);
                const nullary = SEGMENT_NULLARY_OPS.has(clause.op);
                const options = def ? optionsFor(def) : [];
                const isDays = clause.op === 'days_since_gt' || clause.op === 'days_since_lt';
                const numeric = isDays || def?.kind === 'number';

                return (
                  <div key={i} className="flex flex-wrap items-start gap-2 rounded border border-border p-2">
                    <select
                      value={clause.field}
                      onChange={(e) => changeField(i, e.target.value)}
                      className={`${selectClass} min-w-[9rem]`}
                      aria-label="Поле"
                    >
                      {fields.map((f) => (
                        <option key={f.field} value={f.field}>{f.label}</option>
                      ))}
                    </select>

                    <select
                      value={clause.op}
                      onChange={(e) => changeOp(i, e.target.value as SegmentOp)}
                      className={selectClass}
                      aria-label="Оператор"
                    >
                      {(def?.ops ?? []).map((op) => (
                        <option key={op} value={op}>{SEGMENT_OP_LABEL[op]}</option>
                      ))}
                    </select>

                    {!nullary && (
                      clause.op === 'in' && options.length > 0 ? (
                        <div className="max-h-28 min-w-[10rem] flex-1 overflow-y-auto rounded border border-input bg-surface p-1.5">
                          {options.map((o) => {
                            const selected = Array.isArray(clause.value) && clause.value.includes(o.value);
                            return (
                              <label key={o.value} className="flex items-center gap-1.5 py-0.5 text-xs text-text-dim">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  className="accent-[var(--accent)]"
                                  onChange={() => {
                                    const cur = Array.isArray(clause.value) ? clause.value : [];
                                    patchClause(i, {
                                      value: selected ? cur.filter((v) => v !== o.value) : [...cur, o.value],
                                    });
                                  }}
                                />
                                {o.label}
                              </label>
                            );
                          })}
                        </div>
                      ) : options.length > 0 ? (
                        <select
                          value={typeof clause.value === 'string' ? clause.value : ''}
                          onChange={(e) => patchClause(i, { value: e.target.value })}
                          className={`${selectClass} min-w-[9rem] flex-1`}
                          aria-label="Значение"
                        >
                          <option value="">Значение…</option>
                          {options.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={numeric ? 'number' : 'text'}
                          value={
                            clause.value === undefined || Array.isArray(clause.value)
                              ? ''
                              : String(clause.value)
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            patchClause(i, {
                              value: numeric
                                ? (raw === '' ? undefined : Number(raw))
                                : raw,
                            });
                          }}
                          placeholder={isDays ? 'дней' : 'значение'}
                          className={`${inputClass} min-w-0 flex-1`}
                          aria-label="Значение"
                        />
                      )
                    )}

                    <button
                      type="button"
                      onClick={() => setClauses((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Удалить условие"
                      className="ml-auto rounded p-1.5 text-text-mute transition-colors hover:bg-surface-hover hover:text-red"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red">{error}</p>}
      </div>
    </Modal>
  );
}
