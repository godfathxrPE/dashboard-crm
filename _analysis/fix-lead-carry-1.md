# Claude Code Prompt — Fix S-LEAD-CARRY-1: две правки до apply

Гейт прошёл ревью коммита `f077c4e` (ветка `feat/lead-convert-carryover`). Дифф
соответствует отчёту, тело функции сверено с живым `pg_get_functiondef` блок за блоком,
advisors-baseline снят. **Блокеров нет.** Две правки, обе до apply — вторая после apply
потребовала бы отдельную миграцию ради двух строк.

Ветка та же, коммит поверх. **Миграция 123 по-прежнему не применяется из CC.**

---

## ПРАВКА 1 — org-гард в блоках 1 и 2 `convert_lead`

Файл: `supabase/migrations/123_lead_convert_carryover.sql` (не применена ⇒ правится
на месте, новая миграция не заводится).

В теле функции два поиска существующих сущностей проверяют владение, но **не орг**:

```sql
-- блок 1
SELECT id INTO v_company_id FROM companies
  WHERE id = p_company_id
    AND (owner_id = v_user_id OR created_by = v_user_id);

-- блок 2
SELECT id INTO v_contact_id FROM contacts
  WHERE id = p_contact_id
    AND (owner_id = v_user_id OR created_by = v_user_id);
```

Это наследство до 119, спринт его не привносил. Но **123-A по тому же `v_company_id`
теперь ПИШЕТ** — поверхность выросла с «привязать чужую компанию к сделке» до
«переписать её маркировочный профиль». Функция и так переписывается целиком, значит
чинится здесь и бесплатно.

Добавь org-предикат в оба SELECT'а:

```sql
-- блок 1
SELECT id INTO v_company_id FROM companies
  WHERE id = p_company_id
    AND org_id = v_lead.org_id
    AND (owner_id = v_user_id OR created_by = v_user_id);

-- блок 2
SELECT id INTO v_contact_id FROM contacts
  WHERE id = p_contact_id
    AND org_id = v_lead.org_id
    AND (owner_id = v_user_id OR created_by = v_user_id);
```

Почему именно `v_lead.org_id`, а не `current_org_id()` — та же причина, что у 123-B:
функция SECURITY DEFINER и обязана работать в service-контексте, где `auth.uid()` = NULL
и helper вернёт NULL, а `org_id = NULL` не отсечёт ничего и не пропустит ничего — гард
станет немым. Орг берётся из строки, которую уже прочитали (урок 024).

Комментарий над правкой — по делу, без пересказа диффа:

```sql
  -- Гейт S-LEAD-CARRY-1: org-предикат добавлен вместе с 123-A. До 123 эти два
  -- поиска проверяли только владение, и цена была ограничена кривой ссылкой в
  -- projects.company_id; с 123-A по найденной компании идёт ЗАПИСЬ профиля.
  -- `v_lead.org_id`, не `current_org_id()`: в service-контексте helper = NULL и
  -- предикат стал бы немым (урок 024).
```

**Что это меняет сегодня:** ничего. Орг в проде одна, пользователей в двух орг ноль
(проверено гейтом 2026-08-11) — гард профилактический, и это его нормальное состояние,
а не признак лишней работы.

Ошибочные сообщения (`'Company not found or not owned by lead owner'`) **не трогай**:
текст остаётся верным, а менять формулировки исключений в одном заходе с правкой
предиката — лишний шум в диффе.

---

## ПРАВКА 2 — комментарий в `use-companies.ts` описывает механизм, которого нет

Файл: `src/lib/hooks/use-companies.ts`, блок над `chz_groups?` в `CompanyInsert`.

Сейчас там:

```
// ⚠️ Список полей здесь — не документация, а ФИЛЬТР: `updateCompany` гоняет
// `...updates`, но собирается payload из этого интерфейса, и поле, которого тут
// нет, до БД не доедет молча.
```

**Это неверно.** `CompanyModal.onSubmit` строит `payload = { ...values }` из значений
Zod-схемы и отдаёт его в `create.mutateAsync(payload)` / `update.mutateAsync({ id,
...payload })`, а `createCompany`/`updateCompany` кладут объект в
`.insert(company as never)` / `.update(updates as never)`. Каст снимает проверку типов —
лишний ключ доехал бы до БД **и без** записи в этом интерфейсе. Поле здесь нужно
для tsc (чтение `editCompany.chz_groups` в модалке, типизация payload), рантайм-фильтра
в этом пути нет.

Замени на:

```
// Поле нужно для ТИПИЗАЦИИ, а не как фильтр: payload собирается в
// `CompanyModal.onSubmit` как `{ ...values }` из Zod-схемы и уходит в
// `.insert(... as never)` / `.update(... as never)` — каст снимает проверку, и
// ключ доехал бы до БД и без записи здесь. Контракт поля держит
// `companyFormSchema`, не этот интерфейс.
```

Причина правки, а не придирка: комментарий встаёт в память проекта и врёт следующему
спринту — тот же класс, из-за которого в проекте заведено правило про расходящиеся
копии памяти. Неверное «здесь фильтр» однажды заставит кого-то искать несуществующую
причину, почему поле не доехало.

---

## ПРАВКА 3 — `docs/schema.md`: зафиксировать org-гард

В разделе про `convert_lead` v3 добавь к описанию строку — гард стал частью v3, и
следующий спринт обязан читать актуальное тело:

> **Блоки 1 и 2 (поиск существующих компании/контакта) с 123 сверяют `org_id =
> v_lead.org_id`** — до 123 проверялось только владение. Гард добавлен вместе с 123-A,
> потому что по найденной компании пошла ЗАПИСЬ профиля. Орг берётся из строки лида,
> не из `current_org_id()` (service-контекст ⇒ NULL ⇒ немой предикат, урок 024).

Статус миграции **не менять** — по-прежнему «НАПИСАНА, НЕ ПРИМЕНЕНА». `applied` +
версию проставит гейт.

---

## ПРОВЕРКИ

```bash
grep -n "org_id = v_lead.org_id" supabase/migrations/123_lead_convert_carryover.sql
# ожидание: ТРИ вхождения — блок 1, блок 2, 123-B (deal_stakeholders)

grep -n "ФИЛЬТР" src/lib/hooks/use-companies.ts   # ожидание: пусто

npx tsc --noEmit
npm run lint
npx vitest run
```

Тесты не добавляются: правка 1 — SQL непримённой миграции (покрывается смоком на гейте),
правка 2 — комментарий, правка 3 — документация.

---

## КОММИТ

```bash
git add supabase/migrations/123_lead_convert_carryover.sql \
        src/lib/hooks/use-companies.ts \
        docs/schema.md
git commit -m "fix(leads): org-гард в блоках поиска convert_lead + честный комментарий CompanyInsert

Гейт S-LEAD-CARRY-1, до apply 123:
- блоки 1/2 сверяют org_id = v_lead.org_id (123-A по найденной компании пишет)
- CompanyInsert.chz_groups — типизация, а не рантайм-фильтр: комментарий врал
- docs/schema.md: гард зафиксирован в описании v3"
```

После коммита — отчёт гейту. **Apply 123 остаётся за гейтом**, ветка не мержится
до применения: `payload` компании теперь всегда несёт `chz_groups`, и до apply
PostgREST вернёт PGRST204 на КАЖДОМ сохранении компании, а не только при
использовании пикера.
