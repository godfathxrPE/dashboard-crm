'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Check, Loader2, ShieldAlert } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Combobox } from '@/components/shared/Combobox';
import { useDeals, useProject, type Project } from '@/lib/hooks/use-projects';
import { parseProposal } from '@/lib/validators/progression';
import {
  PROGRESSION_FIELDS,
  PROGRESSION_CONFIDENCE_LABEL,
  type ProgressionFieldKey,
} from '@/lib/constants/ai-progression';
import {
  applyProgressionPatch,
  AlreadyAppliedError,
  StaleProjectError,
} from '@/lib/domain/apply-progression';
import type { AiRunRow } from '@/types/database';

interface AiProgressionPanelProps {
  run: AiRunRow;
  /** Сделка звонка/встречи — префилл, если модель/edge не проставили target. */
  defaultProjectId?: string | null;
}

const TASK_PRIORITY_LABEL: Record<string, string> = {
  normal: 'обычный',
  important: 'важный',
  critical: 'критичный',
};

/** Текущее значение поля сделки в том же виде, в каком показываем предложенное. */
function currentValue(project: Project | undefined, key: ProgressionFieldKey): string {
  if (!project) return '—';
  const raw = project[key];
  if (raw === null || raw === undefined || raw === '') return '—';
  return String(raw);
}

