# Ревью: sprint-t1-contacts-normalize (D2)

**Дата:** 2026-07-20  
**Ревьюер:** Grok (верификация по коду `feat/deal-card` @ `bbb1045`; crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-t1-contacts-normalize.md` — display-формат RU-телефона + схлопывание синонимов `position` в top-5 чипах  
**Контекст:** post-P2 `bbb1045`; миграций нет; 041 multi_phone (`phones` jsonb) уже в проде; live-роут `/contacts/[id]` → `ContactDetailHub`, не legacy `ContactDetail`

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА vs live | ✅ команды и пути сходятся; line numbers близки |
| Schema truth (`phone` / `position` / no DDL) | ✅ |
| Файловые пути / символы | ✅ (с одним важным gap в inventory) |
| Scope display-only / storage | ✅ |
| `EditableCell` + `format` design | ✅ |
| Дедуп чипов (`canonicalPosition` + matcher) | ✅ согласован с `useChipFilter` |
| Консистентность display phone | 🟡 gap: live hub + companies |
| crm-architect checklist | ✅ (нет SQL/RLS/CSS-тем) |
| Можно запускать в CC | ✅ желательно с правками W |

**Оценка: 8/10.** Узкий, точный, evidence-based спринт; ядро (таблица контактов + чипы + util) корректно.  
**Рекомендация:** **запускать в CC**, лучше после правки W1 (добавить `ContactDetailHub` в задачу 4) — иначе смок «карточка контакта» не закроет live-роут.

---

## Статус (разведка)

| Утверждение спринта | Факт в репо |
|---------------------|-------------|
| Checkout `feat/deal-card` после P2 `bbb1045` | ✅ ветка `feat/deal-card`, `HEAD` = `bbb1045` |
| `phone.ts` только `normalizePhone` | ✅ `src/lib/utils/phone.ts` (3 строки, comparison-only) |
| `position.ts` отсутствует | ✅ MISSING |
| `positionFilters` на сыром `c.position` | ✅ `ContactsTable.tsx:52–61` (`freq[c.position]`, `c.position === pos`) |
| `EditableCell` non-edit `{value \|\| placeholder}` | ✅ строка **96** (спринт: sed 86–99 — ок, чуть шире) |
| `format` prop отсутствует | ✅ `EditableCellProps` lines 5–11 |
| Phone-колонка ContactsTable без format | ✅ lines 116–124 |
| LeadsView сырой phone (table + card) | ✅ 144, 489–490 |
| ContactPeek: text + `tel:` | ✅ 36–38; `tel:` не трогать — верно |
| PhoneList сырой `p.value` | ✅ `PhoneList.tsx:37` (`{p.value}`), href уже digit-cleaned |
| Миграций нет | ✅ корректно (только UI utils) |

---

## С чем согласен полностью

### 1. Display-only, storage не трогаем

`contacts.phone` / `contacts.position` (schema.md: legacy `phone` + `position` text; `phones` jsonb 041) не переписываются. Согласовано с `PhoneFields` (комментарий: `normalizePhone` — helper сравнения, не форматтер).

### 2. `formatPhone` рядом с `normalizePhone`

Правильное место: `src/lib/utils/phone.ts`. Алгоритм недеструктивен: 11 цифр `8…`/`7…` → `+7 (XXX) XXX-XX-XX`; 10 цифр → pad `7`; иначе `raw` as-is (`7110` остаётся). Для уже отформатированных валидных RU-номеров — идемпотентен.

**Не трогать `normalizePhone`** — обязательно: дедуп в `ContactModal` / `LeadConversionModal` завязан на digits-only.

### 3. `canonicalPosition` + alias map

Filter/chip-only, lowercase keys, collapse whitespace — корректно. Safe-merge кластеры (ГД / ИТ-синонимы / Глав. бух.) и «не мерджить» (Техдиректор ≠ ГД, И.О. ≠ ГД) — здравый product-scope. `ts_Принимает решение` в top-5 не попадёт — ок.

### 4. `EditableCell.format` только для non-editing

Инпут правит `draft` = сырое `value`; double-PATCH guard (`committedRef`) не трогается — правильно. Замена:

```tsx
{value ? (format ? format(value) : value) : placeholder}
```

совпадает с семантикой «пусто → placeholder».

### 5. Дедуп чипов через freq + matcher

После канона:
- top-5 строится по суммам синонимов;
- `useChipFilter` counts = `data.filter(fn).length` → matcher `canonicalPosition(c.position) === pos` даст ту же сумму;
- лейбл `key.replace('pos_', '')` = канон.

Логика самосогласована; отдельных правок `chipOptions` не нужно.

### 6. Формы / инпуты вне scope

`ContactModal` / `PhoneFields` / `CompanyModal` не трогать — верно.

### 7. Чеклист crm-architect (condensed)

| Критерий | Статус |
|----------|--------|
| Есть РАЗВЕДКА | ✅ |
| Реальные колонки (`phone`, `position`) | ✅ schema |
| Реальные пути | ✅ (см. W1) |
| learnings gotchas | ✅ нет конфликтов; multi_phone/PhoneList известны |
| SQL migrations | ✅ нет |
| org_id / RLS | n/a (client display) |
| SECURITY DEFINER | n/a |
| `flowType: 'implicit'` | n/a |
| DELETE CASCADE | n/a |
| CSS variables | n/a (только className-пропсы) |
| schema.md update | n/a |

---

## Блокеры (критично — исправить до запуска)

**Нет блокеров.** Спринт можно отдавать в Claude Code as-is; качество смока и консистентности — через предупреждения ниже.

---

## Предупреждения (желательно исправить)

### W1. Live «карточка контакта» = `ContactDetailHub`, не `ContactDetail` / `PhoneList`

**Факт:**

```3:12:src/app/(dashboard)/contacts/[id]/page.tsx
import { ContactDetailHub as ContactDetail } from '@/components/contacts/ContactDetailHub';
// …
return <ContactDetail contactId={id} />;
```

architecture.md: Contact 360° Hub → `ContactDetailHub.tsx`.

Hub рендерит сырой номер:

- `ContactDetailHub.tsx:383` — `{contact.phone}` внутри `<a href={tel:…}>`

Legacy `ContactDetail.tsx` (234 строки) **нигде не монтируется** (только re-export в `contacts/index.ts`). `PhoneList` живёт в legacy ContactDetail + **CompanyDetail**.

Спринт задача 4 чинит PhoneList → выигрывает CompanyDetail и мёртвый ContactDetail, **но не** `/contacts/[id]`.

Смок: «карточка контакта: телефоны в том же формате» — при текущем inventory **провалится** на hub, если тестировать реальный роут.

**Правка в спринт (задача 4):**

- `ContactDetailHub.tsx:383` — текст → `{formatPhone(contact.phone)}`; **`href={`tel:${contact.phone}`}` не трогать** (как в peek).
- В `git add` добавить `ContactDetailHub.tsx`; `ContactDetail.tsx` можно убрать из add, если правок в нём нет (достаточно `PhoneList.tsx`).

### W2. Параллельный UI: `CompaniesTable` phone `EditableCell`

`CompaniesTable.tsx:151–157` — тот же pattern, сырой `c.phone`. После появления `format={formatPhone}` одна строка даст паритет. Вне audit-D2, но иначе «единый формат» только у контактов/лидов.

**Рекомендация:** optional one-liner в задаче 3/4 или явный out-of-scope.

### W3. PhoneList: править shared component — побочный выигрыш CompanyDetail

Оборачивать `{formatPhone(p.value)}` в `PhoneList` — верно; `href` уже `p.value.replace(/[^\d+]/g, '')` — не ломать. После фикса CompanyDetail тоже форматируется — ок, не regression.

### W4. Alias-карта — хрупкая, но осознанная

Карта зашита константой из «26 distinct» live-DB. Новые написания («ген.директор», «CIO») снова дадут отдельные чипы. Для T1 нормально; backlog — расширяемый словарь / admin config. Не блокер.

### W5. Pre-existing: inline edit `phone` не синхронизирует `phones[]`

`EditableCell` → `updateContact({ phone })` не трогает jsonb `phones` (зеркало 041 обычно на submit модалки). Спринт **не вводит** баг; display-format его не усугубляет. Не расширять scope, просто знать.

### W6. Мелочи РАЗВЕДКИ

- sed `EditableCell` 86–99: non-edit блок 89–98, target line **96** — не stale-critical.
- `git add` включает `ContactDetail.tsx` — может оказаться no-op; см. W1.

---

## Пропущенные места (grep)

| Файл | Строки | Действие |
|------|--------|----------|
| `src/components/contacts/ContactDetailHub.tsx` | 380–383 | **Добавить в задачу 4:** display `formatPhone`, `tel:` raw |
| `src/components/shared/PhoneList.tsx` | 37 | В scope спринта (обернуть value) ✅ |
| `src/components/companies/CompaniesTable.tsx` | 151–157 | Опционально `format={formatPhone}` (W2) |
| `src/components/companies/CompanyDetail.tsx` | 135 | Автоматом через PhoneList |
| `src/components/contacts/ContactDetail.tsx` | 117 | Dead route; PhoneList покроет, если компонент когда-то вернут |
| Export / CSV / ExcelImport / settings profile phone | — | Оставить raw (export = storage) — не в scope |
| CallModal / MeetingModal `sub: c.phone` | — | Picker subtitle — out of scope ok |

---

## Предлагаемые правки в спринт

1. **Задача 4 + смок:** явно `ContactDetailHub.tsx` (текст phone → `formatPhone`; `tel:` без изменений).
2. **КОММИТ `git add`:** `ContactDetailHub.tsx` вместо/вместе с `ContactDetail.tsx`; обязательно `PhoneList.tsx` (сейчас в add есть ContactDetail, нет явного PhoneList — при правке только PhoneList `git add` из спринта **пропустит** изменённый shared-файл!).

   Текущий git add:

   ```
   … ContactDetail.tsx
   ```

   Нет `src/components/shared/PhoneList.tsx`. Если CC правит PhoneList и делает commit по списку — **PhoneList не попадёт в коммит**. Это practically важно:

   **Исправить git add → включить `PhoneList.tsx` и `ContactDetailHub.tsx`.**

3. (Опционально) `CompaniesTable` + `format={formatPhone}`.
4. В шапке: «live detail = ContactDetailHub; legacy ContactDetail не в page.tsx».

Пункт 2 (git add без PhoneList) — ближайший к блокеру по процессу; сама реализация не ломается, ломается только completeness коммита. Поднимаю до soft-blocker в чеклисте.

---

## Чеклист перед CC

- [ ] В задачу 4 добавлен `ContactDetailHub` (display-only formatPhone)
- [ ] В `git add` есть `src/components/shared/PhoneList.tsx` и `ContactDetailHub.tsx`
- [ ] `normalizePhone` не менять; только `export function formatPhone`
- [ ] `position.ts` — новый файл, aliases как в спеке
- [ ] `EditableCell`: только prop `format` + non-edit render; guards/draft не трогать
- [ ] ContactsTable: `format={formatPhone}` + две точечные замены в `positionFilters`
- [ ] Peek: text format, `tel:` raw
- [ ] LeadsView: table + card
- [ ] Формы ContactModal/PhoneFields/CompanyModal — не трогать
- [ ] `npx tsc --noEmit`
- [ ] Смок: `/contacts` phone column + chips; click → raw in input; `/contacts/[id]` hub; peek; `/leads`
- [ ] Не пушить без подтверждения; миграций нет

---

## Итог для Claude Code

Спринт **годен к запуску**: разведка thruthful, scope узкий, util/EditableCell/chips design solid, schema/architecture не противоречат.

Минимальный pre-flight (5 минут правки markdown):

1. Task 4 + commit file list: **`ContactDetailHub` + `PhoneList`**.  
2. (Желательно) CompaniesTable format — одной строкой.

После этого — **полный green light** для CC.
