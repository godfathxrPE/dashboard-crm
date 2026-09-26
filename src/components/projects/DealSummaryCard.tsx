'use client';

import Link from 'next/link';
import { Info } from 'lucide-react';
import { useMemo } from 'react';
import { useUpdateProject, type Project } from '@/lib/hooks/use-projects';
import { useCompletenessRules } from '@/lib/hooks/use-org-settings';
import { useIsProjectActive } from '@/lib/hooks/use-pipelines';
import { useCompanyLegal } from '@/lib/hooks/use-company-legal';
import { useDealStakeholders } from '@/lib/hooks/use-deal-stakeholders';
import { usePipelineExpectedRoles } from '@/lib/hooks/use-pipeline-expected-roles';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { CopyButton } from '@/components/ui/CopyButton';
import { RailCard, RailRow } from '@/components/shared/RailCard';
import { formatBudget } from '@/lib/validators/project';
import { formatContactName, formatContactNameShort } from '@/lib/utils/contact-name';
import { formatDateNumeric, formatCalendarDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';
import { resolveRoleSlots } from '@/lib/domain/role-slots';
import { roleCoverageSignal } from '@/lib/domain/deal-signals';
import { daysInWork, deadlineOverdueDays, pickDecisionMaker } from '@/lib/domain/deal-summary';
import { scrollToSignalAnchor } from './DealSignals';

// ═══════════════════════════════════════════════════════
// S-DEAL-RAIL-1 (R-05): «Сводка» — property-list вместо четырёх боксов инфо-грида.
//
// Грид из четырёх карточек занимал полосу во всю ширину полотна ради четырёх
// значений, которые читают по необходимости. Здесь тот же состав живёт строками
// в рельсе: лейбл слева, значение справа, порядок фиксирован.
//
// Сюда же переехали из шапки страницы бейдж полноты (R-06: счётчик обязан стоять
// над полями, которые считает) и «Создан …» (R-11/F-09).
//
// S-DEAL-SUMMARY-1 (W9): строки ИНН и ЛПР, просрочка дедлайна чипом, «N дн. в
// работе». Данные — ТЕМИ ЖЕ хуками и ключами, что у соседей по карточке:
// реквизиты — `useCompanyLegal` (шапка сделки), участники и ожидания ролей —
// `useDealStakeholders`/`usePipelineExpectedRoles` (виджет стейкхолдеров и
// сигналы). Новых запросов сводка не делает.
// ═══════════════════════════════════════════════════════

/**
 * Приглашение вместо прочерка (F-05): пустое поле выглядит пустым и зовёт
 * заполнить. Курсив — то же начертание, что у плейсхолдеров InlineEdit.
 */
function Placeholder({ onClick }: { onClick?: () => void }) {
  if (!onClick) return <span className="italic text-text-mute">+ Указать</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="italic text-text-mute transition-colors hover:text-accent"
    >
      + Указать
    </button>
  );
}

/**
 * Значение ещё не приехало (P-6): приглушённое многоточие, а не «+ Указать» —
 * приглашение заполнить до ответа запроса было бы неправдой о данных.
 */
function Pending() {
  return <span className="text-text-mute" aria-label="Загрузка">…</span>;
}

/**
 * Жёлтая точка у дорогой пустоты. Текст последствия берётся из правил полноты
 * (`rule.cost`), а не сочиняется здесь: иначе одно и то же поле объясняло бы
 * свою пустоту двумя разными фразами — в бейдже полноты и в строке. У ЛПР
 * источник тот же по смыслу — формулировка сигнала здоровья `single_threaded`.
 */
function CostDot({ cost }: { cost: string }) {
  return (
    <span
      title={cost}
      aria-label={cost}
      className="ml-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-yellow align-middle"
    />
  );
}

export interface DealSummaryCardProps {
  project: Project;
  /** Родительская сделка внедрения — у delivery занимает строку вместо бюджета. */
  parentDeal?: Project | null;
  isDelivery: boolean;
  /** Бейдж полноты — переехал из шапки страницы (R-06). */
  badge?: React.ReactNode;
  /** Открыть модалку редактирования: компания и контакт правятся только там. */
  onEdit?: () => void;
}

