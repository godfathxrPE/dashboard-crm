'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useCreateNote } from '@/lib/hooks/use-notes';
import { MarkdownEditor, useModKeyLabel } from '@/components/shared/MarkdownEditor';
import { NOTE_MAX_LENGTH } from '@/lib/notes/build-insert';

// ═══════════════════════════════════════════════════════
// ActivityComposer — ввод заметки для любой сущности.
// S-NOTES-TIMELINE-1: вынесен из ProjectDetail в shared, чтобы стоять на
// сделке, контакте и компании. entityType выбирает FK-колонку `notes`;
// read-часть — в <EntityTimeline>. Инвалидацию ленты
// (['timeline']) делает useCreateNote.
// S-NOTES-1 (134): пишет в таблицу `notes`, а не в activity_log (`comment_added`).
//
// S-DEAL-NOTES-READ-1: многострочный ввод. Поле растёт до 12 строк, Enter — перенос
// строки, ⌘/Ctrl+Enter — отправка (как в HubSpot/Pipedrive): заметка встречи
// многострочна по природе, а Enter-отправка не давала набрать её, только вставить.
//
// S-NOTES-2.2: поле — `MarkdownEditor` (панель markdown, вставка из Word/Google Docs/
// почты сохраняет списки и жирный). Автовысота до 12 строк переехала в него.
// ═══════════════════════════════════════════════════════

// S-LEAD-HUB-2a: четвёртая сущность — лид (`notes.lead_id`; до 134 — `activity_log.lead_id`, 118).
type Entity = 'project' | 'contact' | 'company' | 'lead';

const FK_KEY: Record<Entity, 'project_id' | 'contact_id' | 'company_id' | 'lead_id'> = {
  project: 'project_id',
  contact: 'contact_id',
  company: 'company_id',
  lead: 'lead_id',
};

/** Начало плейсхолдера: о чём заметка. */
const SUBJECT: Record<Entity, string> = {
  project: 'Заметка по сделке',
  lead: 'Заметка по лиду',
  contact: 'Заметка по контакту',
  company: 'Заметка по компании',
};

interface ActivityComposerProps {
  entityType: Entity;
  entityId: string;
  /**
   * S-DEAL-ACTIVITY-VIEW-1 (W5): `deal` — поле от 2.5rem и тёмная кнопка из макета
   * «Активности» сделки. Дефолт `default` — прежний вид у лида, контакта и компании.
   */
  variant?: 'default' | 'deal';
}

export function ActivityComposer({ entityType, entityId, variant = 'default' }: ActivityComposerProps) {
  const createNote = useCreateNote();
  const [comment, setComment] = useState('');
  const sendKey = useModKeyLabel();

  function handleAddComment() {
    const text = comment.trim();
    if (!text) return;
    createNote.mutate(
      { [FK_KEY[entityType]]: entityId, body: text },
      { onSuccess: () => setComment('') },
    );
  }

  const hint = (
    <p className="mt-1 hidden text-meta text-text-mute group-focus-within:block">
      {sendKey}↵ — отправить
    </p>
  );

  const placeholder = `${SUBJECT[entityType]}… Вставка из Word, Google Docs и почты сохранит списки и жирный.`;

  const sendButton =
    variant === 'deal' ? (
      // Материал кнопки — тот же, что у плитки последнего события (`.glass-sheet`
      // + `text-accent` → `--sheet-mark`): «тёмное с акцентом» из макета, которое
      // держит контраст во всех восьми темах (в aura акцент — графит, и пара
      // `bg-text-main text-accent` там слипалась). Прижата к низу: поле растёт вверх.
      <button
        type="button"
        onClick={handleAddComment}
        disabled={!comment.trim() || createNote.isPending}
        aria-label="Отправить"
        className="glass-sheet mb-[0.0625rem] grid size-7 shrink-0 place-items-center rounded-[0.5625rem]
                   transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Send size={13} strokeWidth={2.4} className="text-accent" />
      </button>
    ) : (
      <button
        type="button"
        onClick={handleAddComment}
        disabled={!comment.trim() || createNote.isPending}
        aria-label="Отправить"
        className="grid h-[2.125rem] shrink-0 place-items-center rounded-lg bg-accent px-3 text-sm font-medium text-white
                   transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Send size={14} />
      </button>
    );

  // Рамка общая для поля и панели; сам `MarkdownEditor` рамки не имеет. Slash-команд нет,
  // поэтому и в плейсхолдере их нет (решение спринта).
  return (
    <div className={cn('group', variant === 'deal' ? 'my-3' : 'mb-4')}>
      <div
        className={cn(
          'border pb-1 pt-1.5',
          variant === 'deal'
            ? 'min-h-10 rounded-xl border-border2 pl-3.5 pr-1.5 focus-within:border-accent'
            : 'rounded-lg border-input bg-bg px-3 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent',
        )}
      >
        <MarkdownEditor
          value={comment}
          onChange={setComment}
          onSubmit={handleAddComment}
          placeholder={placeholder}
          aria-label="Добавить комментарий"
          maxLength={NOTE_MAX_LENGTH}
          fieldClassName="py-[0.4375rem] leading-5"
          actions={sendButton}
        />
      </div>
      {hint}
    </div>
  );
}
