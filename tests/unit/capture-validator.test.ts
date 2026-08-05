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
