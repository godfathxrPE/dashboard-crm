'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  Check,
  Flag,
  Link2,
  MoreHorizontal,
  Pencil,
  Phone,
  Pin,
  PinOff,
  Sparkles,
  Square,
  StickyNote,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { CopyButton } from '@/components/ui/CopyButton';
import { NoteBody } from '@/components/shared/NoteBody';
import { useSetNotePinned, useSoftDeleteNote, useUpdateNote } from '@/lib/hooks/use-notes';
import { noteAbilities } from '@/lib/notes/permissions';
import { NOTE_MAX_LENGTH } from '@/lib/notes/build-insert';
import { noteHeadline } from '@/lib/text/note-blocks';
import {
  fieldChangeLines,
  formatClock,
  formatShortDate,
  formatShortDateTime,
  type FeedRow,
} from '@/lib/timeline/feed-model';
import type { OrgRole } from '@/types/database';
import type { TimelineEvent } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// S-NOTES-2.1: детали ленты сделки по макету `_analysis/mockup-S-NOTES-2.html`
// (вариант Б, «пилюля типа»): узел на оси, карточки касаний, строка стадии,
// системные строки, запланированное.
//
// Правила, которые держит этот файл:
//  • боковых маркеров нет нигде — ни `border-left`, ни inset-полосы слева у карточек
//    и блоков (правило владельца); тип несут пилюля в шапке и узел на оси;
//  • цвет — только токены; контрастный тон текста даёт глобальный `.text-yellow` /
//    `.text-purple` / `.text-blue` (`--*-text` с запасным `--*`);
//  • узел СТАДИИ — инверсный нейтральный (`bg-text-main` + `text-bg`), НЕ `--accent`:
//    в `t-washi` акцент = красный, в `t-aura` он не цветной, а `--info` синий и
//    спорит со звонком (отступление от макета, решено в спринте);
//  • `content` Tailwind сканирует только `src/components` и `src/app` — классы живут
//    здесь, а не в `lib/`.
// ═══════════════════════════════════════════════════════

/** Кто смотрит ленту: из этого считаются права на заметки (`lib/notes/permissions.ts`). */
export interface FeedViewer {
  role: OrgRole | null | undefined;
  userId: string | undefined;
}

// ─── Ось ───

export type AxisVariant = 'note' | 'meeting' | 'call' | 'stage' | 'sys';

const NODE_CLASS: Record<AxisVariant, string> = {
  note: 'mt-[0.55rem] size-[1.95rem] border-2 bg-yellow-l border-yellow/55 text-yellow',
  meeting: 'mt-[0.55rem] size-[1.95rem] border-2 bg-purple-l border-purple/55 text-purple',
  call: 'mt-[0.55rem] size-[1.95rem] border-2 bg-blue-l border-blue/55 text-blue',
  // Инверсный нейтральный: фон `text-main`, иконка `bg`.
  stage: 'mt-[0.35rem] size-[2.15rem] border-2 border-text-main bg-text-main text-bg',
  sys: 'mt-[0.5rem] size-[0.55rem] bg-border2',
};

const NODE_ICON: Record<AxisVariant, ReactNode> = {
  note: <StickyNote size={14} />,
  meeting: <Users size={14} />,
  call: <Phone size={14} />,
  stage: <Flag size={14} />,
  sys: null,
};

/**
 * Строка истории: колонка оси (узел + отрезок вниз) и содержимое. Отрезок — отдельный
 * элемент сетки между узлами с зазором, через кружок линия не проходит; у последней
 * строки дня отрезка нет (после неё метка следующего дня).
 */
export function AxisItem({
  variant,
  last,
  children,
}: {
  variant: AxisVariant;
  last: boolean;
  children: ReactNode;
}) {
  const sys = variant === 'sys';
  return (
    <li
      className={cn(
        'grid grid-cols-[2.6rem_minmax(0,1fr)] grid-rows-[auto_1fr]',
        sys ? 'pb-[0.35rem]' : 'pb-2.5',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'col-start-1 row-start-1 grid place-items-center justify-self-center rounded-full',
          NODE_CLASS[variant],
        )}
      >
        {NODE_ICON[variant]}
      </span>
      <div className="col-start-2 row-span-2 row-start-1 min-w-0">{children}</div>
      {!last && (
        <span
          aria-hidden
          className={cn(
            'col-start-1 row-start-2 -mb-[0.15rem] w-0.5 justify-self-center rounded-sm bg-border',
            sys ? 'mt-[0.35rem]' : 'mt-[0.4rem]',
          )}
        />
      )}
    </li>
  );
}

