'use client';

import { useMemo } from 'react';
import { ChevronRight, Check, Phone } from 'lucide-react';
import { useUpdateProject, type Project } from '@/lib/hooks/use-projects';
import { useContactBrief, type ContactBrief } from '@/lib/hooks/use-contact-brief';
import { useEntityTimeline } from '@/lib/hooks/use-entity-timeline';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { getDealHealth, getNextActionOverdueDays } from '@/lib/utils/deal-health';
import { useFieldMoves } from '@/lib/hooks/use-stage-story';
import { touchGapDays, TOUCH_GAP_MIN_DAYS } from '@/lib/domain/touch-gap';
import { pluralRu } from '@/lib/utils/plural';
import { cn } from '@/lib/utils/cn';
import { formatPhone, telHref } from '@/lib/utils/phone';
import { getInitials } from '@/lib/utils/avatar';
import { formatContactName } from '@/lib/utils/contact-name';
import { CopyButton } from '@/components/ui/CopyButton';

// ═══════════════════════════════════════════════════════
// S-DEAL-RAIL-1 (R-09): «Следующий шаг» — рабочая зона левой колонки.
//
// Выделен из `DealFocusPanel`: панель тянула в один ряд шаг, закреплённую
// заметку и здоровье, и справочное соседство отбирало у шага вес. Заметка и
// сигналы уехали в рельсу контекста, здесь остался шаг и одна строка вердикта
// под ним — чтобы «что делать» и «как дела» стояли рядом.
//
// Вердикт здесь ЕДИНСТВЕННЫЙ на экране: в рельсе панель сигналов рисуется без
// него (`showVerdict={false}`). Два вердикта — воспроизведение F-01.
//
// S-DEAL-NEXTSTEP-1 (W2): материал зоны — СТЕКЛО (`.glass-sheet`), а не лист.
// Развилка Р-Г закрыта владельцем 09.09. Прежнее «стекло не вводится» (08.09,
// `DealLastEvent`) распространялось на «последнее событие» — контекст; материал
// зоны «Работа» спека отдавала именно этому спринту, и здесь он решается.
// Класс `.glass` из спеки не заводится: контракт стекла уже живёт в `--glass-*`
// во всех восьми темах, и в светлых он сам собой вырождается в лист.
//
// Из спеки W2 НЕ берётся:
//  · «обновлён {ago} · {author}» — штампа «кто правил шаг» в схеме нет, вытащить
//    его можно только разбором аудита 087, а это другой спринт;
//  · кнопка «Перенести» — дата уже редактируется на месте, а переносы уже
//    считаются и печатаются ниже; отдельная кнопка была бы вторым путём к тому
//    же полю, то есть F-01;
//  · аватар контакта и «ждём {имя}» — «кого ждём» в схеме нет (см. строку
//    ожидания ниже).
//
// S-DEAL-CONTACT-1 (спека A1-a): в футер встал чип ОСНОВНОГО контакта сделки
// (`projects.contact_id`) с номером целиком. Это не «кого ждём» из W2 — чип
// ничего не утверждает об ожидании, он убирает четыре клика до номера.
// ═══════════════════════════════════════════════════════

