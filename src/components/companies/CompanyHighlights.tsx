'use client';

import { Banknote, Rocket, Clock, ScanBarcode } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatBudget } from '@/lib/validators/project';
import { formatDateShort } from '@/lib/utils/dates';
import { getDealHealth, getNextActionOverdueDays, type DealHealth } from '@/lib/utils/deal-health';
import { getDeliveryHealth, isDeliveryTerminal } from '@/lib/utils/delivery-health';
import { DealHealthDot } from '@/components/shared/DealHealthDot';
import { DeliveryHealthDot } from '@/components/shared/DeliveryHealthDot';
import { ChzBadge } from '@/components/shared/ChzBadge';
import { chzStatusLabel, type ChzGroup } from '@/lib/data/chz-groups';
import { isTerminalDeal, ruPlural } from '@/lib/utils/company-360';
import { useCompanyTeamTouch } from '@/lib/hooks/use-company-team-touch';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { daysSince } from '@/lib/hooks/use-last-touch';
import { getAvatarColor, getInitialsFromFullName } from '@/lib/utils/avatar';
import type { Project } from '@/lib/hooks/use-projects';
import type { PipelineStage } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-R2-CO360-1 (F6) — highlight-полоса карточки компании (паттерн Attio).
//
// Четыре ответа на вопросы, ради которых карточку и открывают: сколько денег
// в работе, что делаем прямо сейчас, когда последний раз говорили, есть ли
// регуляторный повод для разговора. Строка-сводка `formatCompany360Summary`
// убрана С КАРТОЧКИ этим же спринтом: два источника одних и тех же чисел на
// одном экране рассинхронятся. В peek-панели (`CompanyPeekContent`) она живёт
// дальше — там полосы нет, и одна строка фактов и есть весь ответ.
//
// Пустые виджеты НЕ рендерятся, а сетка сжимается: рамка со словом «нет» —
// шум, который занимает четверть полосы на каждой второй карточке.
// ═══════════════════════════════════════════════════════

interface CompanyHighlightsProps {
  companyId: string;
  deals: Project[];
  deliveries: Project[];
  stages: PipelineStage[] | undefined;
  chzGroups: ChzGroup[];
}

/** Классы сетки — статическими строками: Tailwind JIT не видит конкатенацию. */
const GRID_BY_COUNT: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

/** Худший health среди сделок: просрочен шаг > нет шага > ок. */
const HEALTH_RANK: Record<DealHealth, number> = { 'overdue-action': 2, 'no-action': 1, ok: 0 };

