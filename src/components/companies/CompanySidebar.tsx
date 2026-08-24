'use client';

import { FileText, ScanBarcode, Loader2, RefreshCw, AlertTriangle, StickyNote, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useCompanyLookup } from '@/lib/hooks/use-company-lookup';
import { useUpdateCompany } from '@/lib/hooks/use-companies';
import { innStatusLabel, isLookupableInn, isRiskyInnStatus } from '@/lib/utils/inn';
import { okvedToIndustry } from '@/lib/data/okved';
import { chzStatusLabel, type ChzGroup } from '@/lib/data/chz-groups';
import type { ChzProfile } from '@/lib/domain/chz-profile';
import { ChzBadge } from '@/components/shared/ChzBadge';
import { formatDateHuman } from '@/lib/utils/dates';
import { PhoneList } from '@/components/shared/PhoneList';
import { safeHref } from '@/lib/utils/safe-href';
import { RailCard, RailRow } from '@/components/shared/RailCard';
import type { Company } from '@/lib/hooks/use-companies';

// ═══════════════════════════════════════════════════════
// S-R2-CO360-1 — правая колонка карточки компании: справочное.
//
// Сюда уехала info-сетка (телефон/сайт/адрес/отрасль) из основного потока:
// это данные, к которым обращаются по необходимости, а не то, ради чего
// открывают карточку. Основной поток теперь — деньги, работа, люди, лента.
//
// Каждая карточка исчезает целиком, когда показывать нечего: у 36 компаний
// из 260 нет ИНН, и пустая рамка «Реквизиты» на их страницах — шум.
// ═══════════════════════════════════════════════════════

interface CompanySidebarProps {
  company: Company;
  chzGroups: ChzGroup[];
  /** S-LEAD-CARRY-1: `declared` — подтверждено человеком, `derived` — гипотеза по ОКВЭД. */
  chzSource: ChzProfile['source'];
  /** Имена из `companies.chz_groups`, которых нет в справочнике-снапшоте. */
  chzUnknown: string[];
}

