import { describe, it, expect } from 'vitest';
import { captureResultSchema } from '@/lib/validators/capture';

// Гейт S-QUICK-CAPTURE-1: живой haiku возвращает СТРОКУ "null" для пустой ветки
// (2 из 3 смок-прогонов). Контракт обязан переживать это молча.
describe('captureResultSchema — ветки-заглушки от модели', () => {
  const contact = {
    first_name: 'Пётр', last_name: 'Иванов', position: '',
    email: '', phone: '', notes: '',
  };

  it('строка "null" в пустой ветке становится null', () => {
    const r = captureResultSchema.safeParse({ intent: 'contact', contact, company: 'null' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.company).toBeNull();
  });

  it('настоящий null и отсутствующий ключ тоже проходят', () => {
    expect(captureResultSchema.safeParse({ intent: 'contact', contact, company: null }).success).toBe(true);
    expect(captureResultSchema.safeParse({ intent: 'contact', contact }).success).toBe(true);
  });

  it('прочий мусор в ветке по-прежнему отбивается', () => {
    expect(captureResultSchema.safeParse({ intent: 'contact', contact, company: 42 }).success).toBe(false);
    expect(captureResultSchema.safeParse({ intent: 'contact', contact, company: 'ООО Ромашка' }).success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// S-CONTACT-COMPANY — `company_hint` в ветке контакта.
//
// Поле аддитивное, и это не формальность: `ai-capture` деплоится ОТДЕЛЬНО от
// фронта, порядок деплоев не гарантирован ни в одну сторону. Ответ старой версии
// функции (без ключа) обязан разбираться ровно как раньше.
// ═══════════════════════════════════════════════════════

describe('captureResultSchema — место работы контакта', () => {
  const base = { first_name: 'Андрей', last_name: '', position: 'коммерческий директор',
    email: '', phone: '89113435345', notes: '' };

  it('цитата доезжает до разобранного результата', () => {
    const r = captureResultSchema.safeParse({
      intent: 'contact',
      contact: { ...base, company_hint: 'агрохолод' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contact?.company_hint).toBe('агрохолод');
  });

  it('ответ ПРЕЖНЕЙ версии функции (ключа нет) разбирается как раньше', () => {
    const r = captureResultSchema.safeParse({ intent: 'contact', contact: base });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contact?.company_hint).toBe('');
      expect(r.data.contact?.notes).toBe('');
      expect(r.data.contact?.first_name).toBe('Андрей');
    }
  });

  it('поле остаётся ЦИТАТОЙ — предлог из речи не отрезается', () => {
    const r = captureResultSchema.safeParse({
      intent: 'contact',
      contact: { ...base, company_hint: 'из Тандера' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contact?.company_hint).toBe('из Тандера');
  });
});
