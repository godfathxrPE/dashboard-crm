# Ревью: sprint-ui-D1 (скобки + мультителефон + портал дропдаунов)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, `git branch --show-current`; refs crm-architect: `schema.md` / `architecture.md` / `learnings.md` / `theme-system.md`; live: `src/`, `supabase/migrations/`, `docs/schema.md`)  
**Объект:** `_analysis/sprint-ui-D1-brackets-phones-dropdown.md` — три пункта UI-D1: декор-скобки `「 」`, JSONB `phones`, портал попапов в модалках  
**Контекст:** файл спринта от ~2026-07-13; коммиты реализации уже в `HEAD`: `a709ba6` (скобки), `96263de` (041 + типы/валидаторы), `41a42f6` (UI + портал), `ba33108` (sync types/headers «041 applied»); далее 042–049; crm-architect и `docs/schema.md` фиксируют **041 applied 2026-07-13**

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Качество исходного промпта (как design, на момент написания) | ✅ 8.5/10 |
| РАЗВЕДКА vs **текущий** live codebase | ❌ устарела (всё три задачи уже в дереве) |
| Schema truth / номер миграции 041 | ❌ спринт пишет «pending / создать 041» — в проде **applied**, файл есть, цепочка ушла до 049 |
| SQL / RLS / org boundary | ✅ дизайн верен; в live без новых функций/политик |
| Файловые пути / line numbers в спринте | 🟡 пути в целом верны; номера строк и «absolute z-50» — stale |
| learnings / architecture consistency | ✅ UI-D1 уже зафиксирован в refs |
| Можно запускать в Claude Code **сейчас** | ❌ **нельзя** — работа выполнена |
| Риск повторного прогона | ❌ высокий (дубль/rewrite 041, overwrite портала/PhoneFields, конфликт с 042+) |

**Оценка: 8.5/10 как документ-спека/история; 0/10 как исполнимый спринт «с нуля».**  
**Рекомендация:** **не запускать в CC.** Спринт закрыт. Файл оставить как audit trail; при желании — одной правкой пометить в шапке `DONE / applied 2026-07-13` (не CC).

---

## Статус

| Задача | Статус в репо |
|--------|---------------|
| D1.1 скобки `「 」` глобально off | ✅ `src/app/globals.css` ~1494–1501: `.bracket` без `::before/::after` (контейнер `position: relative`); Aura-карточки `.t-aura [data-card]/aside .bracket` сохранены; fuji diagonal nav **не тронут** (`.t-fuji aside .nav-active::before/::after` ~502–521) |
| D1.2 миграция `041_multi_phone.sql` | ✅ файл есть; header: **APPLIED 2026-07-13** (`20260713121136`); `docs/schema.md` + crm-architect `schema.md` — `phones` на contacts/companies |
| D1.2 типы + Zod | ✅ `PhoneEntry` / `PhoneType` в `src/types/database.ts:42–53`; `phoneEntrySchema` + `primaryPhone` / `normalizePhones` в `src/lib/validators/phone.ts`; `phones` в contact/company validators |
| D1.2 UI форм | ✅ `PhoneFields` (`useFieldArray`) в ContactModal + CompanyModal; primary → legacy `phone` на submit |
| D1.2 отображение | ✅ `PhoneList` в ContactDetail + CompanyDetail (`tel:`, primary сверху, fallback на `phone`) |
| D1.3 клип дропдауна | ✅ `createPortal` + `useAnchoredRect` в AssigneeSelect и Combobox; `zIndex: 1100`; hook `src/lib/hooks/use-anchored-rect.ts` |
| Коммиты из секции «КОММИТЫ» | ✅ messages совпадают с `a709ba6` / `96263de` / `41a42f6` (ancestors of `HEAD`) |
| Гейт Cowork 041 | ✅ по schema/migration header — применён; advisors/backfill — вне scope ре-рана |

---

## С чем согласен полностью (как с исходной спекой)

### 1. Задача 1 — глобальное гашение уголков

Диагноз верен: scandi удалён (AUDIT C), `.bracket` оставался как обёртка detail/lanes/drawer, псевдоуголки «текли» на washi/fuji/frost/aurora/tidal. Не трогать fuji sidebar diagonal-corners — правильно (это `.nav-active`, не `.bracket`).

