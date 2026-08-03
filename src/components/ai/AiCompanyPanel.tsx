'use client';

import { useState } from 'react';
import {
  Sparkles, Loader2, ThumbsUp, ThumbsDown, Copy, Check, AlertCircle, RotateCw, Globe,
} from 'lucide-react';
import { useEntityRuns, useStartRun, useRunRating } from '@/lib/hooks/use-ai-run';
import { useCompany, useUpdateCompany } from '@/lib/hooks/use-companies';
import { presetsForEntity, presetByKey, estimateRunCostRub } from '@/lib/constants/ai-presets';
import { serializeRun } from '@/lib/utils/ai-run-serialize';
import { safeHref } from '@/lib/utils/safe-href';
import type { AiRunRow, CompanyBriefResult } from '@/types/database';
import { AiResultRenderer } from './renderers/AiResultRenderer';

interface AiCompanyPanelProps {
  companyId: string;
}

const STALE_MIN = 10;

function StatusChip({ status }: { status: AiRunRow['status'] }) {
  if (status === 'pending') return <span className="text-xs text-text-mute">В очереди</span>;
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-accent">
        <Loader2 size={12} className="animate-spin" /> Поиск и анализ…
      </span>
    );
  }
  if (status === 'error') return <span className="text-xs text-red">Ошибка</span>;
  return <span className="text-xs text-green">Готово</span>;
}

/**
 * S-COMPANY-AI-1 (104) — AI по КОМПАНИИ: бриф к звонку по открытым источникам.
 *
 * Зеркалит AiDealPanel (сущность-без-транскрипта, путь
 * `{ preset_key, entity_type: 'company', entity_id }`), а не AiWorkspaceModal:
 * та живёт на звонке/встрече и завязана на транскрипт, которого у компании нет.
 *
 * READ-ONLY с одним явным исключением: найденный сайт можно ПОДСТАВИТЬ в карточку
 * кнопкой. Молча в компанию не пишется ничего — это инвариант фичи, тот же, что у
 * S-INN-1 («реквизиты не переименовывают компанию»).
 */
