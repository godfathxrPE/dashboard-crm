'use client';

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Bold, Heading, Italic, Link2, List, ListOrdered, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { htmlToMarkdown } from '@/lib/text/html-to-markdown';
import {
  insertAt,
  insertLink,
  toggleLinePrefix,
  wrapSelection,
  type EditResult,
} from '@/lib/text/md-commands';

// ═══════════════════════════════════════════════════════
// S-NOTES-2.2: многострочное поле с панелью markdown — один компонент на композер
// ленты, правку заметки на месте и правку «Сути сделки» (без панели).
//
// Не WYSIWYG: в поле видна разметка (`**жирный**`), кнопки и горячие клавиши её
// вставляют. Формат хранения — markdown-текст, поэтому редактор можно будет заменить
// на WYSIWYG без миграции данных. Логика команд — чистые функции в `md-commands.ts`;
// компонент применяет результат и возвращает выделение в поле.
// ═══════════════════════════════════════════════════════

/**
 * Подпись клавиши-модификатора для подсказок. Определяется в эффекте, а не при рендере:
 * на сервере `navigator` нет, и расхождение серверной и клиентской разметки дало бы
 * ошибку гидратации. До эффекта — «Ctrl», безопасный дефолт.
 */
export function useModKeyLabel(): string {
  const [label, setLabel] = useState('Ctrl');
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
    if (/mac|iphone|ipad/i.test(platform)) setLabel('⌘');
  }, []);
  return label;
}

const parseHtml = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

type CommandId = 'bold' | 'italic' | 'heading' | 'ul' | 'ol' | 'link';

interface ToolButton {
  id: CommandId;
  label: string;
  /** Горячая клавиша (после ⌘/Ctrl) — для подсказки в `title`. */
  hotkey?: string;
  icon: LucideIcon;
  /** Разделитель ПЕРЕД кнопкой (как в макете). */
  sepBefore?: boolean;
}

const TOOLS: ToolButton[] = [
  { id: 'bold', label: 'Жирный', hotkey: 'B', icon: Bold },
  { id: 'italic', label: 'Курсив', hotkey: 'I', icon: Italic },
  { id: 'heading', label: 'Заголовок', icon: Heading },
  { id: 'ul', label: 'Список', icon: List, sepBefore: true },
  { id: 'ol', label: 'Нумерованный список', icon: ListOrdered },
  { id: 'link', label: 'Ссылка', hotkey: 'K', icon: Link2 },
];

function runCommand(id: CommandId, value: string, start: number, end: number): EditResult {
  switch (id) {
    case 'bold':
      return wrapSelection(value, start, end, '**');
    case 'italic':
      return wrapSelection(value, start, end, '*');
    case 'heading':
      return toggleLinePrefix(value, start, end, '## ');
    case 'ul':
      return toggleLinePrefix(value, start, end, '- ');
    case 'ol':
      return toggleLinePrefix(value, start, end, '1. ');
    case 'link':
      return insertLink(value, start, end);
  }
}

const HOTKEY_COMMAND: Record<string, CommandId> = { KeyB: 'bold', KeyI: 'italic', KeyK: 'link' };

