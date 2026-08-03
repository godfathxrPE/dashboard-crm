# Claude Code Prompt — S-INN-1: автозаполнение реквизитов компании по ИНН

Фича: пользователь вводит ИНН в форме компании → юрданные (название, юрадрес, КПП,
ОГРН, статус юрлица) подтягиваются автоматически через DaData «Подсказки».

Разведка гейта (2026-08-03, живая БД): `companies.inn` уже существует (text, nullable),
поле уже в `CompanyModal` (строка ~109). Данные чистые: 224/260 компаний с ИНН,
**0 дублей** в разрезе `(org_id, inn)`, 4 записи с форматом не `\d{10}|\d{12}` —
их НЕ чинить автоматически, см. Задачу 5.

**Провайдер: DaData API «Подсказки», метод `findById/party`.** Российский сервис,
Regional Availability: VERIFIED. Бесплатный тариф — 10k запросов/день, хватает с
запасом. Ключ уже создан Олегом и лежит секретом Edge Functions под именем
`DADATA_API_KEY` (если секрета нет — остановиться и написать в отчёте, не хардкодить
и не выдумывать ключ).

---

## РАЗВЕДКА

```bash
# 1. Следующий номер миграции — запросом к schema_migrations (правило CLAUDE.md п.4),
#    НЕ из папки и НЕ из этого файла. Ожидание: последняя 101 → свободна 102.
ls supabase/migrations/ | grep -E '^[0-9]{3}_' | sort | tail -2

# 2. Текущие поля companies в типах
grep -n "inn\|kpp\|ogrn\|legal" src/types/supabase.gen.ts | head -5

# 3. Как устроены существующие edge-функции (CORS, auth, структура ответа)
sed -n '1,60p' supabase/functions/ai-summarize/index.ts

# 4. Форма и валидатор
grep -n "inn" src/components/companies/CompanyModal.tsx src/lib/validators/company.ts

# 5. Где рендерятся реквизиты на карточке
grep -n "ИНН\|inn" src/components/companies/CompanyDetail.tsx
```

---

## ЗАДАЧА 1 — миграция 102: юрполя + уникальность ИНН

Файл `supabase/migrations/102_company_legal_fields.sql` (номер сверить разведкой п.1).
Шапка в стиле проекта: ЗАЧЕМ → ЧТО ЗДЕСЬ → ⚠️ → Откат. В шапке писать «Применяет гейт»
(без слова «НЕ применена» — конвенция с этого спринта: статус живёт в `docs/schema.md`,
файл миграции статуса не носит).

```sql
alter table public.companies
  add column if not exists kpp           text,
  add column if not exists ogrn          text,
  add column if not exists legal_name    text,
  add column if not exists legal_address text,
  add column if not exists inn_status    text,   -- ACTIVE | LIQUIDATING | LIQUIDATED | …
  add column if not exists inn_verified_at timestamptz;
```

- `legal_name` отдельно от `name`: `name` — рабочее имя («Ориент»), юрназвание
  («ООО "ОРИЕНТ-ПРО"») его не затирает. Это инвариант всей фичи.
- `inn_verified_at` — когда данные в последний раз подтянуты из DaData; UI показывает
  «сверено с ЕГРЮЛ <дата>».
- Partial unique — ИНН уникален в организации:

```sql
create unique index if not exists uq_companies_org_inn
  on public.companies (org_id, inn)
  where inn is not null and inn <> '';
```

Дублей в проде 0 (сверено гейтом) — индекс ляжет чисто. RLS не трогаем: колонки в уже
защищённой таблице. ⚠️ В шапке отметить: 4 существующих записи с невалидным форматом
ИНН индексу не мешают (они не дублируются), формат добивает валидатор на клиенте, БД
формат намеренно не проверяет — legacy-данные не должны ломать UPDATE несвязанных полей.

**Типы:** колонки новые ⇒ нужен реген. По конвенции проекта CC реген не делает — завести
стаб-интерсекцию в `src/types/database.ts` по образцу `TaskSourceMessageStub` (099),
снятие стаба — работа гейта.

---

## ЗАДАЧА 2 — Edge Function `company-lookup`

`supabase/functions/company-lookup/index.ts`. Чистый прокси к DaData, **без записи в БД**
— функция возвращает данные, а сохраняет их пользователь обычным путём через RLS.
Поэтому `service_role` здесь не нужен вовсе.

- `verify_jwt: true` (как у `ai-run`/`ai-summarize`) — анониму функция недоступна.
- Вход: `{ inn: string }`. Серверная валидация: `/^\d{10}$|^\d{12}$/`, иначе 400 с
  внятным сообщением (не слать мусор в DaData).
- Запрос: `POST https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party`,
  заголовок `Authorization: Token ${Deno.env.get('DADATA_API_KEY')}`, тело
  `{ query: inn, branch_type: 'MAIN' }`.