**Live-реализация чуть чище, чем текст спринта:** вместо глобального  
`.bracket::before, .bracket::after { display: none !important; }`  
псевдоэлементы **убраны из источника** — `.bracket` только layout (`position: relative`). Эквивалент по UX, меньше `!important`.

### 2. Задача 2 — JSONB `phones` + legacy `phone` как зеркало

Правильное backward-compat решение: не ломать дедуп/списки, читающие `phone`. Элемент `{type, value, is_primary}`, бэкфилл mobile/work, RLS не трогать (колонка в той же строке) — совпадает с `schema.md` блоком 041 и learnings «Migration → Types → Validator → …».

### 3. Задача 3 — портал, не drop-up

Диагноз overflow модалки точен: `src/components/shared/Modal.tsx:110` — `overflow-y-auto overscroll-contain`. Портал на `document.body` + `position: fixed` + z > modal (1000) — согласован с learnings («tooltip/popover внутри overflow клиппится → fixed/portal») и theme-system (`use-anchored-rect`, UI-D1).

### 4. Коммитная нарезка

Три коммита (themes / migration+types / UI+portal) — здоровое разделение; live-история совпала с шаблоном сообщений спринта.

### 5. Чеклист crm-architect (дизайн на момент написания)

| Критерий | Статус |
|----------|--------|
| Есть РАЗВЕДКА | ✅ |
| Реальные таблицы/колонки | ✅ contacts/companies.`phone` + новые `phones` |
| Миграция отдельным файлом, не apply из CC | ✅ (гейт Cowork) |
| RLS / org_id | ✅ без новых политик — корректно |
| Нет новых SECURITY DEFINER | ✅ |
| CSS variables / theme scope | ✅ |
| schema.md после миграции | ✅ обновлён (applied) |

---

## Блокеры (критично — **не** запускать как новый спринт)

### B1. Спринт целиком already-done — повторный прогон опасен

Все три задачи и три заявленных коммита уже в `main`. Повторный CC-прогон:

- попытается **создать заново** `041_multi_phone.sql` при существующей цепочке **042–049** (и pending **049**);
- перепишет работающие `PhoneFields` / portal / globals без нужды;
- сломает sync с `supabase.gen.ts` (`phones: Json` уже в gen).

**Действие:** не отдавать файл в CC. Пометить DONE в шапке (вручную, по желанию).

### B2. «041 pending / НЕ применять» — ложь относительно текущего состояния

Спринт:

> Одна миграция (D1.2), её применяет гейт Cowork — НЕ применять.  
> `041_multi_phone.sql` … schema.md: … `Pending 041`.

Факты:

- `supabase/migrations/041_multi_phone.sql` — header **APPLIED 2026-07-13**;
- crm-architect + `docs/schema.md`: **041 multi_phone applied**;
- следующий pending в схеме — **049**, не 041.

Запуск «создай 041» = schema-drift / history conflict.

### B3. РАЗВЕДКА и line-claims stale → CC «починит» уже починенное

| Спринт утверждает | Live 2026-07-16 |
|-------------------|-----------------|
| `AssigneeSelect` popup `absolute z-50` (~:116) | `createPortal` + `position: fixed`, `zIndex: 1100` (:124–127) |
| `Combobox` тот же паттерн (:142) | portal fixed z-1100 (:143–146) |
| ContactModal phone input ~:165 | `PhoneFields` ~:184 |
| CompanyModal phone из конфига :99 | phone **убран** из fields-конфига; `PhoneFields` ~:151 |
| ContactDetail :77 / CompanyDetail :88 «одна строка» | `PhoneList` + `hasPhones` (~82–117 / ~95–132) |
| Aura-only suppress ~:1018 | комментарий «отдельное гашение больше не нужно»; global fix ~1494+ |
| `Modal.tsx:110` | path = **`src/components/shared/Modal.tsx`** (не `ui/`); строка 110 ещё верна по overflow |

Команды grep на `<Bracket` всё ещё находят обёртки (ожидаемо: класс остался layout-контейнером) — CC может «починить» несуществующие уголки.

---

## Предупреждения (желательно знать; не блокеры re-run, т.к. re-run запрещён)

