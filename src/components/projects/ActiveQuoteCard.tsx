'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useUpdateQuote } from '@/lib/hooks/use-quotes';
import { useStagesForPipeline, useIsProjectActive } from '@/lib/hooks/use-pipelines';
import { useTransitionStore } from '@/lib/stores/transition-store';
import { formatBudget } from '@/lib/validators/project';
import { formatCalendarDate, formatDateNumeric } from '@/lib/utils/dates';
import {
  QUOTE_STATUS_CONFIG,
  QUOTE_STATUS_TRANSITIONS,
} from '@/lib/validators/quote';
import { quoteValidity } from '@/lib/domain/quote-validity';
import { quoteVersionMap, pickActiveQuote, pickPreviousQuote } from '@/lib/domain/quote-version';
import type { Project } from '@/lib/hooks/use-projects';
import type { Quote } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-DEAL-ORG-1 (W4): карточка АКТИВНОГО КП — решение по сделке в один клик.
//
// До неё смена статуса КП жила только в `QuoteModal`: чтобы отметить принятое
// предложение, надо было открыть модалку и найти селект. Спека W4 требует решения
// прямо в блоке, а список КП (`QuotesTab`) остаётся ниже — он про историю и правку,
// эта карточка про «что сейчас на столе».
//
// ⚠️ КНОПКИ СТРОЯТСЯ ИЗ `QUOTE_STATUS_TRANSITIONS`, А НЕ ИЗ СВОЕГО СПИСКА. Таблица
// переходов заведена ещё в S-QUOTE-1 и до этого спринта не имела НИ ОДНОГО
// потребителя. Второй список разрешённых переходов рядом с ней разъехался бы с
// первым — вопрос только в том, через сколько спринтов.
//
// ⚠️ «Принято» НЕ ДВИГАЕТ СТАДИЮ. Спека пишет «→ стадия Договор», но переход стадии
// проходит гейт требований (`check_stage_requirements`, 027/078) и модалку перехода
// (S-R2-TRANSITION-1b), которая собирает During-поля и причину исхода. Прямой
// `update({stage_id})` отсюда завёл бы ВТОРОЙ путь смены стадии — невидимый ни гейту,
// ни истории `stage_transitions`. Вместо этого принятое КП показывает подсказку,
// открывающую ШТАТНУЮ модалку: одно лишнее нажатие против одного невидимого пути.
//
// ⚠️ БЮДЖЕТ СДЕЛКИ ОТСЮДА НЕ ДВИГАЕТСЯ. Деньги меняет существующий двухшаговый
// accept-flow в `QuotesTab` (гейт `canUpdateDealBudget`) — решение S-QUOTE-1, и
// автоматика здесь превратила бы «отметить статус» в «переписать сумму сделки».
// ═══════════════════════════════════════════════════════

/** Имя стадии-цели для подсказки после принятия КП. */
const CONTRACT_STAGE_NAME = 'Договор';

export interface ActiveQuoteCardProps {
  deal: Project;
  quotes: Quote[];
  /** owner/admin/manager — тот же гейт, что у остальных правок КП (RLS 053). */
  canEditQuotes: boolean;
}

