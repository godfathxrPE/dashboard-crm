import { z } from 'zod';
import { phoneEntrySchema } from './phone';
import { isValidInn } from '@/lib/utils/inn';

export const companyFormSchema = z.object({
  name: z.string().min(1, 'Введи название компании'),
  // S-INN-1: формат добивается ЗДЕСЬ, а не CHECK'ом в БД. В проде живут 4 записи с
  // ИНН не по формату (белорусский УНП, коды из выгрузки) — CHECK сделал бы их
  // карточки нередактируемыми целиком. Клиентский refine не пускает новый мусор,
  // но не мешает поправить телефон у legacy-строки: он срабатывает только когда
  // поле трогают. Пустое — валидно, ИНН необязателен.
  inn: z.string().nullable().default(null)
    .refine(isValidInn, 'ИНН — 10 цифр (юрлицо) или 12 (ИП)'),
  industry: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
  // legacy primary-зеркало массива phones (backward-compat: дедуп/списки)
  phone: z.string().nullable().default(null),
  phones: z.array(phoneEntrySchema).default([]),
  email: z.string().email('Некорректный email').nullable().default(null),
  address: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  owner_id: z.string().uuid().nullable().optional(),

  // ═══ S-INN-1 (102): юрреквизиты из ЕГРЮЛ ═══
  // Все nullable и без валидации формата: значения приходят из реестра как есть,
  // руками их правят редко. `legal_name` и `legal_address` живут ОТДЕЛЬНО от
  // `name`/`address` — данные ЕГРЮЛ не имеют права затирать рабочее имя и
  // фактический адрес (инвариант фичи, см. шапку миграции 102).
  kpp: z.string().nullable().default(null),
  ogrn: z.string().nullable().default(null),
  legal_name: z.string().nullable().default(null),
  legal_address: z.string().nullable().default(null),
  inn_status: z.string().nullable().default(null),
  // Проставляется кодом при успешном lookup, не пользователем.
  inn_verified_at: z.string().nullable().default(null),

  // ═══ S-OKVED-1 (103): код ОКВЭД ═══
  // В форме поля нет: это служебный код реестра, руками его не вводят. Живёт в схеме,
  // чтобы `setValue('okved', …)` после lookup доехал до `onSubmit`, а на карточке
  // компании было что показать. Отрасль из кода выводится справочником и уходит в
  // `industry` — код в поле «Отрасль» не пишется никогда (инвариант спринта).
  okved: z.string().nullable().default(null),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;