export function DealSummaryCard({
  project, parentDeal, isDelivery, badge, onEdit,
}: DealSummaryCardProps) {
  const updateProject = useUpdateProject();
  const rules = useCompletenessRules();
  const costOf = (key: string) => rules.find((r) => r.key === key && r.weight > 0)?.cost ?? null;
  const contactCost = costOf('contact_id');
  const budgetCost = costOf('budget');

  const hasCompany = !!project.company_id;
  const { data: legal, isPending: legalPending } = useCompanyLegal(project.company_id);
  const inn = legal?.inn?.trim() || null;

  // Закрытая сделка (won/lost) — без тревог: тот же принцип, что у `getDealSignals`.
  const isActive = useIsProjectActive()(project);

  // Хуки зовутся безусловно (правила хуков), запрос — нет: у внедрения строки ЛПР
  // нет, пустой id гасит его через `enabled`. Сетевой экономии это не даёт —
  // виджет стейкхолдеров на карточке внедрения грузит тот же ключ сам, — но
  // сводка не зависит от данных, которые не рисует.
  const { data: stakeholders, isPending: stakeholdersPending } = useDealStakeholders(
    isDelivery ? '' : project.id,
  );
  const { data: expectedRoles } = usePipelineExpectedRoles(project.pipeline_id);
  const decisionMaker = useMemo(
    () => (stakeholders ? pickDecisionMaker(stakeholders) : null),
    [stakeholders],
  );
  // Точка «влияет на здоровье» — ровно тогда, когда ЛПР обязателен в воронке и
  // слот пуст: тот же `resolveRoleSlots`, что кормит сигнал `single_threaded`.
  // Свой критерий здесь дал бы точку там, где панель здоровья молчит.
  const dmRequiredMissing = useMemo(() => {
    if (!expectedRoles?.length || !stakeholders) return false;
    return resolveRoleSlots(expectedRoles, stakeholders, project.contact_id)
      .missingRequired.includes('decision_maker');
  }, [expectedRoles, stakeholders, project.contact_id]);
  const dmCost = isActive && dmRequiredMissing
    ? (() => {
        const s = roleCoverageSignal(['decision_maker']);
        return `${s.label}. ${s.detail}`;
      })()
    : null;

  // «Сейчас» берётся на рендер: сводка перерисовывается на любом изменении
  // сделки, а суточная точность счётчиков не требует таймера.
  const now = new Date();
  const overdue = isActive ? deadlineOverdueDays(project.deadline, now) : 0;
  const inWork = daysInWork(project.created_at, now);

  return (
    // id — якорь CTA сигнала `deadline` (SIGNAL_ANCHORS). Обёртка, а не сам
    // RailCard: примитив общий с карточкой компании и id ему не принадлежит.
    <div id="deal-summary">
      <RailCard icon={Info} title="Сводка" badge={badge}>
        <RailRow label="Компания" wrap>
          {project.company ? (
            <Link
              href={`/companies/${project.company_id}`}
              className="text-accent transition-colors hover:underline"
            >
              {project.company.name}
            </Link>
          ) : (
            <Placeholder onClick={onEdit} />
          )}
        </RailRow>

        {hasCompany && (
          <RailRow label="ИНН">
            {legalPending ? (
              <Pending />
            ) : inn ? (
              <span className="inline-flex items-center gap-1.5">
                {/* Без группировки: копируется и ищется ровно то, что видно. */}
                <span className="font-medium tabular-nums">{inn}</span>
                <CopyButton
                  value={inn}
                  title="Скопировать ИНН"
                  // Кегль вне `cn`: tailwind-merge выкинул бы `text-meta` рядом с `text-text-mute`.
                  className="text-meta h-5 rounded-full bg-surface2 px-1.5 text-text-mute transition-colors hover:text-text-main"
                />
              </span>
            ) : (
              // ИНН правится в карточке компании, не в модалке сделки.
              <Link
                href={`/companies/${project.company_id}`}
                className="italic text-text-mute transition-colors hover:text-accent"
              >
                + Указать
              </Link>
            )}
          </RailRow>
        )}

        <RailRow label="Контакт">
          {project.contact ? (
            <Link
              href={`/contacts/${project.contact_id}`}
              title={formatContactName(project.contact.first_name, project.contact.last_name)}
              className="text-accent transition-colors hover:underline"
            >
              {formatContactNameShort(project.contact.first_name, project.contact.last_name)}
            </Link>
          ) : (
            <>
              <Placeholder onClick={onEdit} />
              {contactCost && <CostDot cost={contactCost} />}
            </>
          )}
        </RailRow>

        {isDelivery ? (
          <RailRow label="Сделка" wrap>
            {project.parent_deal_id ? (
              <Link
                href={`/deals/${project.parent_deal_id}`}
                className="text-accent transition-colors hover:underline"
              >
                {parentDeal?.name ?? '…'}
              </Link>
            ) : (
              <span className="italic text-text-mute">—</span>
            )}
          </RailRow>
        ) : (
          <RailRow label="Бюджет">
            <span className="inline-flex items-center tabular-nums">
              <InlineEdit
                value={project.budget ? String(project.budget) : ''}
                type="number"
                placeholder="+ Указать"
                formatDisplay={(v) => formatBudget(Number(v))}
                onSave={async (val) => {
                  updateProject.mutate({ id: project.id, budget: val ? Number(val) : null });
                }}
                // F-05: приглашение того же начертания, что реальный бюджет,
                // пролистывалось как заполненное поле — отсюда курсив.
                className={cn(!project.budget && 'italic')}
              />
              {!project.budget && budgetCost && <CostDot cost={budgetCost} />}
            </span>
          </RailRow>
        )}

        <RailRow label="Дедлайн">
          <span className="inline-flex items-center gap-1.5">
            <InlineEdit
              value={project.deadline ?? ''}
              type="date"
              placeholder="+ Установить"
              // F-02: соседние строки рельса печатали дату двумя форматами.
              // Формат один на обе — числовой, из dates.ts.
              //
              // `formatCalendarDate`, а не `formatDateNumeric`: сюда приходит
              // значение `<input type="date">` — голая строка 'YYYY-MM-DD' без
              // момента времени (колонка `deadline` тоже `date`). `new Date()` от
              // такой строки — UTC-полночь, и при отрицательном смещении зоны
              // дедлайн печатался на СУТКИ НАЗАД. `catch` от этого не спасал:
              // исключения нет, дата просто неверная.
              formatDisplay={(v) => {
                try {
                  return formatCalendarDate(v);
                } catch { return v; }
              }}
              onSave={async (val) => {
                updateProject.mutate({ id: project.id, deadline: val || null });
              }}
              className={cn(
                'tabular-nums',
                !project.deadline && 'italic',
                overdue > 0 && 'font-semibold text-danger-text',
              )}
            />
            {/* Чип рядом, а не вместо: дату по-прежнему правят кликом. */}
            {overdue > 0 && (
              <span
                title={`Дедлайн просрочен на ${overdue} дн.`}
                className="shrink-0 rounded-full bg-danger-l px-2 py-0.5 text-xs font-semibold tabular-nums text-danger-text"
              >
                −{overdue} дн.
              </span>
            )}
          </span>
        </RailRow>

        {!isDelivery && (
          <RailRow label="ЛПР">
            {stakeholdersPending ? (
              <Pending />
            ) : decisionMaker ? (
              <>
                {decisionMaker.first.contact ? (
                  <Link
                    href={`/contacts/${decisionMaker.first.contact_id}`}
                    title={formatContactName(
                      decisionMaker.first.contact.first_name,
                      decisionMaker.first.contact.last_name,
                    )}
                    className="text-accent transition-colors hover:underline"
                  >
                    {formatContactNameShort(
                      decisionMaker.first.contact.first_name,
                      decisionMaker.first.contact.last_name,
                    )}
                  </Link>
                ) : (
                  // Строка есть, контакт RLS не отдал — имени нет, но ЛПР назначен.
                  <span className="text-text-dim">—</span>
                )}
                {decisionMaker.extra > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSignalAnchor('single_threaded')}
                    title="Все участники сделки"
                    className="ml-1.5 text-text-mute transition-colors hover:text-accent"
                  >
                    +{decisionMaker.extra}
                  </button>
                )}
              </>
            ) : (
              <>
                <Placeholder onClick={() => scrollToSignalAnchor('single_threaded')} />
                {dmCost && <CostDot cost={dmCost} />}
              </>
            )}
          </RailRow>
        )}

        {/* wrap: «дата · N дн. в работе» в темах с широким кеглем (cobalt) не
            влезает в 320px и обрезалась многоточием посреди числа. Переносится
            по «·» — обе половины неразрывные. */}
        <RailRow label="Создана" wrap>
          <span className="tabular-nums text-text-dim">
            <span className="whitespace-nowrap">
              {formatDateNumeric(project.created_at)}
              {isActive && ' ·'}
            </span>
            {isActive && (
              <>
                {' '}
                <span className="whitespace-nowrap">{inWork} дн. в работе</span>
              </>
            )}
          </span>
        </RailRow>
      </RailCard>
    </div>
  );
}