/** Метка дня — пилюля над осью. */
export function DayPill({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2.5 mt-1.5 flex">
      <span
        className="rounded-full border border-border bg-surface2 px-[0.65rem] py-[0.2rem] text-meta font-bold
                   uppercase tracking-wide text-text-dim"
      >
        {children}
      </span>
    </div>
  );
}

// ─── Мелкие части карточек ───

type PillTone = 'note' | 'meeting' | 'call' | 'essence';

const PILL_CLASS: Record<PillTone, string> = {
  note: 'bg-yellow-l text-yellow',
  meeting: 'bg-purple-l text-purple',
  call: 'bg-blue-l text-blue',
  // Не --accent: в t-washi акцент = красный, пилюля «Суть сделки» читалась бы как тревога (гейт S-NOTES-2.1).
  essence: 'bg-surface2 text-text-main',
};

/** Пилюля типа в шапке карточки (вариант Б макета). */
export function TypePill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[0.1rem] text-xs font-semibold leading-snug',
        PILL_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Автор: буква-аватар и имя. Нет имени (система, не из команды) — ничего. */
function Who({ name }: { name?: string }) {
  if (!name) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-body text-text-dim">
      <span
        aria-hidden
        className="grid size-[1.15rem] shrink-0 place-items-center rounded-full bg-surface3 text-[0.625rem]
                   font-bold text-text-dim"
      >
        {name.trim().charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

const CARD_BASE =
  'group relative max-w-[72ch] rounded-lg border border-border bg-surface px-[0.95rem] pb-3 pt-3 hover:shadow-sm';

/** Бумажный тон заметки — тот же, что у плитки «Событие». */
const NOTE_PAPER =
  'border-[color-mix(in_srgb,var(--yellow)_22%,var(--border))] ' +
  'bg-[color-mix(in_srgb,var(--yellow)_7%,var(--surface))]';
const NOTE_PINNED_BORDER = 'border-[color-mix(in_srgb,var(--yellow)_40%,var(--border))]';

function CardHead({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-2 text-body">{children}</div>;
}

function CardWhen({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-text-mute">{children}</span>
  );
}

/** Плашка действий над карточкой: hover и фокус внутри; на тач-экранах видна всегда. */
function ActionPlate({ children }: { children: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label="Действия"
      className="absolute right-2 top-2 flex gap-0.5 rounded-xl border border-border bg-popover p-0.5 shadow-sm
                 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100
                 [@media(hover:none)]:opacity-100"
    >
      {children}
    </div>
  );
}

const ACTION_BTN =
  'grid size-7 place-items-center rounded-md text-text-dim transition-colors hover:bg-surface2 ' +
  'hover:text-text-main disabled:opacity-50';

function ActionButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(ACTION_BTN, active && 'text-yellow')}
    >
      {children}
    </button>
  );
}

function CopyTextButton({ value }: { value: string }) {
  return (
    <CopyButton
      value={value}
      iconOnly
      iconSize={14}
      title="Скопировать текст"
      // Раскладку (inline-flex, центр) даёт сам `CopyButton`; `grid` из ACTION_BTN с ним спорил бы.
      className="size-7 rounded-md text-text-dim transition-colors hover:bg-surface2 hover:text-text-main"
    />
  );
}

// ─── Заметка ───

/** Закрывает всплывающее меню по клику снаружи и Esc. */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
}

