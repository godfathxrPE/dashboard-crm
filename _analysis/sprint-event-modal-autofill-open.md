# Claude Code Prompt — Fix: автоподстановка компании+проекта при открытии модалки с контактом

> Продолжение polish-задачи (коммит 2b9b8fc). Автоподстановка сейчас срабатывает ТОЛЬКО
> при ручном выборе контакта (`handleContactChange`). При открытии «Новый звонок» с карточки
> контакта контакт приходит через `defaultContactId` → reset() → onChange НЕ вызывается →
> компания/проект остаются пустыми. Плюс автоподстановки ПРОЕКТА нет вообще.
> Файлы: `CallModal`, `MeetingModal`. Ноль схемы, ноль AI.

## Что чиним
1. Открытие модалки с `defaultContactId` (с карточки контакта/компании) не выводит компанию.
2. Проект не подставляется никогда (нужно: один активный проект контакта → подставить).

---

## РАЗВЕДКА
```bash
# Текущая автоподстановка (только на ручной выбор) + open-effect с reset()
sed -n '58,120p' src/components/calls/CallModal.tsx
# Как хаб открывает модалки: CallModal получает ТОЛЬКО defaultContactId (Meeting/Task — ещё defaultCompanyId)
grep -nE "CallModal|MeetingModal|TaskModal|default(Contact|Company|Project)Id" src/components/contacts/ContactDetailHub.tsx
# Проекты контакта: projects.contact_id, активные = stage !== 'lost' (как linkedProjects в хабе)
grep -nE "linkedProjects|contact_id|stage.*lost|useProjects" src/components/contacts/ContactDetailHub.tsx | head
# MeetingModal — тот же паттерн, свериться
sed -n '34,75p' src/components/meetings/MeetingModal.tsx
```

---

## ЗАДАЧА 1: Вынести вывод связей в переиспользуемый хелпер

В каждой модалке (или общий util `src/lib/timeline/` уже есть — можно рядом положить
`src/lib/forms/derive-links.ts`) — чистая функция:

```ts
// Возвращает то, что МОЖНО подставить из контакта. Пусто, если неоднозначно.
deriveFromContact(contactId, { contacts, projects }) => {
  company_id?: string;   // ровно ОДНА привязка contact_company → её company_id
  project_id?: string;   // ровно ОДИН активный проект (projects.contact_id === id && stage !== 'lost')
}
// 0 или >1 в любой категории → соответствующее поле не возвращается (не угадываем).
```

## ЗАДАЧА 2: Применить в двух местах (change И open)

### 2.1 Ручной выбор контакта (уже есть — расширить проектом)
`handleContactChange`: после установки contact_id вызвать `deriveFromContact`, и для КАЖДОГО
поля — `setValue(field, derived, { shouldDirty: true })` **только если поле сейчас пусто**
(не перетирать ручной выбор). Сейчас так делается для company — добавить то же для project.

### 2.2 Открытие в режиме создания (главный фикс)
В open-effect (где `reset()`), в ветке НЕ editCall: после reset, если `contact_id` задан
(из `defaultContactId`), вызвать `deriveFromContact` и заполнить company_id/project_id,
**только те, что пусты** после reset (т.е. не затирать явные `defaultCompanyId/defaultProjectId`,
если их передали).

Гейты (сохранить строго):
- **editCall/editMeeting → НИКОГДА не выводить** (только сохранённые значения). Ветка reset
  для edit не трогается.
- **Только пустые поля** — и на change, и на open. Явный default или ручной выбор не перетираются.

## ЗАДАЧА 3: (опц., если тривиально) выровнять точки вызова
`ContactDetailHub` передаёт `CallModal` только `defaultContactId`. После фикса это уже не
обязательно (модалка сама выведет), но для консистентности можно передать и
`defaultCompanyId={primaryCompany?.company_id}` как у Meeting/Task. НЕ обязательно —
in-modal derive уже покрывает. Не усложнять.

---

## Границы (НЕ делать)
- Обратное «проект → компания/контакт» и «компания → фильтр контактов» — не трогать.
- Много компаний/проектов у контакта → не угадывать (оставить пусто, пусть выберет).
- Схема, хуки данных, другие модалки (ProjectModal и т.п.) — не трогать.

## Проверки (браузер, Chrome MCP)
1. `tsc --noEmit` + lint — чисто, без новых warnings.
2. **Главный кейс:** карточка контакта (у него 1 компания + 1 активный проект) → «Новый
   звонок» → компания И проект подставлены сразу, без ручного выбора. (Скрин Ларисы
   Евгеньевны: ООО Обуховский мясокомбинат + ОМК должны подставиться.)
3. Контакт без проектов → проект пуст, компания подставлена (если одна).
4. Контакт с >1 компанией → компания пуста (не угадали).
5. Ручной выбор контакта на чистой форме (страница звонков) → company+project выводятся.
6. **Edit-режим:** открыть существующий звонок → сохранённые company/project на месте,
   вывод НЕ сработал, ничего не перетёрто.
7. Смена контакта при уже заполненной компании → компания НЕ перетёрта (гейт «только пустое»).
8. То же для MeetingModal.

## Коммит
```bash
git add src/components/calls/CallModal.tsx src/components/meetings/MeetingModal.tsx src/lib/forms/
git commit -m "fix: автоподстановка компании+проекта из контакта при ОТКРЫТИИ модалки события (не только ручной выбор); +автоподстановка проекта"
```

## После
- Learning (crm-architect): «Автоподстановка связей в модалке события — и на onChange
  контакта, И на open-with-defaultContactId (reset не триггерит onChange); всегда только
  пустые поля, edit-режим исключён».
