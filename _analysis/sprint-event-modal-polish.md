# Claude Code Prompt — Polish: searchable company/contact select + автоподстановка компании

> Мелкая полишевая задача, НЕ спринт. Два UX-фикса в двух файлах: `CallModal`, `MeetingModal`.
> Ноль новых компонентов, ноль миграций, ноль AI. Использовать СУЩЕСТВУЮЩИЙ `<Combobox>`.

## Проблемы (обе в модалке события)
1. **Поиск компании по подстроке не работает.** Поля компания/контакт/проект — нативные
   `<select>`, у которых typeahead только по префиксу видимого текста. Для `ООО "Ромашка"`
   приходится набирать `ООО "Ро…`, а не «Ромашка».
2. **Компания не подставляется из контакта.** У выбранного контакта уже есть привязанная
   компания, но её каждый раз ищут вручную в длинном списке.

---

## РАЗВЕДКА
```bash
# Готовый Combobox — substring-фильтр (.includes), props { options, value, onChange, placeholder, disabled }
sed -n '1,60p' src/components/shared/Combobox.tsx
# Эталон использования через RHF Controller
sed -n '108,130p;418,460p' src/components/projects/ProjectModal.tsx
# Целевые модалки: сейчас register() + нативные select
grep -nE "useForm|control|register|Controller|<select|company_id|contact_id|project_id" src/components/calls/CallModal.tsx
grep -nE "useForm|control|register|Controller|<select|company_id|contact_id|project_id" src/components/meetings/MeetingModal.tsx
# Форма contact.companies (для автоподстановки): массив { company_id, role, company:{id,name} }
grep -nE "companies|contact_company" src/lib/hooks/use-contacts.ts | head
```

---

## ЗАДАЧА 1: `<select>` → `<Combobox>` (поиск по подстроке)

В `CallModal` и `MeetingModal` заменить нативные `<select>` для **компании, контакта,
проекта** на `<Combobox>` (тот же паттерн, что ProjectModal — через RHF `Controller`,
`field.value` / `onChange`). Пустой вариант («— не указана —») = `value: null`.

- Достать `control` из `useForm` (сейчас модалки на `register`).
- `options: ComboboxOption[]` (useMemo): `{ value: id, label: name }`. Для контакта можно
  `sub` = телефон/компания, если удобно (Combobox ищет и по `sub`).
- Статус/дата/время — оставить как есть (там Combobox не нужен).
- Проверить: submit и **edit-режим** (открытие существующего звонка/встречи) — значения
  подставляются, сохранение работает как раньше.

## ЗАДАЧА 2: Автоподстановка компании из контакта

Правило, только «контакт → компания», только при явном выборе контакта пользователем:

```
При изменении contact_id (watch):
  найти контакт → его companies[]
  если ровно ОДНА привязка → setValue('company_id', companies[0].company_id,
                                       { shouldDirty: true })  // с возможностью снять/сменить
  если 0 или >1 → НЕ трогать company_id (при many-to-many не угадываем — риск атрибуции)
```

Критично — **не навязывать в edit-режиме и не перетирать ручной выбор:**
- Срабатывает только на *пользовательскую смену* `contact_id`, не на reset формы при
  открытии существующей записи (иначе перезапишет уже проставленную компанию).
  Приём: подставлять, только если `contact_id` реально сменился относительно предыдущего
  значения И (company_id пуст ИЛИ прежняя компания соответствовала прежнему контакту).
  Проще и безопасно для MVP: подставлять при смене контакта, только если `company_id`
  сейчас пуст. Если у звонка уже есть компания — не трогаем.
- Данные о компаниях контакта: из `useContacts()` (уже грузится) или точечно у выбранного
  контакта; не делать лишних запросов, если список контактов уже в памяти.

## ЗАДАЧА 3 (границы — НЕ делать)
- Обратное направление «компания → фильтр контактов только её» — НЕ трогать (many-to-many
  + пустые привязки сузят список неверно, сломает текущий выбор).
- Другие модалки (ProjectModal/ContactModal) уже на Combobox — не трогать.
- Никаких изменений схемы/хуков данных.

---

## Проверки
1. `npx tsc --noEmit` + `npm run lint` — чисто, без новых warnings.
2. Combobox: в CallModal набрать «Ромашка» → находит `ООО "Ромашка"` (substring). То же в MeetingModal.
3. Автоподстановка: новый звонок → выбрать контакт с одной компанией → company_id подставился;
   контакт с несколькими → company_id остался пуст; можно вручную сменить и подстановка не перетрёт.
4. Edit-режим: открыть существующий звонок с компанией → компания на месте, смена контакта
   НЕ затирает уже сохранённую компанию.
5. Submit создаёт/обновляет запись с верными company_id/contact_id/project_id.

Runtime-чеки — браузером (Chrome MCP), как в прошлых спринтах.

## Коммит
```bash
git add src/components/calls/CallModal.tsx src/components/meetings/MeetingModal.tsx
git commit -m "polish: Combobox (поиск по подстроке) + автоподстановка компании из контакта в модалках звонка/встречи"
```

## После
- Learnings (crm-architect): «Модалки события — Combobox через Controller, не нативный select
  (нативный ищет только по префиксу; ООО-префикс ломает поиск по названию)».