export function AiCompanyPanel({ companyId }: AiCompanyPanelProps) {
  const { data: runs } = useEntityRuns('company', companyId);
  const { data: company } = useCompany(companyId);
  const start = useStartRun('company', companyId);
  const rating = useRunRating();
  const updateCompany = useUpdateCompany();

  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const presets = presetsForEntity('company');

  const handleCopy = async (run: AiRunRow) => {
    try {
      await navigator.clipboard.writeText(serializeRun(run));
      setCopiedId(run.id);
      window.setTimeout(() => setCopiedId((id) => (id === run.id ? null : id)), 1500);
    } catch { /* clipboard недоступен — тихо игнорируем */ }
  };

  const isStale = (run: AiRunRow) =>
    (run.status === 'pending' || run.status === 'running') &&
    (Date.now() - new Date(run.created_at).getTime()) / 60_000 > STALE_MIN;

  return (
    <div className="rounded-lg border border-border bg-surface-hover/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-dim">
        <Sparkles size={14} className="text-accent" />
        <span>AI по компании</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => start.mutate({ preset_key: preset.key })}
            disabled={start.isPending}
            title={preset.description}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5
                       text-xs font-medium text-text-main hover:bg-surface-hover
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            {start.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {preset.title}
            {/* Вход собирает edge из полей компании, точного размера здесь нет.
                4 000 симв. — грубая верхняя оценка карточки; веб-поиск сверх этого
                добавляет свою стоимость, поэтому цифра занижена и это честно
                отражено подписью ниже. */}
            <span className="text-text-mute">≈ {estimateRunCostRub(4_000, preset.model)} ₽</span>
          </button>
        ))}
      </div>
      <p className="mt-1 text-meta text-text-mute">
        Ищет в открытых источниках; в компанию ничего не записывается само.
        Веб-поиск удорожает прогон — оценка на кнопке его не учитывает.
      </p>

      {start.isError && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-red">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{start.error?.message ?? 'Не удалось запустить прогон'}</span>
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="mt-3 space-y-2">
          {runs.map((run) => {
            const preset = presetByKey(run.preset_key);
            return (
              <div key={run.id} className="rounded-lg border border-border bg-surface p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-text-main">{preset?.title ?? run.preset_key}</span>
                  <StatusChip status={run.status} />
                </div>

                {(run.status === 'error' || isStale(run)) && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={`text-xs ${run.status === 'error' ? 'text-text-mute' : 'text-yellow'}`}>
                      {run.status === 'error'
                        ? run.error ?? 'Ошибка выполнения'
                        : 'Прогон завис — можно повторить'}
                    </span>
                    <button
                      type="button"
                      onClick={() => start.mutate({ preset_key: run.preset_key })}
                      disabled={start.isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-dim hover:bg-surface-hover disabled:opacity-50"
                    >
                      <RotateCw size={12} /> Повторить
                    </button>
                  </div>
                )}

                {run.status === 'done' && (
                  <>
                    <div className="mt-2">
                      {/* onCreateTask не нужен: у брифа нет action items. */}
                      <AiResultRenderer run={run} onCreateTask={() => {}} />
                    </div>

                    <WebsiteSuggestion
                      run={run}
                      currentWebsite={company?.website ?? null}
                      pending={updateCompany.isPending}
                      onApply={(website) => updateCompany.mutate({ id: companyId, website })}
                    />

                    <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                      <button
                        type="button"
                        onClick={() => rating.mutate({ runId: run.id, rating: 1 })}
                        className={`rounded p-1 hover:bg-surface-hover ${run.rating === 1 ? 'text-green' : 'text-text-mute'}`}
                        aria-label="Полезно"
                      >
                        <ThumbsUp size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNoteFor(run.id); setNoteText(run.feedback_note ?? ''); }}
                        className={`rounded p-1 hover:bg-surface-hover ${run.rating === -1 ? 'text-red' : 'text-text-mute'}`}
                        aria-label="Не полезно"
                      >
                        <ThumbsDown size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(run)}
                        className="ml-auto inline-flex items-center gap-1 rounded p-1 text-text-mute hover:bg-surface-hover"
                        aria-label="Копировать"
                      >
                        {copiedId === run.id ? <Check size={13} className="text-green" /> : <Copy size={13} />}
                      </button>
                    </div>

                    {noteFor === run.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Что не так? (необязательно)"
                          className="flex-1 rounded-lg border border-input bg-surface px-2 py-1 text-xs text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            rating.mutate({ runId: run.id, rating: -1, note: noteText.trim() || null });
                            setNoteFor(null);
                          }}
                          className="rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Отправить
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Найденный сайт: предложение, а не запись.
 *
 * Поле в карточке пустое → показываем кнопку «Подставить». Заполнено → показываем
 * найденный URL БЕЗ кнопки: сверять глазами и решать — работа человека, затирать
 * заполненное поле находкой модели нельзя (тот же инвариант, что у S-INN-1:
 * `legal_name` не затирает `name`).
 *
 * Схема URL фильтруется: подставить в карточку можно только http/https. `safeHref`
 * пропускает ещё mailto:/tel: — для поля «Сайт» это не URL сайта, отсекаем явно.
 */
function WebsiteSuggestion({
  run,
  currentWebsite,
  pending,
  onApply,
}: {
  run: AiRunRow;
  currentWebsite: string | null;
  pending: boolean;
  onApply: (website: string) => void;
}) {
  if (run.preset_key !== 'company_brief' || !run.result) return null;
  const found = (run.result as CompanyBriefResult).website;
  const href = safeHref(found);
  if (!found || !href || !/^https?:/i.test(href)) return null;

  const filled = (currentWebsite ?? '').trim() !== '';

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-hover/60 px-2 py-1.5">
      <Globe size={12} className="shrink-0 text-text-mute" />
      <span className="min-w-0 flex-1 truncate text-xs text-text-dim">
        Найден сайт:{' '}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          {found}
        </a>
      </span>
      {filled ? (
        <span className="shrink-0 text-meta text-text-mute">в карточке уже есть сайт</span>
      ) : (
        <button
          type="button"
          onClick={() => onApply(href)}
          disabled={pending}
          className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-text-dim
                     hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Loader2 size={11} className="animate-spin" /> : 'Подставить'}
        </button>
      )}
    </div>
  );
}