/** Не разрезать суррогатную пару (эмодзи) границей замены. */
function safeBoundary(s: string, i: number): number {
  if (i > 0 && i < s.length) {
    const c = s.charCodeAt(i - 1);
    if (c >= 0xd800 && c <= 0xdbff) return i - 1;
  }
  return i;
}

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** ⌘/Ctrl+Enter. */
  onSubmit?: () => void;
  /** Esc. */
  onCancel?: () => void;
  placeholder?: string;
  /** Панель кнопок. Дефолт — есть. */
  toolbar?: boolean;
  maxLength?: number;
  /** Фокус при монтировании, курсор — в конец текста. */
  autoFocus?: boolean;
  'aria-label': string;
  /** Моноширинный шрифт — в режиме правки заметки, где разметка видна. */
  mono?: boolean;
  /** Потолок автовысоты в строках; выше — прокрутка. */
  maxRows?: number;
  /** Содержимое справа от поля, прижатое к низу (кнопка «Отправить»). */
  actions?: ReactNode;
  className?: string;
  /** Классы самого поля (отступы, шрифт). */
  fieldClassName?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  toolbar = true,
  maxLength,
  autoFocus = false,
  'aria-label': ariaLabel,
  mono = false,
  maxRows = 12,
  actions,
  className,
  fieldClassName,
}: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const mod = useModKeyLabel();
  /** Выделение, которое надо вернуть в поле после следующего рендера (запасной путь). */
  const pendingSel = useRef<{ start: number; end: number } | null>(null);

  // Поле растёт вместе с текстом и схлопывается после отправки: эффект зависит от
  // `value`, поэтому сброс в '' проходит тем же путём, что набор.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = getComputedStyle(el);
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const max = lineHeight * maxRows + padding + border;
    // scrollHeight границу не включает, а `box-sizing: border-box` её требует.
    const want = el.scrollHeight + border;
    el.style.height = `${Math.min(want, max)}px`;
    el.style.overflowY = want > max ? 'auto' : 'hidden';
  }, [value, maxRows]);

  useLayoutEffect(() => {
    const el = ref.current;
    const sel = pendingSel.current;
    if (!el || !sel) return;
    pendingSel.current = null;
    el.setSelectionRange(sel.start, sel.end);
  }, [value]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // Только при монтировании: повторный фокус на каждом рендере отнял бы его у кнопок.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Применяет результат команды. Сначала через `execCommand('insertText')`: браузер
   * кладёт правку в свой стек отмены, и ⌘Z откатывает «жирный» одним шагом. Там, где
   * команды нет (jsdom) или она отказала, — обычная запись в состояние.
   */
  function apply(next: EditResult): void {
    const el = ref.current;
    if (!el) return;
    if (next.value === el.value) {
      el.setSelectionRange(next.start, next.end);
      return;
    }
    // Правка длиннее потолка поля молча не применяется: textarea её тоже не пропустил бы.
    if (maxLength !== undefined && next.value.length > maxLength && next.value.length > el.value.length) {
      return;
    }
    const prev = el.value;
    let p = 0;
    const lim = Math.min(prev.length, next.value.length);
    while (p < lim && prev[p] === next.value[p]) p++;
    let s = 0;
    while (s < lim - p && prev[prev.length - 1 - s] === next.value[next.value.length - 1 - s]) s++;
    p = safeBoundary(prev, p);
    const prevEnd = safeBoundary(prev, prev.length - s);
    const inserted = next.value.slice(p, next.value.length - (prev.length - prevEnd));

    el.focus();
    el.setSelectionRange(p, prevEnd);
    const done =
      typeof document.execCommand === 'function' &&
      (inserted === '' ? document.execCommand('delete') : document.execCommand('insertText', false, inserted));
    if (done && el.value === next.value) {
      el.setSelectionRange(next.start, next.end);
      return;
    }
    // Запасной путь: execCommand мог частично сработать, поэтому пишем итог целиком.
    pendingSel.current = { start: next.start, end: next.end };
    onChange(next.value);
  }

  function command(id: CommandId): void {
    const el = ref.current;
    if (!el) return;
    apply(runCommand(id, el.value, el.selectionStart, el.selectionEnd));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    const accel = e.metaKey || e.ctrlKey;
    if (e.key === 'Enter' && accel) {
      if (!onSubmit) return;
      e.preventDefault();
      onSubmit();
      return;
    }
    if (e.key === 'Escape') {
      if (!onCancel) return;
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (!toolbar || !accel || e.altKey || e.shiftKey) return;
    // По `code`, а не `key`: на русской раскладке ⌘B даёт key «и».
    const id =
      HOTKEY_COMMAND[e.code] ??
      ({ b: 'bold', i: 'italic', k: 'link' } as Record<string, CommandId>)[e.key.toLowerCase()];
    if (!id) return;
    e.preventDefault();
    command(id);
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>): void {
    const data = e.clipboardData;
    if (!data || !Array.from(data.types).includes('text/html')) return;
    const md = htmlToMarkdown(data.getData('text/html'), parseHtml);
    // В буфере HTML без текста (картинка, пустая обёртка): пусть вставит браузер.
    if (md === '') return;
    e.preventDefault();
    const el = e.currentTarget;
    let text = md;
    if (maxLength !== undefined) {
      const room = maxLength - (el.value.length - (el.selectionEnd - el.selectionStart));
      if (room <= 0) return;
      if (text.length > room) text = text.slice(0, safeBoundary(text, room));
    }
    apply(insertAt(el.value, el.selectionStart, el.selectionEnd, text));
  }

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {toolbar && <Toolbar mod={mod} onCommand={command} />}
      <div className="flex min-w-0 items-end gap-2.5">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          aria-label={ariaLabel}
          maxLength={maxLength}
          rows={1}
          className={cn(
            'min-w-0 flex-1 resize-none bg-transparent text-body leading-relaxed text-text-main',
            'placeholder:text-text-mute focus:outline-none',
            mono && 'font-mono',
            fieldClassName,
          )}
        />
        {actions}
      </div>
    </div>
  );
}

/**
 * Панель — один пункт Tab (roving tabindex), стрелки двигают по кнопкам; следующий Tab
 * уходит в поле. Кнопки не забирают фокус у поля (`mousedown` гасится), чтобы выделение
 * не терялось до применения команды.
 */
function Toolbar({ mod, onCommand }: { mod: string; onCommand: (id: CommandId) => void }) {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function move(to: number): void {
    const i = (to + TOOLS.length) % TOOLS.length;
    setActive(i);
    refs.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'ArrowRight') move(active + 1);
    else if (e.key === 'ArrowLeft') move(active - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(TOOLS.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div
      role="toolbar"
      aria-label="Форматирование"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="mb-1 flex items-center gap-0.5 text-text-dim"
    >
      {TOOLS.map((t, i) => (
        <Fragment key={t.id}>
          {t.sepBefore && <span aria-hidden className="mx-1 h-4 w-px bg-border" />}
          <button
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            tabIndex={i === active ? 0 : -1}
            aria-label={t.label}
            title={t.hotkey ? `${t.label} · ${mod}${t.hotkey}` : t.label}
            onMouseDown={(e) => e.preventDefault()}
            onFocus={() => setActive(i)}
            onClick={() => onCommand(t.id)}
            className="grid size-7 place-items-center rounded-lg transition-colors hover:bg-surface2
                       hover:text-text-main"
          >
            <t.icon size={14} strokeWidth={2.2} aria-hidden />
          </button>
        </Fragment>
      ))}
    </div>
  );
}
