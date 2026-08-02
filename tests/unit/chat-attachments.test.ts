import { describe, test, expect } from 'vitest';
import {
  attachmentExtension,
  attachmentStoragePath,
  checkAttachmentBatch,
  attachmentProblemMessage,
  formatAttachmentSize,
  isImageAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from '@/lib/utils/chat-attachments';

const CONV = 'aaaaaaaa-0000-4000-8000-000000000001';
const MSG = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('attachmentExtension — расширение для КЛЮЧА, не для показа', () => {
  test('обычные случаи', () => {
    expect(attachmentExtension('smeta.xlsx')).toBe('xlsx');
    expect(attachmentExtension('SCREEN.PNG')).toBe('png');
    expect(attachmentExtension('archive.tar.gz')).toBe('gz');
  });

  test('без расширения — bin', () => {
    expect(attachmentExtension('README')).toBe('bin');
  });

  test('кириллица и пробелы в «расширении» не уезжают в ключ', () => {
    expect(attachmentExtension('договор.документ')).toBe('bin');
    expect(attachmentExtension('файл.pdf копия')).toBe('bin');
  });

  test('длинный хвост после точки — не расширение', () => {
    expect(attachmentExtension(`f.${'a'.repeat(40)}`)).toBe('bin');
  });

  test('точка в конце имени', () => {
    expect(attachmentExtension('name.')).toBe('bin');
  });
});

describe('attachmentStoragePath — ключ объекта chat-files', () => {
  test('первый сегмент — КАНАЛ (на нём стоит проверка доступа 097)', () => {
    const path = attachmentStoragePath(CONV, MSG, 'smeta.xlsx');
    expect(path.split('/')[0]).toBe(CONV);
    expect(path.split('/')[1]).toBe(MSG);
    expect(path).toMatch(
      new RegExp(`^${CONV}/${MSG}/[0-9a-f-]{36}\\.xlsx$`),
    );
  });

  test('имя пользователя в ключ не попадает НИКОГДА', () => {
    const path = attachmentStoragePath(CONV, MSG, '../../секрет проекта.pdf');
    expect(path).not.toContain('секрет');
    expect(path).not.toContain('..');
    expect(path).not.toContain(' ');
    expect(path.split('/')).toHaveLength(3);
  });

  test('два вызова подряд дают разные ключи (коллизия невозможна)', () => {
    expect(attachmentStoragePath(CONV, MSG, 'a.png')).not.toBe(
      attachmentStoragePath(CONV, MSG, 'a.png'),
    );
  });
});

describe('checkAttachmentBatch — партия целиком, частичной отправки нет', () => {
  const file = (name: string, size: number) => ({ name, size });

  test('пустая партия и партия в пределах лимитов проходят', () => {
    expect(checkAttachmentBatch([])).toBeNull();
    expect(checkAttachmentBatch([file('a.png', 1024), file('b.pdf', 2048)])).toBeNull();
  });

  test('файлов больше лимита — отказ всей партии', () => {
    const many = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, (_, i) =>
      file(`f${i}.png`, 10),
    );
    expect(checkAttachmentBatch(many)).toEqual({
      kind: 'too_many',
      limit: MAX_ATTACHMENTS_PER_MESSAGE,
    });
  });

  test('ровно на лимите — проходит', () => {
    const exact = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE }, (_, i) =>
      file(`f${i}.png`, 10),
    );
    expect(checkAttachmentBatch(exact)).toBeNull();
  });

  test('один тяжёлый файл роняет партию и называет себя', () => {
    const problem = checkAttachmentBatch([
      file('ok.png', 10),
      file('огромный.mov', MAX_ATTACHMENT_BYTES + 1),
    ]);
    expect(problem).toEqual({
      kind: 'too_large',
      fileName: 'огромный.mov',
      size: MAX_ATTACHMENT_BYTES + 1,
    });
    expect(attachmentProblemMessage(problem!)).toContain('огромный.mov');
  });

  test('ровно 25 МБ — проходит (граница бакета включительно)', () => {
    expect(checkAttachmentBatch([file('edge.bin', MAX_ATTACHMENT_BYTES)])).toBeNull();
  });
});

describe('isImageAttachment / formatAttachmentSize', () => {
  test('превью только у image/*', () => {
    expect(isImageAttachment({ mime_type: 'image/png' })).toBe(true);
    expect(isImageAttachment({ mime_type: 'image/svg+xml' })).toBe(true);
    expect(isImageAttachment({ mime_type: 'application/pdf' })).toBe(false);
    expect(isImageAttachment({ mime_type: null })).toBe(false);
  });

  test('размер: null и 0 — прочерк, не «0 B»', () => {
    expect(formatAttachmentSize(null)).toBe('—');
    expect(formatAttachmentSize(0)).toBe('—');
    expect(formatAttachmentSize(512)).toBe('512 B');
    expect(formatAttachmentSize(2048)).toBe('2.0 KB');
    expect(formatAttachmentSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
