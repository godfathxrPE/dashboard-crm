'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Pencil } from 'lucide-react';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { formatBudgetFull } from '@/lib/validators/project';
import {
  DISQUALIFY_REASON_CONFIG,
  disqualifyReasons,
  type DisqualifyReason,
} from '@/lib/validators/lead';
import { Badge } from '@/components/ui/Badge';
import type { Lead } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-LEAD-V2-LAYOUT-1 (спека `_analysis/lead-v2-spec.md` §2): шапка лида —
// ИДЕНТИЧНОСТЬ, как у сделки v2: кто это и сколько это может стоить.
//
// Образец — `DealHeader` (client-ветка) + `DealIdentityCard`, но НЕ обобщение:
// у сделки карточка собирается тремя запросами (реквизиты, КП, команда), у лида
// всё лежит в самой строке `leads`, кроме имени ответственного.
//
// Из шапки ушли (F-08): бейдж источника (accent на справочном факте), бейдж
// температуры, «ЧЗ через N мес.» (это риск — зона «Риски»), телефон и почта
// строкой (они в «Сводке» и в чипе стекла шага).
//
// «Отклонить…» стоит ЗДЕСЬ, над колонкой «Риски» (R-08) — так же и там же, где
// «Выиграна/Проиграна» у сделки: исход, а не работа. Это пересматривает §7 от
// 10.08 («терминальное только в меню»). Кнопка нейтральная — красного в покое на
// экране нет; подтверждение — сам выбор причины, `window.confirm` запрещён.
// ═══════════════════════════════════════════════════════

/** Классы «Выиграна/Проиграна» из `DealHeader` — «Отклонить…» стоит с ними в одном ряду смысла. */
const OUTCOME_BTN =
  'rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim ' +
  'transition-colors hover:border-red/40 hover:text-red hover:bg-red-l';

export function LeadHeader({
  lead,
  onEdit,
  onReject,
}: {
  lead: Lead;
  onEdit: () => void;
  onReject: (reason: DisqualifyReason) => void;
}) {
  const router = useRouter();
  const { data: members } = useTeamMembers();
  const [rejecting, setRejecting] = useState(false);

  const isOpen = lead.status === 'new' || lead.status === 'contacted' || lead.status === 'qualified';
  const isConverted = lead.status === 'converted';

  const ownerName = lead.owner_id
    ? (members?.find((m) => m.id === lead.owner_id)?.full_name ?? null)
    : null;

  // Первая буква — из названия ЛИДА: заголовок печатает его же (решение
  // `DealIdentityCard`: аватар — метка этой строки, а не соседней).
  const initial = lead.title.trim().charAt(0).toUpperCase() || '·';

  // Приём `metaParts` из `DealIdentityCard`: пустой элемент не попадает в
  // список, и «·» не остаётся сиротой ни с одного края.
  const metaParts: React.ReactNode[] = [];
  if (lead.company_name_raw?.trim()) {
    metaParts.push(
      <span key="company" className="truncate font-medium text-text-dim">{lead.company_name_raw}</span>,
    );
  }
  if (lead.contact_name_raw?.trim()) {
    metaParts.push(<span key="contact" className="shrink-0">{lead.contact_name_raw}</span>);
  }
  if (ownerName) metaParts.push(<span key="owner" className="shrink-0">{ownerName}</span>);

  return (
    <header className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_356px] lg:items-start">
      <div className="sheet flex items-center justify-between gap-6 rounded-[1.125rem] px-[1.125rem] py-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            aria-hidden="true"
            // Квадрат `--text`, буква `--bg` — решение по контрасту из
            // `DealIdentityCard` (акцент на `--text` даёт 1.6–3.6:1), не менять.
            className="grid size-11 shrink-0 place-items-center rounded-[0.875rem] bg-text-main
                       text-[0.9375rem] font-bold tracking-[-0.02em] text-bg"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2.5">
              <h1 className="truncate text-[1.375rem] font-semibold leading-[1.1] tracking-[-0.02em] text-text-main">
                {lead.title}
              </h1>
              {lead.direction && (
                <Badge color={lead.direction === 'erp' ? 'purple' : 'blue'} size="sm">
                  {lead.direction === 'iiot' ? 'IIoT' : 'ERP'}
                </Badge>
              )}
            </div>
            {metaParts.length > 0 && (
              // `overflow-hidden` — см. `DealIdentityCard`: без него на узкой
              // карточке подстрока печатается поверх суммы.
              <div className="flex min-w-0 items-center gap-2 overflow-hidden text-meta text-text-mute">
                {metaParts.map((node, i) => (
                  <span key={i} className="flex min-w-0 items-center gap-2">
                    {i > 0 && <span aria-hidden="true">·</span>}
                    {node}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Нет оценки — нет блока: прочерк на месте цены читался бы как «ноль». */}
        {lead.estimated_value != null && (
          <div className="shrink-0 whitespace-nowrap text-right">
            <div className="text-[1.625rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-text-main">
              {(() => {
                const full = formatBudgetFull(lead.estimated_value);
                // Хвост «₽» тише числа — разбор по последнему пробелу, как у сделки.
                const m = /^(.*)\s(₽)$/.exec(full);
                if (!m) return full;
                return (
                  <>
                    {m[1]}
                    <span className="ml-1 text-[1.0625rem] font-medium text-text-mute">{m[2]}</span>
                  </>
                );
              })()}
            </div>
            <div className="mt-1 text-meta text-text-mute">оценка лида</div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end lg:self-center">
        {isOpen && (
          <button
            onClick={() => setRejecting((v) => !v)}
            aria-expanded={rejecting}
            className={OUTCOME_BTN}
          >
            Отклонить…
          </button>
        )}
        {isConverted && lead.converted_deal_id && (
          <button
            onClick={() => router.push(`/deals/${lead.converted_deal_id}`)}
            // Тёмная, как «AI-бриф» сделки: подпись `--bg`, а не белым — в тёмных
            // темах `--text` светлый, и белая подпись на нём исчезает.
            className="flex h-[2.125rem] items-center gap-1.5 rounded-lg bg-text-main px-3
                       text-xs font-semibold text-bg transition-opacity hover:opacity-90"
          >
            Открыть сделку <ArrowRight size={12} />
          </button>
        )}
        <button
          onClick={onEdit}
          aria-label="Редактировать лид"
          className="rounded-lg border border-border p-1.5 text-text-mute
                     transition-colors hover:bg-surface2 hover:text-text-main"
        >
          <Pencil size={14} />
        </button>
      </div>

      {/* Строка причин — под шапкой во ВСЮ ширину: в колонке 356px семь причин
          сложились бы в столбик. Красное — только на наведении: это наведение
          на деструктив, а не покой. */}
      {isOpen && rejecting && (
        <div className="sheet flex flex-wrap items-center gap-1 rounded-[1.125rem] px-[1.125rem] py-3 lg:col-span-2">
          <span className="w-full text-xs text-text-mute">Причина отказа:</span>
          {disqualifyReasons.map((r) => (
            <button
              key={r}
              onClick={() => { onReject(r); setRejecting(false); }}
              className="rounded border border-border px-1.5 py-0.5 text-xs text-text-dim
                         transition-colors hover:border-red hover:bg-red-l hover:text-red"
            >
              {DISQUALIFY_REASON_CONFIG[r].label}
            </button>
          ))}
          <button
            onClick={() => setRejecting(false)}
            className="rounded px-1.5 py-0.5 text-xs text-text-mute hover:text-text-main"
          >
            Отмена
          </button>
        </div>
      )}
    </header>
  );
}
