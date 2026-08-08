// ═══════════════════════════════════════════════════════
// S-AI-VIS-2: выгрузка расшифровки файлом.
//
// Формат — Markdown, а не .txt: после вычитки Claude текст размечен репликами по
// строкам, и markdown эту разметку сохраняет.
//
// ⚠️ Скачивание — ДОПОЛНЕНИЕ к хранению, а не замена. Файл в «Загрузках» теряется
// быстрее, чем запись в CRM: ничего из БД после выгрузки не удаляется.
// ═══════════════════════════════════════════════════════

import { formatCharCount } from '@/lib/domain/transcript';

export type TranscriptExportMeta = {
  /** ISO-дата создания расшифровки. */
  createdAt: string;
  entityType: 'call' | 'meeting';
  company: string | null;
  contact: string | null;
  /** Заголовок встречи — у звонка его нет. */
  subject?: string | null;
  source: string;
  charCount: number;
};

/** Способ получения текста — человеческими словами, а не ключом из БД. */
const SOURCE_LABEL: Record<string, string> = {
  paste: 'вставлен вручную',
  audio: 'расшифровка аудио',
  file: 'загружен файлом',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

export function entityLabel(entityType: 'call' | 'meeting'): string {
  return entityType === 'call' ? 'звонок' : 'встреча';
}

/** `YYYY-MM-DD` из ISO — так дата в имени файла сортируется как текст. */
function isoDay(createdAt: string): string {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? 'без-даты' : d.toISOString().slice(0, 10);
}

/**
 * Один сегмент имени файла: запрещённые символы в дефис, схлопывание, обрезка.
 *
 * Кириллица ОСТАЁТСЯ — в именах файлов она работает во всех трёх ОС, а транслит
 * сделал бы файл нечитаемым ровно для того, кто его скачал.
 */
export function sanitizeFileSegment(raw: string, maxLength = 60): string {
  const cleaned = raw
    // Запрещённые в Windows/macOS символы и пробелы — все в дефис.
    .replace(/[/\\:*?"<>|\s]+/g, '-')
    // Кавычки в названиях компаний после замен дают двойные дефисы — схлопываем.
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  // Обрезка ПОСЛЕ схлопывания: иначе лимит съедали бы дефисы-заглушки, а дефис,
  // попавший на границу среза, дал бы хвост вида «...-Ромашка--звонок.md».
  return cleaned.slice(0, maxLength).replace(/[-.]+$/, '');
}

/**
 * Имя файла: `<дата>-<компания>-<звонок|встреча>.md`.
 *
 * Компании может не быть (звонок без привязки) — тогда её сегмент пропускается
 * целиком, а не даёт `2026-08-08--звонок.md` с двойным разделителем.
 */
export function transcriptFileName(
  meta: Pick<TranscriptExportMeta, 'createdAt' | 'company' | 'entityType'>,
): string {
  const parts = [
    isoDay(meta.createdAt),
    sanitizeFileSegment(meta.company ?? ''),
    entityLabel(meta.entityType),
  ].filter((p) => p.length > 0);
  return `${parts.join('-')}.md`;
}

/**
 * Тело файла: шапка + текст.
 *
 * Шапка нужна, чтобы файл, вынутый из «Загрузок» через полгода, объяснял себя сам.
 * Пустые поля в неё не попадают вовсе: строка «Компания: » хуже её отсутствия —
 * она читается как потерянные данные, а не как «привязки не было».
 */
export function transcriptMarkdown(meta: TranscriptExportMeta, content: string | null): string {
  const rows: string[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value != null && String(value).trim() !== '') rows.push(`- **${label}:** ${String(value).trim()}`);
  };

  add('Дата', isoDay(meta.createdAt));
  add('Тип', entityLabel(meta.entityType));
  add('Компания', meta.company);
  add('Контакт', meta.contact);
  add('Тема', meta.subject);
  add('Источник', sourceLabel(meta.source));
  add('Объём', formatCharCount(meta.charCount));

  const title = meta.company?.trim() || meta.subject?.trim() || entityLabel(meta.entityType);
  const body = (content ?? '').trim();

  return [
    `# Расшифровка — ${title}`,
    '',
    ...rows,
    '',
    '---',
    '',
    body.length > 0 ? body : '_Текст расшифровки пуст._',
    '',
  ].join('\n');
}

/**
 * Скачать расшифровку файлом.
 *
 * BOM — как в `export-csv.ts`: без него Excel и часть редакторов читают кириллицу
 * кракозябрами.
 */
export function downloadTranscript(meta: TranscriptExportMeta, content: string | null): void {
  const blob = new Blob(['\ufeff' + transcriptMarkdown(meta, content)], {
    type: 'text/markdown;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = transcriptFileName(meta);
  a.click();
  URL.revokeObjectURL(url);
}