/** Поле правки: растёт вместе с текстом (потолок 16 строк), ⌘/Ctrl+↵ — сохранить, Esc — отмена. */
function NoteEditor({
  initial,
  saving,
  failed,
  onSave,
  onCancel,
}: {
  initial: string;
  saving: boolean;
  failed: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const max = lineHeight * 16 + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const empty = text.trim() === '';
  const submit = () => {
    if (!empty && !saving) onSave(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="mt-2">
      <textarea
        ref={ref}
        value={text}
        maxLength={NOTE_MAX_LENGTH}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        aria-label="Текст заметки"
        className="block w-full resize-none bg-transparent py-1 font-mono text-body leading-relaxed text-text-main
                   focus:outline-none"
      />
      {failed && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-body text-danger-text">
          <AlertCircle size={14} aria-hidden />
          Не получилось сохранить — нет связи. Текст остался в поле.
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-text-mute">
        <span className="mr-auto">⌘↵ — сохранить · Esc — отмена</span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[0.625rem] px-3 py-1.5 text-body font-semibold text-text-dim transition-colors
                     hover:bg-surface2 hover:text-text-main"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={empty || saving}
          className="rounded-[0.625rem] border border-text-main bg-text-main px-3 py-1.5 text-body font-semibold
                     text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {failed ? 'Повторить' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

/**
 * Карточка заметки — одна на зону «Закреплено» и историю. Тело — `NoteBody` (свёрнуто
 * до `collapsedLines`), действия — по правам (`noteAbilities`): чужую заметку manager
 * может закрепить и скопировать, кнопок правки у него нет вовсе.
 */
export function NoteCard({
  event,
  viewer,
  now,
  pinned = false,
  showDate = false,
  collapsedLines = 6,
}: {
  event: TimelineEvent;
  viewer: FeedViewer;
  now: number;
  /** Карточка в зоне «Закреплено» — рамка темнее, кнопка «Открепить». */
  pinned?: boolean;
  /** Дата перед временем: вне группы дня (закреплённые) пилюля дня не называет день. */
  showDate?: boolean;
  collapsedLines?: number;
}) {
  const abilities = noteAbilities(viewer.role, viewer.userId, event.actorId);
  const body = event.body ?? '';
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useDismiss(menu, () => setMenu(false));

  const update = useUpdateNote();
  const setPinned = useSetNotePinned();
  const softDelete = useSoftDeleteNote();

  // Первая строка — заголовок, только если за ней есть текст и она не абзац.
  const { head, rest } = noteHeadline(body);
  const title = head && rest ? head : null;
  const text = title ? rest : body;

  async function save(next: string) {
    if (next.trim() === body.trim()) {
      setEditing(false);
      return;
    }
    setFailed(false);
    try {
      await update.mutateAsync({ id: event.sourceId, body: next });
      setEditing(false);
    } catch {
      // Откат кэша и тост сделал хук; текст остаётся в поле, строка ошибки — здесь.
      setFailed(true);
    }
  }

  function copyLink() {
    setMenu(false);
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#note-${event.sourceId}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Ссылка скопирована'),
      () => toast.error('Не удалось скопировать ссылку'),
    );
  }

  const when = showDate
    ? formatShortDateTime(event.date, now)
    : formatClock(event.date);

  return (
    <article
      id={`note-${event.sourceId}`}
      className={cn(CARD_BASE, NOTE_PAPER, pinned && NOTE_PINNED_BORDER, editing && 'border-accent')}
    >
      {!editing && (
        <ActionPlate>
          {abilities.canPin && (
            <ActionButton
              label={pinned ? 'Открепить' : 'Закрепить'}
              active={pinned}
              disabled={setPinned.isPending}
              onClick={() => setPinned.mutate({ id: event.sourceId, pinned: !pinned })}
            >
              {pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </ActionButton>
          )}
          {abilities.canEdit && (
            <ActionButton label="Изменить" onClick={() => setEditing(true)}>
              <Pencil size={14} />
            </ActionButton>
          )}
          <CopyTextButton value={body} />
          {abilities.canDelete && (
            <div ref={menuRef} className="relative">
              <ActionButton label="Ещё" onClick={() => setMenu((v) => !v)}>
                <MoreHorizontal size={14} />
              </ActionButton>
              {menu && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-10 mt-1 grid min-w-[12rem] rounded-xl border border-border
                             bg-popover p-1 shadow-md"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={copyLink}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-body text-text-main
                               transition-colors hover:bg-surface2"
                  >
                    <Link2 size={14} aria-hidden /> Скопировать ссылку
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      softDelete.mutate(event.sourceId);
                    }}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-body text-danger-text
                               transition-colors hover:bg-surface2"
                  >
                    <Trash2 size={14} aria-hidden /> Удалить
                  </button>
                </div>
              )}
            </div>
          )}
        </ActionPlate>
      )}

      <CardHead>
        <TypePill tone="note">
          {pinned && <Pin size={11} aria-hidden />}
          Заметка
        </TypePill>
        <Who name={event.actorName} />
        <CardWhen>
          {when}
          {event.editedAt && (
            <>
              {' · '}
              <span title={`Изменено ${formatShortDateTime(event.editedAt, now)}`}>изменено</span>
            </>
          )}
        </CardWhen>
      </CardHead>

      {editing ? (
        <NoteEditor
          initial={body}
          saving={update.isPending}
          failed={failed}
          onSave={(next) => void save(next)}
          onCancel={() => {
            setEditing(false);
            setFailed(false);
          }}
        />
      ) : (
        <>
          {title && <p className="mt-2 font-semibold tracking-tight text-text-main">{title}</p>}
          {text && (
            <NoteBody
              text={text}
              collapsedLines={collapsedLines}
              expandLabel="Показать полностью"
              className={title ? 'mt-0.5' : 'mt-2'}
            />
          )}
        </>
      )}
    </article>
  );
}

// ─── Встреча и звонок ───

function meetingTitle(e: TimelineEvent): string | null {
  const t = e.title.replace(/^Встреча:\s*/, '').trim();
  return t && t !== 'Встреча' ? t : null;
}

/** Статус — нейтральный текст с галочкой, не зелёная пилюля (решение спринта). */
function statusOf(e: TimelineEvent, now: number): { text: string; done: boolean } {
  if (e.kind === 'meeting') {
    const past = new Date(e.date).getTime() <= now;
    return { text: past ? 'состоялась' : 'запланирована', done: past };
  }
  if (e.status === 'done') return { text: 'выполнен', done: true };
  if (e.status === 'pending') return { text: 'запланирован', done: false };
  return { text: 'отменён', done: false };
}

/**
 * Карточка встречи / звонка. Действия: «Изменить» открывает существующее окно
 * (`onOpenEvent`), «Скопировать текст» — у всех, включая viewer.
 */
export function TouchCard({
  event,
  now,
  canEdit,
  onOpenEvent,
}: {
  event: TimelineEvent;
  now: number;
  canEdit: boolean;
  onOpenEvent?: (event: TimelineEvent) => void;
}) {
  const meeting = event.kind === 'meeting';
  const title = meeting ? meetingTitle(event) : null;
  const status = statusOf(event, now);
  const copyValue = [title, event.body, event.nextStep && `Дальше: ${event.nextStep}`]
    .filter(Boolean)
    .join('\n\n');

  return (
    <article className={CARD_BASE}>
      <ActionPlate>
        {canEdit && onOpenEvent && (
          <ActionButton label="Изменить" onClick={() => onOpenEvent(event)}>
            <Pencil size={14} />
          </ActionButton>
        )}
        {copyValue && <CopyTextButton value={copyValue} />}
      </ActionPlate>

      <CardHead>
        <TypePill tone={meeting ? 'meeting' : 'call'}>{meeting ? 'Встреча' : 'Звонок'}</TypePill>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-text-dim">
          {status.done && <Check size={12} aria-hidden />}
          {status.text}
        </span>
        <Who name={event.actorName} />
        <CardWhen>{formatClock(event.date)}</CardWhen>
      </CardHead>

      {title && <p className="mt-2 font-semibold tracking-tight text-text-main">{title}</p>}
      {event.body && (
        <NoteBody
          text={event.body}
          collapsedLines={6}
          expandLabel="Показать полностью"
          className={title ? 'mt-0.5' : 'mt-2'}
        />
      )}
      {event.nextStep && (
        <div className="mt-2.5 flex items-baseline gap-2 rounded-xl bg-surface2 px-2.5 py-1.5 text-body">
          <b className="whitespace-nowrap text-meta font-bold uppercase tracking-wide text-text-mute">Дальше</b>
          <span className="min-w-0 text-text-main">{event.nextStep}</span>
        </div>
      )}
    </article>
  );
}

// ─── Смена стадии ───

/**
 * Карточка «было → стало»; комментарий перехода (`stage_comment`) стоит внутри.
 * У легаси-записи без имён стадий (`stage_change` до 14.07) — готовый заголовок события.
 */
export function StageCard({ event, comment }: { event: TimelineEvent; comment?: TimelineEvent }) {
  const from = event.stage?.fromName;
  const to = event.stage?.toName;
  return (
    <div className="max-w-[72ch] rounded-lg border border-border bg-surface2 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-body text-text-dim">
        {from && to ? (
          <>
            <span className="truncate">{from}</span>
            <span aria-label="перешла в" className="text-text-mute">
              →
            </span>
            <b className="truncate font-bold text-text-main">{to}</b>
          </>
        ) : (
          <span className="truncate font-semibold text-text-main">{event.title}</span>
        )}
        <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-text-mute">
          {formatClock(event.date)}
          {event.actorName && ` · ${event.actorName}`}
        </span>
      </div>
      {comment?.body && (
        <div className="mt-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5">
          <NoteBody text={comment.body} collapsedLines={4} expandLabel="Показать полностью" />
        </div>
      )}
    </div>
  );
}

// ─── Системные строки ───

function pluralChanges(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'изменение';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'изменения';
  return 'изменений';
}

function SysLine({
  children,
  when,
}: {
  children: ReactNode;
  when: string;
}) {
  return (
    <div className="flex items-baseline gap-2.5 py-0.5 text-body text-text-dim">
      <span className="min-w-0 flex-1">{children}</span>
      <span className="ml-2 whitespace-nowrap text-xs tabular-nums text-text-mute">{when}</span>
    </div>
  );
}

function sysWhen(e: TimelineEvent): string {
  return `${formatClock(e.date)} · ${e.actorName ?? 'система'}`;
}

/** Одна системная строка: поля, AI, закрытая задача. Открываемые (`task`, `ai_run`) — кнопкой. */
export function SystemRow({
  event,
  onOpenEvent,
}: {
  event: TimelineEvent;
  onOpenEvent?: (event: TimelineEvent) => void;
}) {
  const openable = Boolean(onOpenEvent) && (event.kind === 'task' || event.kind === 'ai_run' || event.refType === 'task');
  const taskDone = event.kind === 'task' && event.status === 'done';
  const text = taskDone ? `Задача закрыта: ${event.title.replace(/^Задача:\s*/, '')}` : event.title;
  const content = (
    <>
      {event.kind === 'ai_run' && <Sparkles size={13} aria-hidden className="mr-1 inline-block align-[-0.15em]" />}
      {text}
    </>
  );
  return (
    <SysLine when={sysWhen(event)}>
      {openable ? (
        <button
          type="button"
          onClick={() => onOpenEvent?.(event)}
          className="text-left transition-colors hover:text-text-main"
        >
          {content}
        </button>
      ) : (
        content
      )}
    </SysLine>
  );
}

/** Склейка правок полей: «3 изменения · Бюджет, Следующий шаг» с раскрытием. */
export function FieldsGroupRow({ group }: { group: Extract<FeedRow, { type: 'fields' }> }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const newest = group.items[0];
  return (
    <div>
      <SysLine when={sysWhen(newest)}>
        <b className="font-semibold text-text-main">
          {group.count} {pluralChanges(group.count)}
        </b>
        {' · '}
        {group.labels.join(', ')}{' '}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="text-xs underline underline-offset-2 transition-colors hover:text-text-main"
        >
          {open ? 'скрыть' : 'показать'}
        </button>
      </SysLine>
      {open && (
        <ul id={id} className="mt-0.5 grid gap-0.5 pl-2 text-body text-text-dim">
          {group.items.flatMap((e) =>
            fieldChangeLines(e).map((line, i) => <li key={`${e.id}-${i}`}>{line}</li>),
          )}
        </ul>
      )}
    </div>
  );
}

// ─── Запланировано ───

/** Строка зоны «Запланировано»: задача с чекбоксом-видом или встреча; клик — открыть. */
export function PlannedRow({
  event,
  now,
  onOpenEvent,
}: {
  event: TimelineEvent;
  now: number;
  onOpenEvent?: (event: TimelineEvent) => void;
}) {
  const task = event.kind === 'task';
  const overdue = event.status === 'overdue';
  const title = task ? event.title.replace(/^Задача:\s*/, '') : event.title;
  const date = task ? formatShortDate(event.date, now) : formatShortDateTime(event.date, now);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenEvent?.(event)}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-2 py-1.5
                   text-left text-body transition-colors hover:bg-surface2"
      >
        {task ? (
          <Square size={15} aria-hidden className="text-border2" />
        ) : (
          <Users size={15} aria-hidden className="text-text-mute" />
        )}
        <span className="min-w-0 truncate text-text-main">{title}</span>
        <span
          className={cn(
            'whitespace-nowrap text-xs tabular-nums',
            overdue ? 'font-semibold text-danger-text' : 'text-text-mute',
          )}
        >
          {overdue && 'просрочено · '}
          {date}
          {event.actorName && !overdue && ` · ${event.actorName}`}
        </span>
      </button>
    </li>
  );
}