// ─── Дата следующего шага: «сегодня/завтра/вчера» вблизи, иначе «7 июля» ───
function formatActionDate(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const today = new Date(new Date().toDateString());
  const target = new Date(new Date(d).toDateString());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'сегодня';
  if (diffDays === 1) return 'завтра';
  if (diffDays === -1) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/**
 * Чип основного контакта (спека 1.3–1.4). Рисуется, только если есть что
 * показать: нет контакта — нет чипа, без пустого слота и «добавить контакт».
 *
 * Акцент — рамкой и иконкой кнопки звонка, не заливкой: заливка `--accent` в
 * виджете одна, у метки «Следующий шаг». Цвет рамки ставит правило `.glass-call`
 * в globals.css, а не утилита `border-accent`: в frost/aurora/tidal safety-net
 * `.t-frost *` безслойный и перебил бы любую `border-*`-утилиту.
 */
function PrimaryContactChip({ contact }: { contact: ContactBrief }) {
  const name = formatContactName(contact.first_name, contact.last_name);
  const focusRing =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="grid size-[1.375rem] shrink-0 place-items-center rounded-full bg-surface2 text-[0.6rem] font-bold text-text-main"
      >
        {getInitials(contact.first_name)}
      </span>
      {/* Имя и должность переносятся по словам (15rem ≈ 240px спеки); номер — никогда. */}
      <span className="min-w-0 max-w-[15rem] leading-[1.2]">
        <span className="block text-xs font-semibold text-text-main">{name}</span>
        {contact.position && (
          <span className="block text-pretty text-[0.65625rem] text-text-dim">{contact.position}</span>
        )}
      </span>
      {contact.phone ? (
        <a
          href={telHref(contact.phone)}
          title={`Позвонить: ${name}`}
          className={cn(
            'glass-call inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5',
            'text-xs font-semibold tabular-nums text-text-main transition-colors',
            focusRing,
          )}
        >
          <Phone size={12} className="text-accent" aria-hidden />
          {formatPhone(contact.phone)}
        </a>
      ) : (
        contact.email && (
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="min-w-0 text-meta text-text-dim [overflow-wrap:anywhere]">{contact.email}</span>
            <CopyButton
              value={contact.email}
              title="Скопировать почту"
              iconSize={11}
              // Кегль вне `cn`: tailwind-merge выкинул бы `text-meta` рядом с `text-text-dim`.
              className={`text-meta ${cn(
                'h-[1.375rem] rounded-sm bg-surface2 px-1.5 text-text-dim hover:text-text-main',
                focusRing,
              )}`}
            />
          </span>
        )
      )}
    </div>
  );
}

