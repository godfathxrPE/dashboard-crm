'use client';

import Link from 'next/link';
import { FileText, Factory, Globe, Mail, Phone } from 'lucide-react';
import { useProjects } from '@/lib/hooks/use-projects';
import { daysSince, touchLevel } from '@/lib/hooks/use-last-touch';
import { useReconnectDays } from '@/lib/hooks/use-org-settings';
import {
  splitCompanyProjects, countCompany360, formatCompany360Summary, isTerminalDeal,
} from '@/lib/utils/company-360';
import { getDealHealth } from '@/lib/utils/deal-health';
import { DealHealthDot } from '@/components/shared/DealHealthDot';
import { projectHref } from '@/lib/utils/project-href';
import { formatBudget } from '@/lib/validators/project';
import { formatPhone } from '@/lib/utils/phone';
import { safeHref } from '@/lib/utils/safe-href';
import type { CompanyRow } from './CompaniesTable';

/** Сколько открытых сделок показываем списком — дальше строка «ещё N». */
const MAX_DEALS = 3;

/**
 * Содержимое peek-панели компании (S-R2-PEEK-2).
 *
 * Ноль новых запросов: агрегаты (`contacts_count`, `pipeline_budget`, `last_touch`)
 * приходят готовыми из строки таблицы, проекты — из того же кеша `useProjects()`,
 * что уже держит `CompaniesTable`. Пересчитывать их здесь нельзя: панель и таблица
 * разошлись бы в числах.
 *
 * Сводка 360 считается тем же кодом, что и карточка компании
 * (`company-360.ts` → `CompanyDetail`), чтобы «360» не раздвоилось.
 */
export function CompanyPeekContent({ company }: { company: CompanyRow }) {
  const { data: allProjects } = useProjects();
  const reconnectDays = useReconnectDays();

  const linked = (allProjects ?? []).filter((p) => p.company_id === company.id);
  const split = splitCompanyProjects(linked);
  const counts = countCompany360(split, company.contacts_count);

  const openDeals = split.deals.filter((d) => !isTerminalDeal(d.status));
  const shownDeals = openDeals.slice(0, MAX_DEALS);
  const restDeals = openDeals.length - shownDeals.length;

  // Основной телефон: массив 041 приоритетнее legacy-колонки.
  const phone = company.phones?.find((p) => p.is_primary)?.value
    ?? company.phones?.[0]?.value
    ?? company.phone;
  const website = safeHref(company.website);
  const hasRequisites = !!(company.inn || company.industry || phone || company.email || website);

  const days = company.last_touch ? daysSince(company.last_touch) : null;
  const level = touchLevel(days, reconnectDays);

  return (
    <div className="space-y-4 text-sm">
      {/* Сводка 360 — та же строка, что на карточке компании */}
      <p className="text-sm text-text-dim tabular-nums">{formatCompany360Summary(counts)}</p>

      <p className="text-sm">
        {company.pipeline_budget > 0 ? (
          <span className="tabular-nums font-medium text-text-main">
            {formatBudget(company.pipeline_budget)}
            <span className="ml-1.5 text-xs font-normal text-text-mute">в открытых сделках</span>
          </span>
        ) : (
          <span className="text-text-mute">0 ₽ в открытых сделках</span>
        )}
      </p>

      <div className="space-y-1.5">
        {company.inn && (
          <p className="flex items-center gap-1.5 text-text-dim">
            <FileText size={13} className="text-text-mute" />
            ИНН <span className="tabular-nums text-text-main">{company.inn}</span>
          </p>
        )}
        {company.industry && (
          <p className="flex items-center gap-1.5 text-text-dim">
            <Factory size={13} className="text-text-mute" />
            {company.industry}
          </p>
        )}
        {phone && (
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-1.5 text-text-main hover:text-accent">
            <Phone size={13} className="text-text-mute" />
            {formatPhone(phone)}
          </a>
        )}
        {company.email && (
          <a href={`mailto:${company.email}`} className="flex items-center gap-1.5 text-accent hover:underline">
            <Mail size={13} className="text-text-mute" />
            {company.email}
          </a>
        )}
        {website && (
          <a
            href={website}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-accent hover:underline"
          >
            <Globe size={13} className="text-text-mute" />
            {company.website}
          </a>
        )}
        {!hasRequisites && <p className="text-xs text-text-mute">Нет контактных данных</p>}
      </div>

      <p className="text-xs">
        {company.last_touch === null || company.last_touch === undefined ? (
          <span className="text-text-mute">Касаний не было</span>
        ) : level === 'ok' ? (
          <span className="text-text-dim">
            Касание: {new Date(company.last_touch).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
          </span>
        ) : (
          <span className={level === 'cold' ? 'text-red' : 'text-yellow'}>
            {days} дн. без касания
          </span>
        )}
      </p>

      {shownDeals.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-xs font-medium text-text-dim">Открытые сделки</p>
          {shownDeals.map((p) => {
            const dh = getDealHealth(p);
            return (
              <Link
                key={p.id}
                href={projectHref(p)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-hover"
              >
                <DealHealthDot health={dh} />
                <span className="min-w-0 flex-1 truncate text-sm text-text-main">{p.name}</span>
                {p.budget != null && (
                  <span className="shrink-0 text-xs tabular-nums text-text-dim">{formatBudget(p.budget)}</span>
                )}
              </Link>
            );
          })}
          {restDeals > 0 && (
            <p className="px-2 text-xs text-text-mute">ещё {restDeals}</p>
          )}
        </div>
      )}
    </div>
  );
}