export function ActiveQuoteCard({ deal, quotes, canEditQuotes }: ActiveQuoteCardProps) {
  const updateQuote = useUpdateQuote(deal.id);
  const openTransition = useTransitionStore((s) => s.open);
  const stages = useStagesForPipeline(deal.pipeline_id);
  // Терминальность сделки живёт в ВОРОНКЕ (`is_won`/`is_lost` стадии), а не в двух
  // литералах статуса: появление третьего терминального состояния литералы пропустят
  // молча, и карточка предложит перевести стадию у мёртвой сделки. Хук уже несёт и
  // ветку internal-проекта (stage_id = null → решает `status`).
  const isProjectActive = useIsProjectActive();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const active = pickActiveQuote(quotes);
  if (!active) return null;

  const versions = quoteVersionMap(quotes);
  const version = versions.get(active.id) ?? 1;
  const previous = pickPreviousQuote(quotes, active);
  const cfg = QUOTE_STATUS_CONFIG[active.status];

  // `now` считается на рендере и уезжает аргументом — внутри функции его нет
  // намеренно, иначе граница суток МСК была бы непроверяема.
  const validity = quoteValidity(active.valid_until, new Date());

  // Штамп показываем ТОЛЬКО там, где он есть в схеме: `stamp_quote_status` (053)
  // пишет `accepted_at` и `sent_at`, и больше ничего. Момент отклонения в базе не
  // хранится, а `updated_at` им не является — он сдвинется на любой следующей правке
  // КП. У `rejected`/`draft`/`expired` даты под статусом нет вовсе: пусто честнее,
  // чем чужая дата под чужой подписью.
  //
  // `sent_at`/`accepted_at` — timestamptz, поэтому formatDateNumeric; `valid_until` —
  // колонка `date`, и ей нужен formatCalendarDate (иначе сутки назад в минусовых зонах).
  const stampedAt =
    active.status === 'accepted' ? active.accepted_at
    : active.status === 'sent' ? active.sent_at
    : null;

  const allowed = QUOTE_STATUS_TRANSITIONS[active.status];
  const canAccept = canEditQuotes && allowed.includes('accepted');
  const canReject = canEditQuotes && allowed.includes('rejected');

  // Партиал-уникальность `quotes_one_accepted_per_project`: второй accepted падает
  // с 23505. Кнопку ГАСИМ заранее, а не ловим ошибку постфактум. При нынешнем правиле
  // выбора активного КП (accepted перебивает всё) сюда не попасть — гард стоит на
  // случай устаревшего кэша соседней вкладки и смены самого правила.
  const blockingAccepted = quotes.find((q) => q.status === 'accepted' && q.id !== active.id) ?? null;

  // Стадия «Договор» этой воронки — только ВПЕРЁД: назад это откат, у него свой
  // путь с подтверждением. Матчинг по имени, а не по id: `pipelines`/`pipeline_stages` —
  // глобальные словари, id у ERP и IIoT разные, а имя стадии в обеих воронках одно.
  const currentIndex = stages.find((s) => s.id === deal.stage_id)?.order_index ?? null;
  const contractStage =
    stages.find(
      (s) =>
        s.name.trim().toLowerCase() === CONTRACT_STAGE_NAME.toLowerCase() &&
        currentIndex != null &&
        s.order_index > currentIndex,
    ) ?? null;
  const showContractNudge =
    active.status === 'accepted' && contractStage != null && isProjectActive(deal);

  // Спека W4: срок печатается тревожным жёлтым, а на пороге ≤ 3 дней — красным.
  // Порог живёт в `quoteValidity` (уровень `soon`), а не вторым числом здесь.
  const validityTone = validity.level === 'soon' ? 'text-danger-text' : 'text-warning-text';

  function submitReject() {
    const trimmed = reason.trim();
    if (!trimmed || !active) return;
    updateQuote.mutate({ id: active.id, status: 'rejected', rejection_reason: trimmed }, {
      onSuccess: () => {
        setRejecting(false);
        setReason('');
      },
    });
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface2/40 p-4">
      {/* Строка статуса: точка тоном статуса + дата решения · срок действия справа. */}
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
          <span aria-hidden>{cfg.glyph}</span>
          {cfg.label}
        </span>
        {stampedAt && (
          <span className="text-xs text-text-mute tabular-nums">
            {formatDateNumeric(stampedAt)}
          </span>
        )}
        <span className="ml-auto text-xs font-medium tabular-nums">
          {validity.level === 'expired' && active.valid_until ? (
            <span className="text-danger-text">
              истекло {formatCalendarDate(active.valid_until)}
            </span>
          ) : validity.daysLeft != null ? (
            <span className={validityTone}>действует ещё {validity.daysLeft} дн.</span>
          ) : (
            <span className="text-text-mute">срок не задан</span>
          )}
        </span>
      </div>

      {/* Сумма — крупно, версия слева, «заменён» справа. */}
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="text-meta font-bold uppercase tracking-wider text-text-dim">
          v{version}
        </span>
        <span className="text-[1.375rem] font-bold tabular-nums leading-none text-text-main">
          {formatBudget(active.amount)}
        </span>
        {previous && (
          <span className="ml-auto text-meta text-text-mute tabular-nums">
            v{version - 1} · {formatBudget(previous.amount)} · заменён
          </span>
        )}
      </div>

      {/* Решение по КП. Инлайн-поле причины, а не модалка: решение принимают на
          месте, а модалка поверх развёрнутого блока прячет то, из-за чего его
          принимают (сумму и срок). */}
      {(canAccept || canReject) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {rejecting ? (
            <div className="flex w-full flex-wrap items-center gap-2">
              <input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitReject();
                  if (e.key === 'Escape') {
                    setRejecting(false);
                    setReason('');
                  }
                }}
                placeholder="Причина отклонения — обязательно"
                aria-label="Причина отклонения КП"
                className="min-w-0 flex-1 rounded-lg border border-input bg-surface px-3 py-1.5 text-xs
                           text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
              />
              <button
                onClick={submitReject}
                disabled={!reason.trim() || updateQuote.isPending}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger-text
                           transition-colors hover:bg-surface2 disabled:opacity-50"
              >
                Отклонить
              </button>
              <button
                onClick={() => {
                  setRejecting(false);
                  setReason('');
                }}
                className="rounded-lg px-2 py-1.5 text-xs text-text-mute transition-colors hover:text-text-main"
              >
                Отмена
              </button>
            </div>
          ) : (
            <>
              {canAccept && (
                <button
                  onClick={() => updateQuote.mutate({ id: active.id, status: 'accepted' })}
                  disabled={blockingAccepted != null || updateQuote.isPending}
                  title={
                    blockingAccepted
                      ? 'По сделке уже есть принятое КП — принять второе нельзя'
                      : undefined
                  }
                  className="rounded-lg bg-text-main px-3 py-1.5 text-xs font-medium text-bg
                             transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Принято
                </button>
              )}
              {canReject && (
                <button
                  onClick={() => setRejecting(true)}
                  disabled={updateQuote.isPending}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-dim
                             transition-colors hover:bg-surface2 hover:text-text-main disabled:opacity-50"
                >
                  Отклонено
                </button>
              )}
              {blockingAccepted && (
                <span className="text-meta text-text-mute">
                  Принятое КП по сделке уже есть
                </span>
              )}
            </>
          )}
        </div>
      )}

      {updateQuote.isError && (
        <p className="mt-2 text-meta text-danger-text">
          Не удалось сохранить решение по КП.
        </p>
      )}

      {/* Подсказка вместо автоперехода — см. шапку файла. */}
      {showContractNudge && contractStage && (
        <button
          onClick={() => openTransition({ project: deal, toStageId: contractStage.id })}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5
                     text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main"
        >
          Перевести на «{contractStage.name}»
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}
