'use client';

import { useRef, useState, type ReactNode } from 'react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { toast } from 'sonner';
import { TranscribeDropzone } from '@/components/ai/TranscribeDropzone';
import { stripSubtitleMarkup } from '@/lib/domain/transcript';
import type { TranscriptSource } from '@/lib/hooks/use-ai-run';

// ═══════════════════════════════════════════════════════
// S-TR-CREATE-1: один ввод текста расшифровки на два места — панель AI внутри
// звонка/встречи (`AiRunPanel`) и мастер создания (`TranscriptCreateModal`).
//
// Извлечено из `AiRunPanel`, а не скопировано: до извлечения переключатель
// «Вставить/Аудио», textarea со счётчиком и `TranscribeDropzone` были зашиты
// внутрь панели, и второе место ввода означало бы вторую копию правил
// («после расшифровки вернуть человека к полю», «источник помечаем честно»).
// ═══════════════════════════════════════════════════════

type Mode = 'paste' | 'audio' | 'file';

/**
 * Текстовые файлы, из которых имеет смысл брать расшифровку. Аудио сюда НЕ входит —
 * его путь другой (вкладка «Аудио» → edge `transcribe`), и попытка прочитать mp3
 * как текст дала бы поле с мусором.
 */
const TEXT_FILE_ACCEPT = '.txt,.md,.vtt,.srt,text/plain,text/markdown';

/** Больше — это уже не расшифровка разговора, а промах с файлом. */
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

interface TranscriptInputProps {
  text: string;
  /** Ручная правка в поле. Источник при этом НЕ меняется — см. комментарий в AiRunPanel. */
  onTextChange: (text: string) => void;
  /** Откуда текст сейчас — рисуем подпись «расшифровка аудио» / «из файла». */
  source: TranscriptSource;
  /**
   * Расшифровка готова. Второй аргумент — вычитан ли текст целиком (частичный
   * результат тоже приходит: за распознавание уже заплачено).
   */
  onTranscribed?: (text: string, complete: boolean) => void;
  /** Текст прочитан из файла (вкладка «Файл»). */
  onFileLoaded?: (text: string, fileName: string) => void;
  /**
   * Показывать вкладку «Аудио». У сделки и компании транскрипта не бывает
   * (`transcripts.entity_type` — call|meeting), и предлагать там расшифровку
   * значило бы вести в тупик.
   */
  withAudio?: boolean;
  /** Показывать вкладку «Файл». */
  withFile?: boolean;
  rows?: number;
  minHeight?: string;
  placeholder?: string;
  /** Строка под полем — факт сохранения и прочее, что знает только вызывающий. */
  footer?: ReactNode;
  /**
   * Вкладка сменилась. Нужен тем, у кого от неё зависит что-то ЗА пределами
   * компонента (в `AiRunPanel` — подсказка под кнопками пресетов: во время
   * расшифровки она читается как «ничего не происходит»). Вкладку по-прежнему
   * ведёт компонент — это уведомление, а не управление.
   */
  onModeChange?: (mode: 'paste' | 'audio' | 'file') => void;
}

/** Подпись к счётчику символов: чем этот текст является. */
function sourceHint(source: TranscriptSource): string | null {
  if (source === 'audio') return 'расшифровка аудио';
  if (source === 'file') return 'из файла';
  return null;
}

export function TranscriptInput({
  text,
  onTextChange,
  source,
  onTranscribed,
  onFileLoaded,
  withAudio = true,
  withFile = false,
  rows = 4,
  minHeight = '80px',
  placeholder = 'Вставьте транскрипт разговора…',
  footer,
  onModeChange,
}: TranscriptInputProps) {
  const [mode, setModeState] = useState<Mode>('paste');

  const setMode = (next: Mode) => {
    setModeState(next);
    onModeChange?.(next);
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tabs: [Mode, string][] = [
    ['paste', 'Вставить'],
    ...(withAudio ? ([['audio', 'Аудио']] as [Mode, string][]) : []),
    ...(withFile ? ([['file', 'Файл']] as [Mode, string][]) : []),
  ];

  /**
   * Расшифровка готова — возвращаем человека к полю, где он вычитает её глазами.
   * Автозапуска прогона нет намеренно; переключение вкладки живёт здесь, чтобы
   * оба вызывающих не повторяли это правило каждый у себя.
   */
  const handleTranscribed = (result: string, complete: boolean) => {
    setMode('paste');
    onTranscribed?.(result, complete);
  };

  const handleFilePicked = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_TEXT_FILE_BYTES) {
      toast.error('Файл больше 2 МБ — это вряд ли расшифровка разговора');
      return;
    }
    try {
      const content = await file.text();
      if (content.trim() === '') {
        toast.error('Файл пуст — брать из него нечего');
        return;
      }
      // Субтитровую разметку снимаем ЗДЕСЬ, а не у вызывающего: вкладку «Файл»
      // получают все, кто передал `withFile`, и правило чистки должно быть одно.
      // Обычный текст функция возвращает байт в байт (см. `stripSubtitleMarkup`).
      const cleaned = stripSubtitleMarkup(content);
      if (cleaned.trim() === '') {
        toast.error('В файле только таймкоды — речи в нём нет');
        return;
      }
      if (cleaned !== content) {
        toast.success('Разметка субтитров снята — в транскрипт легла только речь');
      }
      setMode('paste');
      onFileLoaded?.(cleaned, file.name);
    } catch {
      toast.error('Не удалось прочитать файл');
    } finally {
      // Тот же файл повторно не выстрелит без сброса значения input'а.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const hint = sourceHint(source);

  return (
    <div>
      {tabs.length > 1 && (
        <SegmentedControl
          className="mb-2"
          ariaLabel="Способ ввода расшифровки"
          options={tabs.map(([value, label]) => ({ value, label }))}
          value={mode}
          onChange={setMode}
        />
      )}

      {/* Режимы — альтернативы: поле показываем только во «Вставить», чтобы не было
          двух мест ввода одного текста одновременно. */}
      {withAudio && mode === 'audio' ? (
        <TranscribeDropzone onResult={handleTranscribed} />
      ) : withFile && mode === 'file' ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-4 text-center">
          <p className="text-xs text-text-dim">
            Текстовый файл расшифровки — .txt, .md, .vtt, .srt
          </p>
          <p className="mt-0.5 text-meta text-text-mute">
            Аудио — на вкладке «Аудио»: этот путь только читает готовый текст.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={TEXT_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => void handleFilePicked(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-main hover:bg-surface-hover"
          >
            Выбрать файл
          </button>
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            style={{ resize: 'vertical', minHeight }}
          />
          <div className="mt-1 flex items-center justify-end gap-2 text-meta text-text-mute">
            {hint && <span className="text-accent">{hint}</span>}
            <span>{text.length.toLocaleString('ru')} симв.</span>
          </div>
          {footer}
        </>
      )}
    </div>
  );
}
