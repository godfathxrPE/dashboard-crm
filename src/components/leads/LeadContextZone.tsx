'use client';

import { Info, StickyNote } from 'lucide-react';
import { RailCard, RailRow } from '@/components/shared/RailCard';
import { formatPhone, telHref } from '@/lib/utils/phone';
import { daysSince } from '@/lib/utils/date-helpers';
import { LEAD_SOURCE_CONFIG, LEAD_TEMPERATURE_CONFIG } from '@/lib/validators/lead';
import type { Lead } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-LEAD-V2-LAYOUT-1 (спека §7, W6 + W7): зона «Контекст» лида — справка,
// а не работа. Примитивы — `RailCard`/`RailRow`, те же, что у сделки и компании.
//
// Сюда переехали источник и температура из шапки (F-08): это факты «откуда и
// как оценили», а не идентичность. Температура подписана «оценка менеджера»
// (R-10, F-09): это мнение, и без подписи она читалась как вычисленный сигнал.
// ═══════════════════════════════════════════════════════

const HOUR_MS = 3_600_000;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** «N ч» до суток, дальше «N дн.» — лид живёт часами в `new` и днями потом. */
function spanLabel(hours: number): string {
  return hours < 24 ? `${hours} ч` : `${Math.floor(hours / 24)} дн.`;
}

/** «Создан: … · N дн. назад»; у `new` — в часах: его норма — сутки. */
function createdAgo(lead: Lead, now: Date): string {
  if (lead.status === 'new') {
    const h = Math.max(0, Math.floor((now.getTime() - new Date(lead.created_at).getTime()) / HOUR_MS));
    return h === 0 ? 'меньше часа назад' : `${h} ч назад`;
  }
  const d = daysSince(lead.created_at, now);
  return d === 0 ? 'сегодня' : `${d} дн. назад`;
}

export function LeadContextZone({ lead, ownerName }: { lead: Lead; ownerName: string | null }) {
  const now = new Date();
  const source = lead.source ? (LEAD_SOURCE_CONFIG[lead.source]?.label ?? lead.source) : null;
  const temperature = lead.temperature ? LEAD_TEMPERATURE_CONFIG[lead.temperature]?.label : null;

  const firstTouchHours = lead.first_contacted_at
    ? Math.max(
        0,
        Math.floor(
          (new Date(lead.first_contacted_at).getTime() - new Date(lead.created_at).getTime()) / HOUR_MS,
        ),
      )
    : null;

  return (
    <>
      <RailCard icon={Info} title="Сводка">
        {/* Пустое значение — строки нет (кроме «Первое касание»: его отсутствие
            само по себе факт). */}
        {lead.company_name_raw?.trim() && (
          <RailRow label="Компания" wrap>{lead.company_name_raw}</RailRow>
        )}
        {lead.contact_name_raw?.trim() && <RailRow label="Контакт">{lead.contact_name_raw}</RailRow>}
        {lead.phone && (
          <RailRow label="Телефон">
            <a href={telHref(lead.phone)} className="tabular-nums transition-colors hover:text-accent">
              {formatPhone(lead.phone)}
            </a>
          </RailRow>
        )}
        {lead.email && (
          <RailRow label="Email">
            <a href={`mailto:${lead.email}`} className="transition-colors hover:text-accent">
              {lead.email}
            </a>
          </RailRow>
        )}
        {/* «Менеджер», а не «Ответственный»: колонка лейбла RailRow — 5.5rem, и
            одно слово в 13 знаков при text-sm её переполняло и наезжало на значение
            (гейт LAYOUT-1). Смысл тот же — `owner_id`. */}
        {ownerName && <RailRow label="Менеджер">{ownerName}</RailRow>}
        {source && <RailRow label="Источник">{source}</RailRow>}
        {temperature && (
          <RailRow label="Температура">
            {temperature} <span className="text-meta text-text-mute">· оценка менеджера</span>
          </RailRow>
        )}
        <RailRow label="Создан">
          <span className="tabular-nums">{shortDate(lead.created_at)}</span>
          <span className="text-text-mute"> · {createdAgo(lead, now)}</span>
        </RailRow>
        <RailRow label="Первое касание">
          {lead.first_contacted_at && firstTouchHours !== null ? (
            <>
              <span className="tabular-nums">{shortDate(lead.first_contacted_at)}</span>
              <span className="text-text-mute"> · через {spanLabel(firstTouchHours)}</span>
            </>
          ) : (
            <span className="italic text-text-mute">ещё не было</span>
          )}
        </RailRow>
      </RailCard>

      {lead.notes?.trim() && (
        <RailCard icon={StickyNote} title="Заметки">
          {/* Правка — карандаш шапки (`LeadModal`): своей кнопки нет, второй
              путь к тому же полю был бы F-01. */}
          <p className="whitespace-pre-wrap text-body text-text-main">{lead.notes}</p>
          <p className="mt-2 text-meta text-text-mute">
            {lead.status === 'converted'
              ? 'Перенесена в сделку'
              : 'При конверсии станет закреплённой заметкой сделки'}
          </p>
        </RailCard>
      )}
    </>
  );
}