### W1. `database.ts` не типизирует Row.phones как `PhoneEntry[]`

Спринт: «`phones: PhoneEntry[]` (или Json) в Row/Insert/Update».  
Live: `PhoneEntry` — рукописный доменный тип; в `supabase.gen.ts` колонка — **`Json`**. Мост Json→`PhoneEntry[]` уже чинили (`ee4c274`, `bf88228`). Это ок, но формулировка спринта «в database.ts Row» уже не описывает архитектуру gen+overlay.

### W2. `normalizePhone` на blur — сознательно не сделано

Спринт: «input value, normalizePhone на blur».  
`PhoneFields.tsx:22–24`: нормализация на blur **намеренно не** — `normalizePhone` = comparator (digits-only), не форматтер; иначе сотрёт `+7 (999)…`. Дедуп нормализует при сравнении. Отклонение от спринта **правильнее** — зафиксировать в learnings при случае.

### W3. Z-index hierarchy в learnings неполный

Learnings: Dropdowns 50 / Overlay 999 / Modal 1000.  
Портал UI-D1: **1100**. В `architecture.md` / `theme-system.md` уже отражено; в condensed learnings hierarchy — нет. Не баг кода, gap документации.

### W4. Бэкфилл в live чуть строже, чем SQL в спринте

Спринт: `WHERE phone IS NOT NULL AND phones = '[]'`.  
Файл миграции: ещё `AND phone <> ''`. Идемпотентнее; при «документации» спринта как source of truth — мелкая расхождение.

### W5. Карточное оформление bracket — только Aura

Спринт допускал global card-look **или** flat labels. Live: карточки surface+border+radius только под `.t-aura`; на остальных темах `.bracket` = flat container без уголков. Согласовано с приоритетом «нет висящих уголков».

### W6. Комментарий в `database.ts:42` всё ещё «миграция 041 — на гейте»

Косметический stale comment после apply; не функциональный риск.

---

## Пропущенные места (если бы спринт ещё не был сделан — gaps в исходном списке файлов)

Исходный спринт **не** перечислял явно (в live появились и нужны):

| Файл | Роль |
|------|------|
| `src/lib/hooks/use-anchored-rect.ts` | общий hook portal-позиции (scroll capture + resize) |
| `src/components/shared/PhoneFields.tsx` | RHF field-array UI |
| `src/components/shared/PhoneList.tsx` | detail list + tel: |
| `src/lib/validators/phone.ts` | schema + primaryPhone + normalizePhones |
| `src/types/supabase.gen.ts` | gen-колонка `phones: Json` (после apply/regen) |
| хуки contacts/companies | Json→PhoneEntry parse на границе (post-D1 tech-debt commits) |

Для **повторного** запуска это не «добавить в спринт», а «уже есть — не трогать».

---

## Предлагаемые правки в спринт (только если обновляете документ как archive)

1. **Шапка:** `Status: DONE · applied 2026-07-13 · commits a709ba6, 96263de, 41a42f6, ba33108`.  
2. **Миграция:** «041 APPLIED — не создавать, не re-apply».  
3. **РАЗВЕДКА:** заменить на verification-команды (portal/PhoneFields/`.bracket` без `::before`), убрать «absolute z-50».  
4. **Не запускать в CC** — явный баннер вверху.  
5. Опционально: отметить deliberate skip `normalizePhone` on blur + portal z-1100 в learnings hierarchy.

**Не править** сам sprint file в рамках этого ревью (по инструкции пользователя).

---

## Чеклист перед CC

- [ ] ~~Запускать UI-D1 в Claude Code~~ → **нет**
- [x] 041 в живой БД / schema.md applied
- [x] Скобки глобально off; fuji nav markers целы
- [x] `PhoneFields` / `PhoneList` / legacy `phone` sync
- [x] AssigneeSelect + Combobox portal z-1100
- [x] architecture.md / learnings / theme-system знают UI-D1
- [ ] (опц.) Stale comment «на гейте» в `database.ts` — косметика
- [ ] (опц.) Пометить sprint md как DONE

---

## Итог одной строкой

**UI-D1 полностью реализован и задокументирован в refs; промпт хорош как историческая спека, но как handoff «в CC сейчас» — блокирован: миграция 041 applied, код и коммиты уже в `main`.**
