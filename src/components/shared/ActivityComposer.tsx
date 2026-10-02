'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { useLogActivity } from '@/lib/hooks/use-activity-log';

// ═══════════════════════════════════════════════════════
// ActivityComposer — ввод заметки (comment_added) для любой сущности.
// S-NOTES-TIMELINE-1: вынесен из ProjectDetail в shared, чтобы стоять на
// сделке, контакте и компании. entityType выбирает FK-колонку activity_log;
// read-часть — в <EntityTimeline>. Инвалидацию ленты
// (['timeline']) делает useLogActivity.
//
// S-DEAL-NOTES-READ-1: многострочный ввод. Поле растёт до 12 строк, Enter — перенос
// строки, ⌘/Ctrl+Enter — отправка (как в HubSpot/Pipedrive): заметка встречи
// многострочна по природе, а Enter-отправка не давала набрать её, только вставить.
// ═══════════════════════════════════════════════════════

// S-LEAD-HUB-2a: четвёртая сущность — лид (`activity_log.lead_id`, миграция 118).
type Entity = 'project' | 'contact' | 'company' | 'lead';

const FK_KEY: Record<Entity, 'project_id' | 'contact_id' | 'company_id' | 'lead_id'> = {
  project: 'project_id',
  contact: 'contact_id',
  company: 'company_id',
  lead: 'lead_id',
};

/** Потолок автовысоты поля — 12 строк; выше — прокрутка внутри поля. */
const MAX_ROWS = 12;

/**
 * Клавиша отправки для подсказки. Определяется в эффекте, а не при рендере: на
 * сервере `navigator` нет, и расхождение серверной и клиентской разметки дало бы
 * ошибку гидратации. До эффекта — «Ctrl», безопасный дефолт.
 */
function useSendKeyLabel(): string {
  const [label, setLabel] = useState('Ctrl');
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
    if (/mac|iphone|ipad/i.test(platform)) setLabel('⌘');
  }, []);
  return label;
}

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
  const logMutation = useLogActivity();
  const [comment, setComment] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendKey = useSendKeyLabel();

  // Поле растёт вместе с текстом и схлопывается после отправки: эффект зависит от
  // `comment`, поэтому сброс в '' проходит тем же путём, что набор.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = getComputedStyle(el);
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const max = lineHeight * MAX_ROWS + padding + border;
    // scrollHeight границу не включает, а `box-sizing: border-box` её требует.
    const want = el.scrollHeight + border;
    el.style.height = `${Math.min(want, max)}px`;
    el.style.overflowY = want > max ? 'auto' : 'hidden';
  }, [comment]);

  function handleAddComment() {
    const text = comment.trim();
    if (!text) return;
    logMutation.mutate(
      { [FK_KEY[entityType]]: entityId, event_type: 'comment_added', payload: { text } },
      { onSuccess: () => setComment('') },
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddComment();
    }
  }

  const hint = (
    <p className="mt-1 hidden text-meta text-text-mute group-focus-within:block">
      {sendKey}↵ — отправить
    </p>
  );

  if (variant === 'deal') {
    return (
      <div className="group my-3">
        <div
          className="flex min-h-10 items-end gap-2.5 rounded-xl border border-border2 pl-3.5 pr-1.5
                     focus-within:border-accent"
        >
          {/* Slash-команд нет, поэтому и в плейсхолдере их нет (решение спринта). */}
          <textarea
            ref={textareaRef}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Добавить комментарий…"
            aria-label="Добавить комментарий"
            rows={1}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 resize-none bg-transparent py-[0.5625rem] text-body leading-5
                       text-text-main placeholder:text-text-mute focus:outline-none"
          />
          {/* Материал кнопки — тот же, что у плитки последнего события (`.glass-sheet`
              + `text-accent` → `--sheet-mark`): «тёмное с акцентом» из макета, которое
              держит контраст во всех восьми темах (в aura акцент — графит, и пара
              `bg-text-main text-accent` там слипалась). Прижата к низу: поле растёт вверх. */}
          <button
            type="button"
            onClick={handleAddComment}
            disabled={!comment.trim() || logMutation.isPending}
            aria-label="Отправить"
            className="glass-sheet mb-[0.3125rem] grid size-7 shrink-0 place-items-center rounded-[0.5625rem]
                       transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Send size={13} strokeWidth={2.4} className="text-accent" />
          </button>
        </div>
        {hint}
      </div>
    );
  }

  return (
    <div className="group mb-4">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Добавить комментарий..."
          rows={1}
          onKeyDown={handleKeyDown}
          className="flex-1 resize-none rounded-lg border border-input bg-bg px-3 py-1.5
                     text-sm text-text-main placeholder:text-text-mute
                     focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={handleAddComment}
          disabled={!comment.trim() || logMutation.isPending}
          className="grid h-[2.125rem] shrink-0 place-items-center rounded-lg bg-accent px-3 text-sm font-medium text-white
                     transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Send size={14} />
        </button>
      </div>
      {hint}
    </div>
  );
}