export function DealNextStep({ project }: { project: Project }) {
  const updateProject = useUpdateProject();
  // S-DEAL-ZONES-1B (Р8): счёт из того же queryFn, что уже считал переносы
  // дедлайна — второго ключа и второго запроса нет.
  const { data: moves } = useFieldMoves(project.id);
  const stepMoves = moves?.step.count ?? 0;

  // Визитка основного контакта: запрос сделки несёт только имя (см. use-contact-brief).
  const { data: primaryContact } = useContactBrief(project.contact_id);
  // Чип без телефона и почты не рисуем: имя без способа связи — это не «в один клик».
  const showChip = !!primaryContact && !!(primaryContact.phone || primaryContact.email);

  // Строка ожидания. Вызов БЕЗ `kinds` — тот же, что у `DealLastEvent`, поэтому
  // ключ React Query (`['timeline','project',id,'all',50]`) у них общий и второго
  // запроса нет. ⚠️ Дедупликация именно с `DealLastEvent`, а НЕ с виджетом ленты:
  // у ленты `kindFilter={DEAL_TIMELINE_KINDS}`, и её ключ другой даже при полном
  // наборе видов ('all' ≠ отсортированный массив).
  const { events } = useEntityTimeline('project', project.id);
  const gapDays = useMemo(() => touchGapDays(events, new Date()), [events]);
  const showGap = gapDays !== null && gapDays >= TOUCH_GAP_MIN_DAYS;

  const health = getDealHealth(project);
  const overdue = health === 'overdue-action';
  const noAction = health === 'no-action';
  const overdueDays = overdue && project.next_action_date
    ? getNextActionOverdueDays(project.next_action_date)
    : 0;

  function markStepDone() {
    updateProject.mutate({ id: project.id, next_step: null, next_action_date: null });
  }

  return (
    // Якорь CTA сигнала `next_step`. В peek-панели (DealFocusPanel) id не ставится
    // вовсе: она монтируется поверх страницы, и дубль увёл бы getElementById.
    // `data-next-step` — отдельный хук для замеров вертикали (S-DEAL-ZONES-1A):
    // id занят якорем scrollToSignalAnchor и переиспользованию не подлежит.
    <div id="deal-next-step" data-next-step className="min-w-0">
      <div
        data-card
        // Жёлтый кант пустого состояния живёт в CSS материала, а не в утилитах:
        // safety-net тёмных тем (`.t-frost *`) глушит любую `border-*`-утилиту при
        // равной специфичности. Отсюда `data-empty` вместо классов рамки.
        // Акцентной полосы слева нет — снята по визуальной приёмке 09.09.
        data-empty={noAction ? 'true' : undefined}
        className="glass-sheet px-5 pb-4 pt-[1.125rem]"
      >
        <div className="mb-2.5 flex items-center gap-2">
          {/* Иконка в акцентном квадрате 22px r8 — из макета W2. `bg-accent text-white`
              — та же пара, что в 82 местах разметки; на стекле её перекрашивает
              `.glass-sheet .bg-accent.text-white { color: var(--sheet-mark-ink) }`
              (globals.css): заливка здесь — светлая метка темы, а не акцент.
              `rounded-sm` = --radius-s (2…9px),
              а не `rounded-lg`: в палитре проекта lg — это --radius-l (16…20px), и
              квадрат 22px им превратился бы в кружок. */}
          <span className="grid h-[1.375rem] w-[1.375rem] shrink-0 place-items-center rounded-sm bg-accent text-white">
            <ChevronRight size={13} strokeWidth={3} />
          </span>
          <span className="text-xs font-bold tracking-[0.02em] text-accent">
            Следующий шаг
          </span>
        </div>

        {/* S-DEAL-ZONES-1A (F-08): 72ch на теле шага — при широкой левой колонке
            строка уходила за 100 знаков при норме 45–75. Спека даёт 760px; ch
            держит ту же меру в знаках при любом кегле темы. */}
        <div className="glass-plate max-w-[72ch] px-[1.125rem] py-3.5">
          <div className="text-xl font-medium leading-[1.3] tracking-[-0.015em] text-pretty">
            <InlineEdit
              value={project.next_step ?? ''}
              placeholder="Какой следующий шаг?"
              // S-UI-CLARITY-1: пустое состояние выглядит пустым. Цвет (text-text-mute)
              // InlineEdit даёт сам, курсив — здесь: приглашение того же начертания,
              // что реальный шаг, пролистывалось как заполненное поле.
              className={cn(!project.next_step && 'italic')}
              onSave={async (val) => {
                updateProject.mutate({ id: project.id, next_step: val || null });
              }}
            />
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
          <span className="flex items-center gap-1">
            <span className="text-text-dim">Дата:</span>
            <InlineEdit
              value={project.next_action_date ?? ''}
              type="date"
              placeholder="назначить"
              formatDisplay={formatActionDate}
              onSave={async (val) => {
                updateProject.mutate({ id: project.id, next_action_date: val || null });
              }}
              // Тот же принцип: «назначить» — приглашение, а не значение даты.
              className={cn(project.next_action_date ? 'font-medium' : 'italic', overdue && 'text-red')}
            />
          </span>
          {overdue && (
            <span className="font-medium text-red">
              просрочен {overdueDays} дн.
            </span>
          )}
          {/* Порог ≥2 из Р8: один перенос — работа, два и больше — диагноз. */}
          {stepMoves >= 2 && (
            <span className="text-warning-text">
              перенесён {stepMoves} {pluralRu(stepMoves, 'раз', 'раза', 'раз')}
            </span>
          )}
          {project.next_step && (
            <button
              onClick={markStepDone}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-0.5
                         text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-green"
            >
              <Check size={12} />
              Шаг сделан
            </button>
          )}
          {/* ⚠️ «БЕЗ КАСАНИЯ», а не «без ответа» из спеки. Направления у касания в
              схеме нет, поля «кого ждём» нет, входящих событий система не знает
              вовсе — печатать «N дн. без ответа» по числу дней с НАШЕГО последнего
              действия значило бы соврать (разбор — `lib/domain/touch-gap.ts`).
              Имя не печатаем по той же причине. Строка справа: это не действие, а
              фон работы. */}
          {/* S-DEAL-CONTACT-1: `ml-auto` переехал со строки «без касания» на её
              группу с чипом. Иначе при переносе футера чип падал бы на вторую
              строку к ЛЕВОМУ краю, а без строки «без касания» не прижимался бы
              вправо вовсе. Внутри группы порядок спеки: «без касания» → чип. */}
          {(showGap || showChip) && (
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
              {showGap && gapDays !== null && (
                <span className="text-meta text-text-dim">
                  {gapDays} {pluralRu(gapDays, 'день', 'дня', 'дней')} без касания
                </span>
              )}
              {showChip && primaryContact && <PrimaryContactChip contact={primaryContact} />}
            </div>
          )}
        </div>
      </div>

      {/* Вердикт отсюда УБРАН (S-DEAL-ZONES-1B): он переехал в зону «Риски», к
          кольцу и посигнальной полосе. Держать его в обоих местах — это F-01,
          два словесных носителя одного факта. Причина («Шаг просрочен на N
          дн.») там же первой строкой списка сигналов, так что потерян дубль,
          а не смысл. Пилюля «нет даты» рядом с полем даты по-прежнему не
          добавляется (R-10). */}
    </div>
  );
}
