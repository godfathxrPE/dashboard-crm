'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Rocket, Sparkles } from 'lucide-react';
import { useDeleteProject, type Project } from '@/lib/hooks/use-projects';
import { useQuotes } from '@/lib/hooks/use-quotes';
import { useCompanyLegal } from '@/lib/hooks/use-company-legal';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { useTransitionStore } from '@/lib/stores/transition-store';
import { Badge } from '@/components/ui/Badge';
import { InlineConfirm } from '@/components/ui/InlineConfirm';
import { dealHeaderAmount } from '@/lib/domain/deal-amount';
import { formatBudgetFull } from '@/lib/validators/project';
import { innStatusLabel, isRiskyInnStatus } from '@/lib/utils/inn';
import { deliveryKindLabel, hasTaskProgress } from '@/lib/constants/delivery-phases';
import type { PipelineStage } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-DEAL-RAIL-1: шапка карточки сделки/проекта — имя, бейджи, терминальные
// действия, AI, правка, удаление. Вынесена из `ProjectDetail` целиком, логика
// действий не менялась: те же переходы через модалку, тот же `InlineConfirm`.
//
// Из шапки при переносе ушли:
//   • бейдж полноты — в «Сводку» рельсы (R-06: счётчик стоит над своими полями);
//   • «Создан …» — туда же строкой «Создана» (R-11/F-09);
//   • health внедрения — в карточку «Здоровье» рельсы: держать его и здесь
//     значило бы завести второе место для одной величины (F-01).
//
// S-DEAL-HEADER-1 (спека `_analysis/deal-v2-spec.html:520–562`): у СДЕЛКИ шапка
// отвечает не «что за проект и что с ним сделать», а «кто это и сколько это
// стоит». Слева карточка идентичности (аватар, имя, реквизиты, сумма), справа —
// действия, над колонкой «Риски»: Выиграна/Проиграна это ИСХОД, а не работа.
// Сетка та же, что у тела страницы (`minmax(0,1fr) 356px`, gap 20) — шапка
// визуально продолжает колонки, а не живёт отдельной полосой.
//
// ⚠️ У `internal` и `delivery` правой колонки-рельсы нет, и шапка у них остаётся
// прежней одноколоночной — та же оговорка, что в S-DEAL-LAYOUT-1. Группа действий
// у обеих веток ОДНА (`actions` ниже): развести их значило бы завести два места
// для одних и тех же кнопок.
// ═══════════════════════════════════════════════════════

export interface DealHeaderProps {
  project: Project;
  isDelivery: boolean;
  /** Права управления delivery = контракт RLS/RPC, не `role !== 'viewer'`. */
  canManage: boolean;
  allPipelineStages: PipelineStage[] | undefined;
  /** Куда возвращаться после удаления: /deals у сделки, /projects у остальных. */
  backHref: string;
  /** Открыть Win Wizard (spawn внедрения из выигранной сделки). */
  onSpawn: () => void;
  /** Открыть модалку завершения delivery (чеклист вех, гейт 038). */
  onComplete: () => void;
  onOpenAi: () => void;
  onEdit: () => void;
}