export function CompanySidebar({ company, chzGroups, chzSource, chzUnknown }: CompanySidebarProps) {
  const lookup = useCompanyLookup();
  const updateCompany = useUpdateCompany();

  const hasPhones = (company.phones?.length ?? 0) > 0 || !!company.phone;
  const infoFields = [
    { label: 'Email', value: company.email, href: company.email ? `mailto:${company.email}` : null },
    { label: 'Сайт', value: company.website, href: safeHref(company.website) },
    { label: 'Адрес', value: company.address, href: null },
    { label: 'Отрасль', value: company.industry, href: null },
  ].filter((f) => f.value);
  const hasInfo = hasPhones || infoFields.length > 0;

  // ═══ S-INN-1: реквизиты ЕГРЮЛ ═══
  // S-OKVED-1: ОКВЭД показываем кодом и, через тире, отраслью из справочника.
  // Отрасль здесь ВЫЧИСЛЯЕТСЯ, а не читается из `industry`: в поле отрасли может
  // лежать то, что менеджер написал руками, и подменять им реестр нельзя.
  const okvedIndustry = okvedToIndustry(company.okved);
  const legalFields = [
    { label: 'ИНН', value: company.inn },
    { label: 'КПП', value: company.kpp ?? null },
    { label: 'ОГРН', value: company.ogrn ?? null },
    { label: 'ОКВЭД', value: company.okved ? (okvedIndustry ? `${company.okved} — ${okvedIndustry}` : company.okved) : null },
    { label: 'Юр. название', value: company.legal_name ?? null },
    { label: 'Юр. адрес', value: company.legal_address ?? null },
  ].filter((f) => f.value);
  const statusLabel = innStatusLabel(company.inn_status);
  const statusRisky = isRiskyInnStatus(company.inn_status);
  const hasLegal = legalFields.length > 0 || !!statusLabel;
  const refreshing = lookup.isPending || updateCompany.isPending;

  async function handleRefreshLegal() {
    const inn = company.inn?.trim() ?? '';
    if (!isLookupableInn(inn)) return;
    try {
      const r = await lookup.mutateAsync(inn);
      if (!r.found) {
        toast.error('Компания с таким ИНН не найдена в ЕГРЮЛ');
        return;
      }
      // Пишем ТОЛЬКО юрполя. `name` и `address` не трогаем даже здесь: карточка
      // обновляет реквизиты, а не переименовывает компанию (инвариант фичи).
      await updateCompany.mutateAsync({
        id: company.id,
        legal_name: r.legal_name,
        kpp: r.kpp,
        ogrn: r.ogrn,
        legal_address: r.legal_address,
        inn_status: r.status,
        // S-OKVED-1: ОКВЭД в том же наборе — он такой же факт реестра. Отрасль
        // отсюда НЕ пишем: `industry` — рабочая классификация, и «Обновить
        // реквизиты» не повод переклассифицировать компанию за менеджера.
        okved: r.okved,
        inn_verified_at: new Date().toISOString(),
      });
      toast.success('Реквизиты обновлены из ЕГРЮЛ');
    } catch {
      // Текст показывает глобальный mutationCache.onError (toast).
    }
  }

  return (
    // S-DEAL-RAIL-1: снова <aside>. Прежний запрет («тема-правила таргетят голый
    // тег») снят S-FIX-CO360-1: все `.t-* aside` сужены до [data-app-nav] /
    // [data-drawer]; единственное непривязанное правило —
    // `.t-aura aside:not([data-app-nav]) .bracket` — требует дочернего .bracket,
    // которого в рельсе нет. Тег общий с DealContextRail: рельса одна на два экрана.
    <aside aria-label="Сведения о компании" className="flex flex-col gap-4">
      {/* ─── Сведения ─── */}
      {hasInfo && (
        <RailCard icon={Info} title="Сведения">
          {hasPhones && (
            <RailRow label="Телефон" wrap>
              <PhoneList phones={company.phones} fallback={company.phone} />
            </RailRow>
          )}
          {infoFields.map((f) => (
            <RailRow key={f.label} label={f.label} wrap>
              {f.href ? (
                <a href={f.href} target="_blank" rel="noopener noreferrer"
                  className="break-words text-accent transition-colors hover:underline">
                  {f.value}
                </a>
              ) : (
                <span className="break-words">{f.value}</span>
              )}
            </RailRow>
          ))}
        </RailCard>
      )}

      {/* ─── Реквизиты (S-INN-1) ───
          Кнопка «Обновить из ЕГРЮЛ» живёт здесь же и рендерится только при
          валидном ИНН: без него запрос слать нечем. */}
      {hasLegal && (
        <RailCard
          icon={FileText}
          title="Реквизиты"
          badge={statusLabel && (
            statusRisky ? (
              <span data-tag className="flex items-center gap-1 rounded bg-yellow-l px-1.5 py-0.5 text-xs"
                style={{ color: 'var(--yellow-text, var(--yellow))' }}>
                <AlertTriangle size={10} /> {statusLabel}
              </span>
            ) : (
              <span data-tag className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute">{statusLabel}</span>
            )
          )}
          action={isLookupableInn(company.inn) && (
            <button
              onClick={handleRefreshLegal}
              disabled={refreshing}
              title="Обновить из ЕГРЮЛ"
              className="flex items-center gap-1 text-xs text-text-mute transition-colors
                         hover:text-text-main disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              ЕГРЮЛ
            </button>
          )}
        >
          {legalFields.map((f) => (
            <RailRow key={f.label} label={f.label} wrap>
              <span className="break-words tabular-nums">{f.value}</span>
            </RailRow>
          ))}
          {company.inn_verified_at && (
            <p className="mt-2 text-xs text-text-mute">
              Сверено с ЕГРЮЛ · {formatDateHuman(company.inn_verified_at)}
            </p>
          )}
        </RailCard>
      )}

      {/* ─── Маркировка «Честный Знак» (S-COMPANY-AI-1, F2 · S-LEAD-CARRY-1) ───
          ⚠️ Условие `> 1`, а не `> 0`, и это не опечатка — но обоснование у него
          с S-LEAD-CARRY-1 ДРУГОЕ, и старое было бы прямым враньём.

          Раньше единица объяснялась свойством `matchChzGroups`: она матчит один
          основной ОКВЭД по непересекающимся префиксам и физически не возвращает
          больше одной группы. С появлением `companies.chz_groups` (123) это
          перестало быть правдой — подтверждённый профиль набирает человек в пикере
          и выбирает сколько угодно групп.

          Правило теперь про РАЗДЕЛЕНИЕ ТРУДА с highlight-виджетом, а не про
          справочник: виджет показывает ровно одну группу (`chzGroups[0]`), и при
          одной группе эта карточка дословно его повторяла бы — та же строка, тот же
          бейдж, тот же note. Карточка появляется, когда есть что добавить сверх
          виджета: групп больше одной ЛИБО среди подтверждённых имён есть сироты —
          их виджет не показывает вовсе, и без карточки они исчезли бы с экрана.

          Дисклеймер источника живёт у виджета: он про то, как посчитан сигнал. */}
      {(chzGroups.length > 1 || chzUnknown.length > 0) && (
        <RailCard
          icon={ScanBarcode}
          title="Маркировка «Честный Знак»"
          badge={chzSource === 'declared' && (
            <span data-tag className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute">
              подтверждено
            </span>
          )}
        >
          <div className="space-y-2">
            {chzGroups.map((g) => (
              <div key={g.group}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-text-main">{g.group}</span>
                  <ChzBadge status={g.status} label={chzStatusLabel(g)} />
                </div>
                {g.note && <p className="mt-0.5 text-xs text-text-mute">{g.note}</p>}
              </div>
            ))}
          </div>

          {/* Сироты: имена из БД, которых нет в справочнике-снапшоте (группу
              переименовали после 2026-08). Нейтральный тег, а НЕ `ChzBadge`:
              статуса и даты обязательности у них нет, и зелёный/жёлтый бейдж
              соврал бы про обязательность. Молча проглотить их тоже нельзя —
              это данные, которые ввёл человек. */}
          {chzUnknown.length > 0 && (
            <div className="mt-3 border-t border-border pt-2">
              <p className="mb-1.5 text-xs text-text-mute">Нет в справочнике 2026-08</p>
              <div className="flex flex-wrap gap-1">
                {chzUnknown.map((name) => (
                  <span key={name} data-tag
                    className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </RailCard>
      )}

      {/* ─── Заметки ─── */}
      {company.notes && (
        <RailCard icon={StickyNote} title="Заметки">
          <p className="whitespace-pre-wrap text-sm text-text-main">{company.notes}</p>
        </RailCard>
      )}
    </aside>
  );
}

