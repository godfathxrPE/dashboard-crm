import { describe, it, expect } from 'vitest';
import {
  transcriptFileName,
  transcriptMarkdown,
  sanitizeFileSegment,
  type TranscriptExportMeta,
} from '@/lib/utils/transcript-export';
import { textPreview } from '@/lib/domain/transcript';

// S-AI-VIS-2. Выгрузка расшифровки файлом и превью текста в списке — чистые
// функции, поэтому проверяются без Supabase и без DOM.

const meta = (over: Partial<TranscriptExportMeta> = {}): TranscriptExportMeta => ({
  createdAt: '2026-08-08T09:05:00Z',
  entityType: 'call',
  company: 'Ориент продактс',
  contact: 'Дмитрий Лапин',
  subject: null,
  source: 'audio',
  charCount: 12_431,
  ...over,
});

describe('sanitizeFileSegment', () => {
  it('кириллица сохраняется', () => {
    expect(sanitizeFileSegment('Ориент продактс')).toBe('Ориент-продактс');
  });

  it('запрещённые в файловой системе символы заменяются', () => {
    expect(sanitizeFileSegment('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('кавычки в названии не дают двойных разделителей', () => {
    expect(sanitizeFileSegment('ООО "Ромашка"')).toBe('ООО-Ромашка');
  });

  it('длина ограничена и хвостовой дефис среза убирается', () => {
    const long = 'а'.repeat(40) + ' ' + 'б'.repeat(40);
    const out = sanitizeFileSegment(long, 41);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith('-')).toBe(false);
  });

  it('пустая строка остаётся пустой, а не превращается в дефис', () => {
    expect(sanitizeFileSegment('   ')).toBe('');
  });
});

describe('transcriptFileName', () => {
  it('дата, компания и тип — через дефис, расширение .md', () => {
    expect(transcriptFileName(meta())).toBe('2026-08-08-Ориент-продактс-звонок.md');
  });

  it('встреча называется встречей', () => {
    expect(transcriptFileName(meta({ entityType: 'meeting' }))).toBe('2026-08-08-Ориент-продактс-встреча.md');
  });

  it('без компании двойного разделителя не появляется', () => {
    expect(transcriptFileName(meta({ company: null }))).toBe('2026-08-08-звонок.md');
    expect(transcriptFileName(meta({ company: '   ' }))).toBe('2026-08-08-звонок.md');
  });

  it('битая дата не даёт «Invalid Date» в имени', () => {
    expect(transcriptFileName(meta({ createdAt: 'не дата', company: null }))).toBe('без-даты-звонок.md');
  });
});

describe('transcriptMarkdown', () => {
  it('шапка содержит дату, компанию и объём', () => {
    const md = transcriptMarkdown(meta(), 'Здравствуйте.');
    expect(md).toContain('- **Дата:** 2026-08-08');
    expect(md).toContain('- **Компания:** Ориент продактс');
    expect(md).toContain('- **Объём:** 12 тыс. знаков');
    expect(md).toContain('Здравствуйте.');
  });

  it('источник переведён на человеческий язык', () => {
    expect(transcriptMarkdown(meta(), 'x')).toContain('- **Источник:** расшифровка аудио');
  });

  it('пустые поля не дают строк вида «Компания: »', () => {
    const md = transcriptMarkdown(meta({ company: null, contact: '   ', subject: null }), 'текст');
    expect(md).not.toContain('**Компания:**');
    expect(md).not.toContain('**Контакт:**');
    expect(md).not.toContain('**Тема:**');
  });

  it('пустой текст помечается явно, а не даёт голую шапку', () => {
    expect(transcriptMarkdown(meta(), null)).toContain('_Текст расшифровки пуст._');
    expect(transcriptMarkdown(meta(), '   ')).toContain('_Текст расшифровки пуст._');
  });

  it('заголовок берёт тему встречи, когда компании нет', () => {
    const md = transcriptMarkdown(meta({ company: null, entityType: 'meeting', subject: 'Демо WMS' }), 'x');
    expect(md.startsWith('# Расшифровка — Демо WMS')).toBe(true);
  });
});

describe('textPreview', () => {
  it('текст короче лимита не трогается и многоточия не получает', () => {
    expect(textPreview('Короткая реплика', 120)).toBe('Короткая реплика');
  });

  it('обрезка идёт по границе слова, а не по середине', () => {
    const preview = textPreview('раз два три четыре пять шесть', 12);
    expect(preview).toBe('раз два три…');
    expect(preview).not.toContain('четы');
  });

  it('переводы строк схлопываются — реплики не ломают строку таблицы', () => {
    expect(textPreview('Олег:\nДобрый день.\n\nДарья:\nЗдравствуйте.', 120))
      .toBe('Олег: Добрый день. Дарья: Здравствуйте.');
  });

  it('слово длиннее лимита режется по символам, а не даёт пустую строку', () => {
    expect(textPreview('а'.repeat(50), 10)).toBe('а'.repeat(10) + '…');
  });

  it('пустой и отсутствующий текст дают пустую строку, а не «undefined»', () => {
    expect(textPreview('', 120)).toBe('');
    expect(textPreview(null, 120)).toBe('');
    expect(textPreview(undefined, 120)).toBe('');
  });
});