export function DealHeader({
  project,
  isDelivery,
  canManage,
  allPipelineStages,
  backHref,
  onSpawn,
  onComplete,
  onOpenAi,
  onEdit,
}: DealHeaderProps) {
  const router = useRouter();
  const deleteProject = useDeleteProject();
  // S-R2-TRANSITION-1b: карточка не двигает стадию сама — открывает модалку
  // перехода, она же собирает причину won/lost.
  const openTransition = useTransitionStore((s) => s.open);
  // S-DEBT-CONFIRM-1: удаление — оверлей с последствиями, не window.confirm.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isDeal = project.type === 'client';

  function handleDelete() {
    setConfirmingDelete(false);
    deleteProject.mutate(project.id, {
      onSuccess: () => router.push(backHref),
    });
  }

  const typeBadge =
    project.type === 'internal' ? (
      <Badge color="accent" size="sm">Внутренний</Badge>
    ) : (
      <Badge color={project.direction === 'erp' ? 'purple' : 'blue'} size="sm">
        {project.direction === 'iiot' ? 'IIoT' : 'ERP'}
      </Badge>
    );

  const deliveryBadges = isDelivery && (() => {
    const kindLabel = project.delivery_kind
      ? deliveryKindLabel(project.delivery_kind, project.direction)
      : null;
    return (
      <>
        <Badge color="green" size="sm">Внедрение</Badge>
        {/* D1: у ERP-launch лейбл kind = «Внедрение» — дублировал бы бейдж */}
        {kindLabel && kindLabel !== 'Внедрение' && (
          <span className="text-xs text-text-mute">{kindLabel}</span>
        )}
      </>
    );
  })();

  const actions = (
    <>
      {/* Терминальные действия — одним кликом из карточки (только client — воронка) */}
      {project.type === 'client' && (project.status === 'open' || project.status === 'on_hold') && (() => {
        const pipeStages = allPipelineStages?.filter((s) => s.pipeline_id === project.pipeline_id) ?? [];
        const wonStage = pipeStages.find((s) => s.is_won);
        const lostStage = pipeStages.find((s) => s.is_lost);
        return (
          <>
            {wonStage && (
              <button
                onClick={() =>
                  openTransition({
                    project,
                    toStageId: wonStage.id,
                    // S-WON-AUTO-1 сохранён: успешный выигрыш сразу предлагает
                    // Win Wizard. Отказ гейта → onCommitted не вызовется, мастер
                    // не откроется (как и раньше через onSuccess).
                    onCommitted: onSpawn,
                  })
                }
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim
                           transition-colors hover:border-green/40 hover:text-green hover:bg-green-l"
              >
                Выиграна
              </button>
            )}
            {lostStage && (
              <button
                onClick={() => openTransition({ project, toStageId: lostStage.id })}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim
                           transition-colors hover:border-red/40 hover:text-red hover:bg-red-l"
              >
                Проиграна
              </button>
            )}
          </>
        );
      })()}
      {/* Delivery P1: терминал delivery — «Завершить проект» (status open→completed).
          P3: confirm() → модалка с чеклистом вех (гейт 038) */}
      {isDelivery && project.status === 'open' && (
        <button
          onClick={onComplete}
          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim
                     transition-colors hover:border-green/40 hover:text-green hover:bg-green-l"
        >
          Завершить проект
        </button>
      )}
      {isDelivery && project.status === 'completed' && (
        <span className="rounded-full bg-green-l px-2.5 py-1 text-xs font-medium text-green">
          Завершён
        </span>
      )}
      {(project.status === 'won' || project.status === 'lost') && (
        <>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            project.status === 'won' ? 'bg-green-l text-green' : 'bg-red-l text-red'
          }`}>
            {project.status === 'won' ? 'Выиграна' : 'Проиграна'}
            {project.actual_close_date &&
              ` · ${new Date(project.actual_close_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`}
          </span>
          {/* Delivery P1 (B4): spawn проекта внедрения из выигранной сделки.
              1 сделка → 1..N проектов — кнопка не блокируется после первого. */}
          {project.type === 'client' && project.status === 'won' && (
            <button
              onClick={onSpawn}
              className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs
                         font-medium text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Rocket size={12} /> Создать проект внедрения
            </button>
          )}
          <button
            onClick={() => {
              const firstStage = allPipelineStages
                ?.filter((s) => s.pipeline_id === project.pipeline_id && !s.is_won && !s.is_lost)
                .sort((a, b) => a.order_index - b.order_index)[0];
              if (!firstStage) return;
              // Модалка нужна и здесь (это переход), но причина не требуется —
              // целевая стадия не won/lost; исход гасится тем же UPDATE.
              openTransition({
                project,
                toStageId: firstStage.id,
                resetOutcome: true,
              });
            }}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-dim
                       transition-colors hover:bg-surface2 hover:text-text-main"
          >
            Вернуть в работу
          </button>
        </>
      )}
      {/* S-IA-DELIVERY-1 (§3.2): модалка редактирует и delivery (name/связи/owner,
          partial-payload). do_url/deadline остаются инлайн на карточке.
          Для delivery карандаш — по canManage (контракт RLS/RPC, не 42501 в лоб). */}
      {/* 085: AI по сделке — только на клиентской сделке. Бриф к встрече и сводка
          собираются из полей сделки; у delivery/internal своя фактура и своих
          пресетов пока нет. */}
      {project.type === 'client' && (
        <button
          onClick={onOpenAi}
          // S-DEAL-HEADER-1: AI-бриф — primary. Тёмная кнопка на `--text` с
          // иконкой на акцентной подложке: в шапке это единственное действие,
          // которое что-то СОЗДАЁТ, остальные меняют статус или правят поля.
          // Подпись идёт `--bg` (цвет полотна страницы), а не белым: белый на
          // `--text` верен только в светлых темах, а в `t-frost`/`t-aurora`/
          // `t-tidal` `--text` сам светлый и белая подпись на нём исчезает.
          className="flex h-[2.125rem] items-center gap-2 rounded-lg bg-text-main pl-2.5 pr-3
                     text-xs font-semibold text-bg transition-opacity hover:opacity-90"
        >
          <span
            className="grid size-[1.125rem] place-items-center rounded-md bg-accent"
            // `--on-accent` — единственный токен «контраст к акценту»; в Tailwind
            // он не объявлен, поэтому инлайном, как в MonthGrid и WeekLanes.
            style={{ color: 'var(--on-accent)' }}
          >
            <Sparkles size={11} strokeWidth={2.4} />
          </span>
          AI-бриф
        </button>
      )}
      {(!isDelivery || canManage) && (
        <button
          onClick={onEdit}
          aria-label="Редактировать"
          className="rounded-lg border border-border p-1.5 text-text-mute
                     transition-colors hover:bg-surface2 hover:text-text-main"
        >
          <Pencil size={14} />
        </button>
      )}
      <button
        onClick={() => setConfirmingDelete(true)}
        aria-label="Удалить"
        className="rounded-lg border border-border p-1.5 text-text-mute
                   transition-colors hover:bg-red/10 hover:text-red"
      >
        <Trash2 size={14} />
      </button>
      {confirmingDelete && (
        <InlineConfirm
          mode="overlay"
          question={`Удалить ${project.type === 'client' ? 'сделку' : 'проект'}?`}
          consequence="Связанные задачи сохранятся. Это действие нельзя отменить."
          pending={deleteProject.isPending}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );

  // ─── internal / delivery: прежняя одноколоночная шапка ───
  if (!isDeal) {
    return (
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="aura-page-title text-text-main">{project.name}</h1>
            {typeBadge}
            {deliveryBadges}
            {/* S-HEALTH-V2-1 (F-01): вердикт здоровья из шапки УБРАН — он живёт
                ровно в одном месте, под следующим шагом (DealNextStep). */}
          </div>
          {/* P2b (B3): прогресс задач — отдельная метрика, НЕ смешиваем со стадийным % */}
          {isDelivery && hasTaskProgress(project.progress_total) && (
            <div className="mt-1 flex items-center gap-2 text-xs text-text-mute">
              <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs font-medium text-text-dim">
                Задачи: {project.progress_done}/{project.progress_total}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">{actions}</div>
      </div>
    );
  }

  // ─── client: карточка идентичности + рельса действий ───
  return (
    <header className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_356px] lg:items-start">
      <DealIdentityCard project={project} typeBadge={typeBadge} />
      {/* `lg:self-center` — по спеке действия стоят по центру карточки, а не по
          её верхнему краю: карточка выше кнопочного ряда. */}
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end lg:self-center">
        {actions}
      </div>
    </header>
  );
}

/**
 * Карточка идентичности сделки: кто это и сколько это стоит.
 *
 * Данные приходят ТРЕМЯ дешёвыми запросами, а не расширением `PROJECT_SELECT`:
 * реквизиты — `useCompanyLegal` (см. его шапку), КП — `useQuotes` (тот же ключ
 * кэша, что у `DealOrgBlock`, второго запроса не будет), ответственный —
 * `useTeamMembers` (общий кэш на всё приложение, staleTime 5 мин).
 */
function DealIdentityCard({
  project,
  typeBadge,
}: {
  project: Project;
  typeBadge: React.ReactNode;
}) {
  const { data: legal } = useCompanyLegal(project.company_id);
  const { data: quotes, isPending: quotesPending } = useQuotes(project.id);
  const { data: members } = useTeamMembers();

  const money = dealHeaderAmount(quotes, project.budget);

  const companyId = project.company_id ?? legal?.id ?? project.company?.id ?? null;
  // Юрназвание — то, что стоит в договоре. Нет его — рабочее имя компании.
  const companyLabel = legal?.legal_name?.trim() || legal?.name?.trim() || project.company?.name?.trim() || null;

  const inn = legal?.inn?.trim() || null;
  const innRisky = isRiskyInnStatus(legal?.inn_status);
  const innStatus = innStatusLabel(legal?.inn_status);

  const ownerName = project.owner_id
    ? (members?.find((m) => m.id === project.owner_id)?.full_name ?? null)
    : null;

  // Первая буква — из имени СДЕЛКИ, не компании: заголовок печатает её же, и
  // аватар обязан читаться как метка этой строки, а не соседней.
  const initial = project.name.trim().charAt(0).toUpperCase() || '·';

  // Подстрока собирается списком и склеивается разделителем: элемент без данных
  // просто не попадает в список, и «·» не остаётся сиротой ни с одного края.
  const metaParts: React.ReactNode[] = [];
  if (companyLabel) {
    metaParts.push(
      companyId ? (
        <Link
          key="company"
          href={`/companies/${companyId}`}
          className="truncate font-medium text-text-dim transition-colors hover:text-accent"
        >
          {companyLabel}
        </Link>
      ) : (
        <span key="company" className="truncate font-medium text-text-dim">{companyLabel}</span>
      ),
    );
  }
  if (inn) {
    // S-INN-1 (конвенция 102): не-ACTIVE — риск-сигнал, договор с ликвидируемым
    // юрлицом не подписывают. Тон + СЛОВО, а не только тон: цвет единственным
    // носителем смысла — a11y-дефект, и в `t-aura` жёлтый рядом с графитом
    // отличается слабо.
    metaParts.push(
      <span key="inn" className={innRisky ? 'shrink-0 text-yellow-text' : 'shrink-0'}>
        ИНН {inn}
        {innRisky && innStatus ? ` · ${innStatus}` : ''}
      </span>,
    );
  }
  if (ownerName) metaParts.push(<span key="owner" className="shrink-0">{ownerName}</span>);

  return (
    <div className="sheet flex items-center justify-between gap-6 rounded-[1.125rem] px-[1.125rem] py-3">
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          aria-hidden="true"
          // Квадрат — `--text`, буква — `--bg`. Спека рисует букву АКЦЕНТОМ, но
          // расчёт контраста акцента на `--text` даёт 1.6–3.6:1 в семи темах из
          // восьми (t-aura 2.12, t-fuji 1.78, t-tidal 1.63, t-washi 2.65,
          // t-frost 2.88, t-aurora 3.27, t-minimal 3.61) — проходит только
          // t-lime (13.89), в котором макет и рисовался. `--bg` даёт 12.1–16.9:1
          // во ВСЕХ восьми и в тёмных темах инвертируется сам собой.
          className="grid size-11 shrink-0 place-items-center rounded-[0.875rem] bg-text-main
                     text-[0.9375rem] font-bold tracking-[-0.02em] text-bg"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2.5">
            {/* Не `aura-page-title`: тот крупнее макета (22px спеки против его
                размера) и тянет за собой типографику страницы, а здесь заголовок
                живёт ВНУТРИ карточки. */}
            <h1 className="truncate text-[1.375rem] font-semibold leading-[1.1] tracking-[-0.02em] text-text-main">
              {project.name}
            </h1>
            {typeBadge}
          </div>
          {metaParts.length > 0 && (
            // `overflow-hidden` обязателен: без него на узкой карточке (телефон,
            // где шапка схлопнута в одну колонку) подстрока НЕ переносится и не
            // обрезается, а вылезает из своей колонки и печатается ПОВЕРХ суммы.
            // Поймано смоком на ширине карточки 420px. Порядок сжатия: первым
            // ужимается юрназвание (`truncate`), ИНН и ответственный держатся
            // целыми до последнего — их и спрашивают перед звонком.
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

      {/* Сумма не рисуется вовсе, когда её нет: прочерк на месте цены читался бы
          как «ноль рублей». Источник называется подписью — по КП с версией или
          по бюджету, чтобы не гадать, откуда взялась цифра.

          ⚠️ Пока `useQuotes` не ответил, блок НЕ рисуется совсем (гейт). Иначе
          на холодной загрузке шапка сначала печатает бюджет, а потом подменяет
          его суммой КП — на живых данных это «3,0 млн» → «2,8 млн», то есть
          СТАРАЯ цена, показанная как текущая. Появление блока — честнее подмены
          числа; левая колонка при этом не двигается, она прижата влево. */}
      {money.source !== 'none' && !quotesPending && (
        <div className="shrink-0 whitespace-nowrap text-right">
          <div className="text-[1.625rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-text-main">
            {(() => {
              const full = formatBudgetFull(money.amount);
              // Хвост «₽» тише и мельче числа (спека): делим по последнему
              // пробелу форматтера. Не совпало — печатаем строку целиком, чтобы
              // смена формата ломала вид, а не сумму.
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
          <div className="mt-1 text-meta text-text-mute">
            стоимость · {money.source === 'quote' ? `по КП v${money.version}` : 'бюджет'}
          </div>
        </div>
      )}
    </div>
  );
}