function proposedValue(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

/**
 * R2-P0-C (S-R2-SDP-1) — диф-панель AI-предложения по сделке.
 *
 * Строго HITL: все чекбоксы выключены на старте, применяется только отмеченное.
 * Весь текст модели рендерится КАК ТЕКСТ (никакого HTML/markdown) — контур S28.
 * Стадии в контракте нет, поэтому её здесь нечего показывать и нечем менять.
 */
export function AiProgressionPanel({ run, defaultProjectId }: AiProgressionPanelProps) {
  const qc = useQueryClient();
  const parsed = useMemo(() => parseProposal(run.result), [run.result]);

  const { data: deals = [] } = useDeals();

  const [pickedProjectId, setPickedProjectId] = useState<string | null>(
    parsed?.proposal.target_project_id ?? defaultProjectId ?? null,
  );
  const [checkedFields, setCheckedFields] = useState<Set<ProgressionFieldKey>>(new Set());
  const [checkedTasks, setCheckedTasks] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState(false);
  const [staleWarning, setStaleWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: project } = useProject(pickedProjectId ?? '');

  const dealOptions = useMemo(
    () => deals.map((d) => ({ value: d.id, label: d.name, sub: d.company?.name ?? undefined })),
    [deals],
  );

  if (!parsed) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-red">
        <ShieldAlert size={13} className="mt-0.5 shrink-0" />
        Модель вернула некорректный ответ — применять нечего. Попробуйте повторить прогон.
      </p>
    );
  }

  const { proposal, droppedFields, droppedTasks } = parsed;
  const isApplied = !!proposal.applied_at;

  // Показываем только поля из whitelist, которые модель реально предложила.
  const offeredFields = PROGRESSION_FIELDS.filter(
    (f) => proposal.fields[f.key] !== undefined && proposal.fields[f.key] !== '',
  );
  const nothingToApply = offeredFields.length === 0 && proposal.tasks.length === 0;
  const selectedCount = checkedFields.size + checkedTasks.size;

  const toggleField = (key: ProgressionFieldKey) =>
    setCheckedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleTask = (i: number) =>
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  async function handleApply(force: boolean) {
    if (!pickedProjectId || selectedCount === 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await applyProgressionPatch({
        runId: run.id,
        proposal,
        accepted: { fields: [...checkedFields], taskIndexes: [...checkedTasks] },
        projectId: pickedProjectId,
        // Снимок из копии, которую пользователь видит в этой панели. Внутри
        // сверяется со свежим чтением — ловит правку из другого таба по стейл-кешу.
        projectUpdatedAt: project?.updated_at ?? null,
        force,
      });
      setStaleWarning(false);
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['ai_runs'] });
      qc.invalidateQueries({ queryKey: ['activity_log'] });
      const parts = [
        res.appliedFields.length > 0 ? `полей: ${res.appliedFields.length}` : null,
        res.createdTasks > 0 ? `задач: ${res.createdTasks}` : null,
      ].filter(Boolean);
      toast.success(`Сделка обновлена (${parts.join(', ')})`);
    } catch (err) {
      if (err instanceof StaleProjectError) {
        setStaleWarning(true);
        // Свежая копия — чтобы «текущее значение» в дифе перестало врать.
        qc.invalidateQueries({ queryKey: ['projects'] });
      } else if (err instanceof AlreadyAppliedError) {
        setError('Это предложение уже применено.');
        qc.invalidateQueries({ queryKey: ['ai_runs'] });
      } else {
        setError(err instanceof Error ? err.message : 'Не удалось применить предложение');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Резюме + уверенность */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded-full bg-surface2 px-2 py-0.5 text-meta text-text-mute">
          {PROGRESSION_CONFIDENCE_LABEL[proposal.confidence]}
        </span>
        <p className="min-w-0 flex-1 whitespace-pre-wrap text-text-main">{proposal.summary}</p>
      </div>

      {/* Куда пишем. Имя сделки показываем ВСЕГДА — защита от «не та сделка». */}
      <div className="rounded-lg border border-border bg-surface2/50 p-2.5">
        <div className="mb-1 text-meta font-medium text-text-dim">Куда записать</div>
        {/* Сделку определил edge из привязки звонка/встречи — менять её здесь нельзя
            (модель на target_project_id не влияет, см. stampProposal). Проверять на
            `project`, а не на загрузку, иначе на первом рендере мигнёт селектор. */}
        {proposal.target_project_id ? (
          <div className="flex items-center gap-1.5 text-xs text-text-main">
            <span className="truncate font-medium">{project?.name ?? 'Загрузка…'}</span>
            <Link
              href={`/deals/${proposal.target_project_id}`}
              className="shrink-0 text-accent hover:underline"
            >
              открыть
            </Link>
          </div>
        ) : (
          <>
            <Combobox
              options={dealOptions}
              value={pickedProjectId}
              onChange={setPickedProjectId}
              placeholder="Выберите сделку…"
              disabled={isApplied}
            />
            {!pickedProjectId && (
              <p className="mt-1 text-meta text-text-mute">
                Звонок не привязан к сделке — выберите её вручную.
              </p>
            )}
          </>
        )}
      </div>

      {/* Диф полей */}
      {offeredFields.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-meta font-medium text-text-dim">Поля сделки</div>
          {offeredFields.map((f) => (
            <label
              key={f.key}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface p-2 hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={checkedFields.has(f.key)}
                onChange={() => toggleField(f.key)}
                disabled={isApplied || pending}
                className="mt-0.5 shrink-0 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-meta text-text-mute">{f.label}</span>
                <span className="flex flex-wrap items-baseline gap-1.5 text-xs">
                  <span className="text-text-mute line-clamp-2">{currentValue(project, f.key)}</span>
                  <ArrowRight size={11} className="shrink-0 text-text-mute" />
                  <span className="font-medium text-text-main">{proposedValue(proposal.fields[f.key])}</span>
                </span>
                {f.hint && <span className="mt-0.5 block text-meta text-text-mute">{f.hint}</span>}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Задачи */}
      {proposal.tasks.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-meta font-medium text-text-dim">Задачи</div>
          {proposal.tasks.map((t, i) => (
            <label
              key={`${i}-${t.text}`}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface p-2 hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={checkedTasks.has(i)}
                onChange={() => toggleTask(i)}
                disabled={isApplied || pending}
                className="mt-0.5 shrink-0 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-text-main">{t.text}</span>
                <span className="block text-meta text-text-mute">
                  {t.due_in_days !== undefined ? `через ${t.due_in_days} дн.` : 'без срока'}
                  {t.priority ? ` · ${TASK_PRIORITY_LABEL[t.priority] ?? t.priority}` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Только чтение */}
      {proposal.risks.length > 0 && (
        <div>
          <div className="text-meta font-medium text-text-dim">Риски</div>
          <ul className="mt-0.5 space-y-0.5">
            {proposal.risks.map((r, i) => (
              <li key={i} className="text-xs text-text-dim">— {r}</li>
            ))}
          </ul>
        </div>
      )}
      {proposal.open_questions.length > 0 && (
        <div>
          <div className="text-meta font-medium text-text-dim">Открытые вопросы</div>
          <ul className="mt-0.5 space-y-0.5">
            {proposal.open_questions.map((q, i) => (
              <li key={i} className="text-xs text-text-dim">— {q}</li>
            ))}
          </ul>
        </div>
      )}

      {(droppedFields.length > 0 || droppedTasks > 0) && (
        <p className="text-meta text-yellow">
          Модель вернула некорректные значения — часть предложения скрыта
          {droppedFields.length > 0 ? ` (полей: ${droppedFields.length})` : ''}
          {droppedTasks > 0 ? ` (задач: ${droppedTasks})` : ''}.
        </p>
      )}

      {nothingToApply && (
        <p className="text-xs text-text-mute">
          По этому разговору предлагать нечего — модель не нашла оснований для правок.
        </p>
      )}

      {/* Несвежесть: применяем только после повторного подтверждения */}
      {staleWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow/40 bg-yellow/10 p-2.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-yellow" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-main">
              Сделку изменили после того, как предложение было сформировано. Проверьте
              «текущее» значение — оно обновилось. Применить всё равно?
            </p>
            <div className="mt-1.5 flex gap-2">
              <button
                type="button"
                onClick={() => handleApply(true)}
                disabled={pending}
                className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Применить всё равно
              </button>
              <button
                type="button"
                onClick={() => setStaleWarning(false)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-text-dim hover:bg-surface-hover"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-red">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {/* Применение */}
      {isApplied ? (
        <p className="flex items-center gap-1.5 text-xs text-green">
          <Check size={13} className="shrink-0" />
          Применено
          {proposal.applied
            ? ` — полей: ${proposal.applied.fields.length}, задач: ${proposal.applied.tasks}`
            : ''}
          {pickedProjectId && (
            <Link href={`/deals/${pickedProjectId}`} className="text-accent hover:underline">
              к сделке
            </Link>
          )}
        </p>
      ) : (
        !nothingToApply && (
          <div className="flex items-center gap-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={() => handleApply(false)}
              disabled={!pickedProjectId || selectedCount === 0 || pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Применить выбранное
            </button>
            <span className="text-meta text-text-mute">
              {selectedCount === 0 ? 'Ничего не отмечено' : `Отмечено: ${selectedCount}`}
            </span>
          </div>
        )
      )}
    </div>
  );
}
