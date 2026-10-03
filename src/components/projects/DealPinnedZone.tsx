'use client';

import { useState, type ReactNode } from 'react';
import { Pencil, Pin } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MarkdownEditor } from '@/components/shared/MarkdownEditor';
import { useProject, useUpdateProject } from '@/lib/hooks/use-projects';
import { PINNED_LIMIT, usePinnedNotes, pinnedNotesKey, type NoteEntityType } from '@/lib/hooks/use-notes';
import { useRealtimeSync } from '@/lib/hooks/use-realtime';
import { canWriteFeed } from '@/lib/notes/permissions';
import { NoteCard, TypePill, type FeedViewer } from './DealFeedParts';

// ═══════════════════════════════════════════════════════
// S-NOTES-2.1: зона «Закреплено» ленты сделки и лида.
//
// «Суть сделки» — поле `projects.pinned_note` (одно значение, без автора и истории),
// правка на месте. Его пишут также AI-прогрессия, автоматизации (`set_field`), конверсия
// лида и модалка перехода стадии, а гейт стадии умеет его требовать — поэтому поле
// остаётся полем, а в UI меняется только название и место (было: карточка «Закреплено»
// в правой колонке сделки).
//
// Под ним — до трёх закреплённых заметок (`usePinnedNotes`, отдельный запрос: лента
// пагинирована, закреплённая может лежать на любой странице). У ЛИДА зона — только
// закреплённые заметки: поля «Суть сделки» у лида нет.
// ═══════════════════════════════════════════════════════

/** Потолок «Сути сделки». Прогрессия AI допускает 2000 — длиннее исходное значение не режем. */
const ESSENCE_MAX = 500;

const ESSENCE_CARD =
  'group relative max-w-[72ch] rounded-lg border border-border bg-surface2 px-[0.85rem] pb-2.5 pt-2.5';

function EssenceBlock({
  projectId,
  value,
  canEdit,
}: {
  projectId: string;
  value: string;
  canEdit: boolean;
}) {
  const update = useUpdateProject();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EssenceEditor
        initial={value}
        onCancel={() => setEditing(false)}
        onSave={(next) => {
          // Пустое значение пишется как `null` — так поле очищалось в рельсе (`val || null`).
          update.mutate({ id: projectId, pinned_note: next.trim() || null });
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className={ESSENCE_CARD}>
      <div className="flex items-center gap-2.5 text-body">
        <TypePill tone="essence">
          <Pin size={11} aria-hidden />
          Суть сделки
        </TypePill>
        <span className="text-meta text-text-mute">поле сделки · читает AI</span>
        {value && canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Изменить"
            aria-label="Изменить суть сделки"
            className="ml-auto grid size-[1.6rem] place-items-center rounded-md text-text-dim opacity-0
                       transition-opacity hover:bg-surface3 hover:text-text-main focus-visible:opacity-100
                       group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>
      {value ? (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text-main">{value}</p>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1 block cursor-text text-left text-body text-text-mute transition-colors hover:text-text-dim"
        >
          Две строки: что продаём и что мешает закрыть
        </button>
      )}
    </div>
  );
}

/** Правка на месте: до 500 знаков со счётчиком, ⌘/Ctrl+↵ — сохранить, Esc — отмена. */
function EssenceEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  // Длиннее потолка приходит от AI-прогрессии (до 2000): держим исходную длину как
  // максимум, иначе такую сделку нельзя было бы даже открыть на правку без обрезки.
  const limit = Math.max(ESSENCE_MAX, initial.length);

  return (
    <div className="max-w-[72ch] rounded-lg border border-accent bg-surface px-[0.85rem] pb-2.5 pt-2.5">
      <div className="flex items-center gap-2.5 text-body">
        <TypePill tone="essence">
          <Pin size={11} aria-hidden />
          Суть сделки
        </TypePill>
        <span
          className={cn(
            'ml-auto text-meta tabular-nums',
            text.length >= limit ? 'text-danger-text' : 'text-text-mute',
          )}
        >
          {text.length} / {limit}
        </span>
      </div>
      {/* Суть — 1–2 предложения, разметка ей не нужна: поле без панели. */}
      <MarkdownEditor
        value={text}
        onChange={setText}
        onSubmit={() => onSave(text)}
        onCancel={onCancel}
        toolbar={false}
        maxLength={limit}
        autoFocus
        aria-label="Суть сделки"
        placeholder="Две строки: что продаём и что мешает закрыть"
        className="mt-1"
        fieldClassName="text-sm"
      />
      <div className="mt-1 flex items-center gap-2 text-xs text-text-mute">
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
          onClick={() => onSave(text)}
          className="rounded-[0.625rem] border border-text-main bg-text-main px-3 py-1.5 text-body font-semibold
                     text-bg transition-opacity hover:opacity-90"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

/**
 * Зона «Закреплено»: суть сделки (только сделка) + закреплённые заметки.
 * Зоны нет совсем, если сути нет, закреплённых нет и пользователь не может писать.
 */
export function DealPinnedZone({
  entityType,
  entityId,
  viewer,
  now,
}: {
  entityType: Extract<NoteEntityType, 'project' | 'lead'>;
  entityId: string;
  viewer: FeedViewer;
  now: number;
}) {
  // Закрепление и открепление в соседней вкладке (и тем же пользователем с телефона)
  // приезжает сюда без перезагрузки.
  useRealtimeSync('notes', pinnedNotesKey(entityType, entityId));
  const { notes } = usePinnedNotes(entityType, entityId);
  const isDeal = entityType === 'project';
  const canEdit = canWriteFeed(viewer.role);
  // Пока сделка не загрузилась, «Сути» нет: пустое поле выглядело бы приглашением
  // переписать то, что просто ещё не приехало. `useProject('')` выключен (`enabled: !!id`).
  const { data: project } = useProject(isDeal ? entityId : '');
  const essenceValue = project?.pinned_note ?? '';
  // Нечего показать и некому писать (viewer, пусто) — блока нет совсем.
  const showEssence = isDeal && project !== undefined && (essenceValue !== '' || canEdit);

  if (!showEssence && notes.length === 0) return null;

  return (
    <section aria-label="Закреплено" className="mt-5">
      <ZoneHeader count={notes.length} limit={PINNED_LIMIT}>
        <Pin size={13} aria-hidden /> Закреплено
      </ZoneHeader>
      <div className="grid gap-2">
        {showEssence && <EssenceBlock projectId={entityId} value={essenceValue} canEdit={canEdit} />}
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            event={note}
            viewer={viewer}
            now={now}
            pinned
            showDate
            collapsedLines={3}
          />
        ))}
      </div>
    </section>
  );
}

/** Заголовок зоны: подпись, линия, счётчик «N из M». */
export function ZoneHeader({
  children,
  count,
  limit,
}: {
  children: ReactNode;
  count?: number;
  limit?: number;
}) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-meta font-semibold uppercase tracking-wider text-text-mute">
      <span className="flex items-center gap-1.5">{children}</span>
      <span aria-hidden className="h-px flex-1 bg-border" />
      {count !== undefined && (
        <span className="tabular-nums tracking-normal">
          {limit !== undefined ? `${count} из ${limit}` : count}
        </span>
      )}
    </h3>
  );
}