export function CompanyHighlights({
  companyId, deals, deliveries, stages, chzGroups,
}: CompanyHighlightsProps) {
  const { data: teamTouch } = useCompanyTeamTouch(companyId);
  const { data: members } = useTeamMembers();

  // ─── 1. Открытые сделки ───
  const openDeals = deals.filter((d) => !isTerminalDeal(d.status));
  const openSum = openDeals.reduce((acc, d) => acc + (d.budget ?? 0), 0);
  const dealsMeta = describeOpenDeals(openDeals);

  // ─── 2. Внедрение / внутренний проект ───
  // Активное = не терминальное по стадии+статусу (та же функция, что в
  // DealDeliveryHub и PortfolioView — пороги и правила не форкаем). Из нескольких
  // берём ближайшее по дедлайну: полоса показывает то, что горит.
  //
  // ⚠️ Настоящее внедрение важнее внутреннего: полоса отвечает на вопрос «что мы
  // сейчас делаем ДЛЯ клиента». `splitCompanyProjects` по контракту кладёт
  // `internal` (пресейл, `stage_id = null`) в тот же массив `deliveries`, и без
  // этой развилки виджет с заголовком «ВНЕДРЕНИЕ» показывал внутренний проект —
  // секция ниже при этом честно называлась «Внедрения и внутренние». Внутренний
  // берётся только когда внедрений нет вовсе, и тогда заголовок меняется.
  const activeDeliveries = deliveries.filter((p) => {
    const stage = p.stage_id ? stages?.find((s) => s.id === p.stage_id) : undefined;
    return !isDeliveryTerminal(stage, p.status);
  });
  const realDeliveries = activeDeliveries.filter((p) => p.type === 'delivery');
  const pool = realDeliveries.length > 0 ? realDeliveries : activeDeliveries;
  const delivery = [...pool].sort(byDeadlineThenName)[0];
  const deliveryIsInternal = delivery?.type === 'internal';

  // ─── 4. Маркировка ЧЗ ───
  const chz = chzGroups[0];

  const widgets = 2 + (delivery ? 1 : 0) + (chz ? 1 : 0);

  return (
    <div className={cn('mb-5 grid grid-cols-2 gap-3', GRID_BY_COUNT[widgets])}>
      {/* ─── Открытые сделки ─── */}
      <Widget icon={Banknote} label="Открытые сделки">
        {openDeals.length === 0 ? (
          <>
            <Value>—</Value>
            <Meta>Нет открытых</Meta>
          </>
        ) : (
          <>
            <Value className="tabular-nums">{formatBudget(openSum)}</Value>
            <Meta>
              {dealsMeta.health !== 'ok' && <DealHealthDot health={dealsMeta.health} />}
              {dealsMeta.text}
            </Meta>
          </>
        )}
      </Widget>

      {/* ─── Внедрение / внутренний проект ─── */}
      {delivery && (
        <DeliveryWidget project={delivery} stages={stages} isInternal={deliveryIsInternal} />
      )}

      {/* ─── Последний контакт ─── */}
      <Widget icon={Clock} label="Последний контакт">
        {!teamTouch?.lastTouch ? (
          <>
            <Value>—</Value>
            <Meta>Касаний не было</Meta>
          </>
        ) : (
          <>
            <Value className="tabular-nums">
              {daysSince(teamTouch.lastTouch.date)}
              <Unit>{ruPlural(daysSince(teamTouch.lastTouch.date), ['день назад', 'дня назад', 'дней назад'])}</Unit>
            </Value>
            <Meta>
              <span className="truncate">
                {teamTouch.lastTouch.kind === 'call' ? 'Звонок' : 'Встреча'}
                {actorName(teamTouch.lastTouch.actorId, members) && ` · ${actorName(teamTouch.lastTouch.actorId, members)}`}
              </span>
              {teamTouch.whoKnows.length > 0 && (
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  <span className="flex -space-x-1.5">
                    {teamTouch.whoKnows.map((w) => {
                      const name = actorName(w.actorId, members) ?? '?';
                      return (
                        <span
                          key={w.actorId}
                          title={`${name} · ${w.count} ${ruPlural(w.count, ['касание', 'касания', 'касаний'])} за 90 дней`}
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-surface text-[9px] font-semibold text-white"
                          style={{ backgroundColor: getAvatarColor(name) }}
                        >
                          {getInitialsFromFullName(name)}
                        </span>
                      );
                    })}
                  </span>
                  знают {teamTouch.whoKnows.length}
                </span>
              )}
            </Meta>
          </>
        )}
      </Widget>

      {/* ─── Маркировка ЧЗ ───
          Единственный подсвеченный виджет полосы, и только при `starting`:
          обязанность, которая ЕЩЁ НЕ наступила, — горячий пресейл-сигнал, а
          действующая (`mandatory`) уже никого не торопит. Детали групп — в
          сайдбаре: полоса показывает сигнал, не справочник. */}
      {chz && (
        <Widget icon={ScanBarcode} label="Маркировка ЧЗ" hot={chz.status === 'starting'}>
          <div className="mt-0.5 truncate text-base font-semibold leading-tight text-text-main" title={chz.group}>
            {chz.group}
          </div>
          <Meta>
            <ChzBadge status={chz.status} label={chzStatusLabel(chz)} />
            {chz.note && <span className="truncate" title={chz.note}>{chz.note}</span>}
          </Meta>
          {/* Честность источника живёт при самом сигнале, а не в отдельной карточке:
              «по основному ОКВЭД» — это ограничение ВЫВОДА (дополнительные коды ЕГРЮЛ
              не отдаёт), и читать его нужно там, где по выводу принимают решение. */}
          <p className="mt-1 truncate text-meta text-text-mute"
            title="Справочник от 2026-08 · сопоставление по основному ОКВЭД; дополнительные коды ЕГРЮЛ не учитываются">
            Справочник 2026-08 · по основному ОКВЭД
          </p>
        </Widget>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Примитивы полосы
// ═══════════════════════════════════════════════════════

function Widget({
  icon: Icon, label, hot = false, children,
}: {
  icon: typeof Banknote;
  label: string;
  hot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-card
      className={cn(
        'flex min-w-0 flex-col rounded-lg border border-border/60 bg-surface px-3 py-2.5',
        hot && 'co360-hot',
      )}
    >
      <div className="flex items-center gap-1.5 text-meta uppercase tracking-wide text-text-mute">
        <Icon size={11} className="shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      {children}
    </div>
  );
}

function Value({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mt-1 truncate text-xl font-semibold leading-tight text-text-main', className)}>{children}</div>;
}

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 text-xs font-normal text-text-dim">{children}</span>;
}

function Meta({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-text-dim">{children}</div>;
}

/**
 * Виджет «что мы сейчас делаем». Заголовок следует за тем, что в нём лежит:
 * `Внедрение` для `type='delivery'`, `Внутренний проект` для `internal` — иначе
 * полоса выдавала бы пресейл за внедрение.
 *
 * Опознавательная метка проекта — стадия у delivery и ИМЯ у internal (у него
 * `stage_id = null`, и слово «Внутренний» уже стоит в заголовке — дважды его
 * повторять незачем). Метка встаёт либо в крупную строку, либо в мету, но
 * никогда в обе: прогресс `X/Y` крупно показывается, когда счётчик задач заведён
 * («0/0» выглядит как провал, хотя означает «доска ещё не наполнена»).
 */
function DeliveryWidget({
  project, stages, isInternal,
}: {
  project: Project;
  stages: PipelineStage[] | undefined;
  isInternal: boolean;
}) {
  const label = isInternal ? project.name : stageNameOf(project, stages);
  const hasProgress = project.progress_total > 0;
  const deadlineText = project.deadline ? `до ${formatDateShort(project.deadline)}` : null;
  const metaText = [hasProgress ? label : null, deadlineText].filter(Boolean).join(' · ');

  return (
    <Widget icon={Rocket} label={isInternal ? 'Внутренний проект' : 'Внедрение'}>
      {hasProgress ? (
        <Value className="tabular-nums">
          {project.progress_done}
          <Unit>/{project.progress_total}</Unit>
        </Value>
      ) : (
        <div className="mt-1 truncate text-base font-semibold leading-tight text-text-main" title={label}>
          {label}
        </div>
      )}
      <Meta>
        <DeliveryHealthDot
          health={getDeliveryHealth({
            progress_done: project.progress_done,
            progress_total: project.progress_total,
            stage_entered_at: project.stage_entered_at,
            deadline: project.deadline,
            updated_at: project.updated_at,
            isTerminal: false, // отфильтровано вызывающим
          })}
        />
        {metaText && <span className="truncate" title={metaText}>{metaText}</span>}
      </Meta>
    </Widget>
  );
}

// ═══════════════════════════════════════════════════════
// Хелперы
// ═══════════════════════════════════════════════════════

/**
 * Название стадии по `stage_id` (истина `pipeline_stages`, legacy `stage` не читаем).
 *
 * Ветку `type === 'internal' → 'Внутренний'` убрал S-FIX-CO360-1: внутренний проект
 * теперь опознаётся ИМЕНЕМ, а слово «Внутренний» стоит в заголовке виджета —
 * функцию зовут только для delivery, и мёртвая ветка вводила бы в заблуждение.
 */
function stageNameOf(p: Project, stages: PipelineStage[] | undefined): string {
  return (p.stage_id ? stages?.find((s) => s.id === p.stage_id)?.name : null) ?? '—';
}

/** Ближайший дедлайн вверх; без дедлайна — в конец, тай-брейк по имени (стабильность). */
function byDeadlineThenName(a: Project, b: Project): number {
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline) || a.name.localeCompare(b.name);
  if (a.deadline) return -1;
  if (b.deadline) return 1;
  return a.name.localeCompare(b.name);
}

function actorName(actorId: string | null | undefined, members: { id: string; full_name: string }[] | undefined): string | null {
  if (!actorId) return null;
  return members?.find((m) => m.id === actorId)?.full_name ?? null;
}

/**
 * Мета-строка виджета сделок: «2 сделки · 1 без шага 6 дн».
 *
 * Вторая половина называет ХУДШЕЕ, а не среднее: полоса существует, чтобы
 * заметить проблему, не увидев списка. Подписи собираются здесь, а не в
 * `deal-health` — там их нет, а заводить формат-слой ради одной строки
 * означало бы тащить туда склонения.
 */
function describeOpenDeals(openDeals: Project[]): { health: DealHealth; text: string } {
  const countText = `${openDeals.length} ${ruPlural(openDeals.length, ['сделка', 'сделки', 'сделок'])}`;

  let worst: DealHealth = 'ok';
  let worstDeal: Project | null = null;
  let worstCount = 0;
  for (const d of openDeals) {
    const h = getDealHealth(d);
    if (HEALTH_RANK[h] > HEALTH_RANK[worst]) { worst = h; worstDeal = d; worstCount = 1; }
    else if (h === worst && h !== 'ok') { worstCount += 1; }
  }

  if (worst === 'ok' || !worstDeal) return { health: 'ok', text: countText };

  const overdueDays = worst === 'overdue-action' && worstDeal.next_action_date
    ? getNextActionOverdueDays(worstDeal.next_action_date)
    : null;
  const what = worst === 'overdue-action'
    ? `${worstCount} просрочен${worstCount === 1 ? 'а' : 'о'}${overdueDays ? ` на ${overdueDays} ${ruPlural(overdueDays, ['день', 'дня', 'дней'])}` : ''}`
    : `${worstCount} без шага`;

  return { health: worst, text: `${countText} · ${what}` };
}