- Ответ DaData типизировать как `unknown` + сужение (правило проекта: `any` запрещён,
  внешний payload — только через narrowing). Наружу отдавать нормализованный объект:

```ts
interface CompanyLookupResult {
  found: boolean;
  legal_name: string | null;      // data.name.full_with_opf
  short_name: string | null;      // data.name.short_with_opf — предложить в `name`, если пусто
  kpp: string | null;
  ogrn: string | null;
  legal_address: string | null;   // data.address.unrestricted_value
  status: string | null;          // data.state.status
  management_name: string | null; // data.management.name — руководитель, для подсказки контакта
}
```

- Ошибки DaData (сеть, 403 по ключу, лимит) → 502 с `{ error: 'lookup_failed' }`;
  текст ошибки провайдера в клиента не протаскивать, писать в `console.error` функции.
- CORS и структура ответа — по образцу `ai-summarize` (разведка п.3).

⚠️ Деплой функции CC не делает — как и миграции, это операция гейта. Файл написать
и закоммитить.

---

## ЗАДАЧА 3 — клиент: кнопка «Заполнить по ИНН» в CompanyModal

Хук `useCompanyLookup` (новый, `src/lib/hooks/use-company-lookup.ts`):
`supabase.functions.invoke('company-lookup', { body: { inn } })`, `useMutation`, без кэша.

В `CompanyModal` рядом с полем ИНН — кнопка «Заполнить» (иконка + текст), активна когда
в поле валидный ИНН (10/12 цифр). Поведение:

- по клику — лоадер на кнопке, запрос;
- `found: false` → тост «Компания с таким ИНН не найдена в ЕГРЮЛ», форму не трогать;
- успех → заполнить `legal_name`, `kpp`, `ogrn`, `legal_address` (== `address`? НЕТ:
  юрадрес идёт в новое поле `legal_address`, фактический `address` не трогаем);
  `name` заполнить `short_name` **только если поле пустое** — введённое руками не
  затирать; проставить `inn_status`;
- статус не `ACTIVE` → жёлтая строка под полем: «Юрлицо в статусе ликвидации/
  ликвидировано» — для пресейла это прямой риск-сигнал;
- `inn_verified_at` проставляется при сохранении формы, если lookup был выполнен.

Валидатор `company.ts`: `inn` — refine на `/^\d{10}$|^\d{12}$/` (пустое — можно),
новые поля добавить в схему как nullable. Обработать 23505 от `uq_companies_org_inn`
в мутации сохранения: «Компания с таким ИНН уже есть» + название существующей, если
дешёво достать.

⚠️ Дизайн-инвариант: автозаполнение **предлагает, не перезаписывает молча**. Всё, что
пришло из DaData, видно в полях формы до нажатия «Сохранить» — пользователь остаётся
последней инстанцией.

---

## ЗАДАЧА 4 — CompanyDetail: блок реквизитов

На карточке компании (разведка п.5, сейчас там строки «Адрес» и «ИНН») — расширить до
блока: ИНН, КПП, ОГРН, юрназвание, юрадрес, статус юрлица (не-ACTIVE — с жёлтым
бейджем), строка «сверено с ЕГРЮЛ <дата>» из `inn_verified_at`. Пустые поля не
рендерить (паттерн уже в компоненте). Кнопка «Обновить из ЕГРЮЛ» — тот же
`useCompanyLookup` + сохранение, права по существующей политике UPDATE.

---

## ЗАДАЧА 5 — отчёт по грязным ИНН (не чинить!)

4 записи с ИНН не по формату. В отчёте спринта вывести их списком
(`select id, name, inn from companies where inn !~ '^\d{10}(\d{2})?$' and inn is not null and inn <> ''`
— через read-only MCP). Править данные — решение Олега, не CC.

---

## ЧЕГО НЕ ДЕЛАТЬ

- Не применять миграцию, не деплоить функцию, не трогать секреты — всё это гейт.
- Не хардкодить ключ DaData нигде, включая тесты (в тестах — мок ответа).
- Не затирать `name` и `address` данными из ЕГРЮЛ.
- Не заводить массовое обогащение всех 224 компаний одним заходом — это отдельное
  решение с лимитами API, записать остатком.
- Генерённые типы руками не править — только стаб по конвенции 099.

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npx eslint src supabase/functions/company-lookup --max-warnings=0 2>&1 | tail -10
grep -n "DADATA_API_KEY" -r supabase/functions/ src/   # ключ только через Deno.env.get
npm test 2>&1 | tail -10
```

`npm run build` — последним, не при живом `next dev`.

## КОММИТ

```bash
git add .
git commit -m "S-INN-1: юрполя компании + uq(org_id,inn) (102), edge company-lookup (DaData), автозаполнение в форме и карточке"
```

Перед `git add` — `git status --short`, сверить с текстом коммита.
