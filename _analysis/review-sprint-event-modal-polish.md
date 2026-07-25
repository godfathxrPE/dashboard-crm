# Ревью: event-modal-polish (Combobox + автоподстановка)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, crm-architect references)  
**Объект:** `_analysis/sprint-event-modal-polish.md` — поиск компании/контакта/проекта по подстроке + автоподстановка компании из контакта в `CallModal` / `MeetingModal`  
**Контекст:** работа уже в `main` — `2b9b8fc` (ровно message из спринта), follow-up `9b9a7b7` + `src/lib/forms/derive-links.ts` (см. `_analysis/sprint-event-modal-autofill-open.md`). Review-файла по этому спринту раньше не было.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА есть | ✅ (команды есть) |
| РАЗВЕДКА актуальна vs live | ❌ устарела — код уже Combobox |
| Проблема 1 (substring search) | ✅ уже решена в коде |
| Проблема 2 (company from contact) | ✅ уже решена (+ шире: project + open) |
| Пути файлов | ✅ |
| Schema / миграции | ✅ N/A (ноль SQL) |
| Scope / «не трогать» | ✅ корректны на момент написания |
| Коммит-scope | ✅ совпал с фактическим `2b9b8fc` |
| Learnings «После» | 🟡 пункт не внесён в learnings.md |
| Готовность к повторному запуску в CC | ❌ **не запускать** |

**Оценка: 3/10 как живой handoff** (задачи устарели; как историческая заметка — ок).  
**Рекомендация:** **не запускать в CC.** Работа уже в `main`. При желании — пометить спринт как DONE / архивировать, опционально дописать learnings одной строкой.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| ЗАДАЧА 1: `<select>` → `<Combobox>` (company/contact/project) | ✅ `2b9b8fc` — `Controller` + `Combobox` в обоих модалах |
| ЗАДАЧА 2: автоподстановка company из contact (только если company пуст) | ✅ `2b9b8fc` → вынесено в `deriveFromContact` (`9b9a7b7`) |
| Follow-up: autofill при open + project | ✅ `9b9a7b7` (отдельный sprint-файл) |
| ЗАДАЧА 3 boundaries | ✅ не нарушены (обратный фильтр contact↔company не трогали) |
| Learnings «После» | 🟡 в `learnings.md` формулировки из спринта нет |

---

## С чем согласен полностью

### 1. Диагноз UX (на момент написания) был верный
Нативный `<select>` ищет typeahead по префиксу — для `ООО "Ромашка"` это больно. `Combobox` фильтрует через `.includes` по `label` и `sub` (`src/components/shared/Combobox.tsx:40–46`).

### 2. Правильный примитив и паттерн
Существующий `<Combobox>` + RHF `Controller` — эталон как в `ProjectModal` (сейчас company/contact ~504–541). Новых компонентов/миграций/AI не нужно — scope верный.

### 3. Правило автоподстановки (1 company only, empty gate)
«ровно одна привязка → подставить; 0/>1 → не трогать» + «только если `company_id` пуст» + не навязывать edit — безопасная MVP-логика. В live это `deriveFromContact` + `!getValues('company_id')` + edit-исключение в open-effect.

### 4. Границы (ЗАДАЧА 3)
Не фильтровать контакты по компании (M2M), не трогать ProjectModal/ContactModal, не менять схему/хуки — правильно.

### 5. Коммит-message и file list
Фактический `2b9b8fc` = ровно два файла и message из спринта.

---

## Блокеры (критично — исправить до запуска)

### B1. Спринт уже выполнен — повторный запуск в CC бессмыслен и рискован

Live (ветка `main`):

| Файл | Что есть сейчас |
|------|-----------------|
| `src/components/calls/CallModal.tsx` | `Controller` + `Combobox` для `company_id` (202–208), `contact_id` (215–222), `project_id` (229–235); `handleContactChange` + `applyDerived` (89–101); open-effect (132–139) |
| `src/components/meetings/MeetingModal.tsx` | то же: project (178–185), company (194–201), contact (205–212); derive (61–71, 104–111) |
| `src/lib/forms/derive-links.ts` | чистая `deriveFromContact` — company (ровно 1) + project (ровно 1 active) |

Единственный оставшийся `<select>` — **статус** звонка (`CallModal.tsx:187`), что спринт и просил оставить.

**Если CC прогонит спринт «как есть»:** перепишет уже рабочий код, может откатить follow-up (open-autofill + project), сломает `derive-links`.

**Действие:** не запускать. Статус: **DONE** (и follow-up DONE).

### B2. РАЗВЕДКА описывает состояние, которого больше нет

| Утверждение спринта | Live |
|---------------------|------|
| «сейчас `register()` + нативные select» | `control` + `Controller` + `Combobox` для связей |
| sed ProjectModal `108,130p;418,460p` как эталон Combobox | 108–130 — `reset` edit-полей; Combobox company/contact ~504–541 |
| «Достать `control` из `useForm` (сейчас модалки на `register`)» | `control` уже деструктурится (`CallModal:68`, `MeetingModal:36`) |

Разведка годилась **до** `2b9b8fc` (спринт от ~2026-07-11 в mtime; код с 2026-07-08). Как pre-flight для нового CC-захода — **невалидна**.

---

## Предупреждения (желательно)

### W1. Learnings «После» не внесён
Спринт просил в crm-architect learnings: «Модалки события — Combobox через Controller, не нативный select…».  
В `~/.claude/skills/crm-architect/references/learnings.md` этой формулировки нет (есть общие заметки про Combobox/портал, не event-modals).  
**Не блокер для CC** (CC не нужен). Опционально: одна bullet в learnings + ссылка на `derive-links.ts`.

### W2. Follow-up расширил scope — не отражено в этом файле
`9b9a7b7` / `sprint-event-modal-autofill-open.md` добавили:
- autofill при **open** с `defaultContactId` (reset не зовёт onChange);
- автоподстановку **проекта** (один active).

Текущий polish-файл описывает только company + ручной выбор. Для архива — ок; для «запустить ещё раз» — вводит в заблуждение.

### W3. Сиротский handoff в `_analysis/`
Файл без review, с устаревшей разведкой. Риск: кто-то увидит «новый спринт» и отдаст в CC. Имеет смысл шапка `> STATUS: DONE (2b9b8fc, follow-up 9b9a7b7)` или перенос в archive.

### W4. Мелочь: ProjectModal как эталон «без фильтра контактов»
Спринт верно сказал «другие модалки не трогать». ProjectModal **фильтрует** контакты по компании — обратное направление, которое в ЗАДАЧА 3 запрещено для event-модалок. Не баг спринта, но копировать ProjectModal 1:1 нельзя (и live event-модалки этого не делают).

---

## Пропущенные места (grep)

| Файл | Строки / символ | Действие |
|------|-----------------|----------|
| `CallModal.tsx` / `MeetingModal.tsx` | native select для company/contact/project | **нет** — задача 1 закрыта |
| `CallModal.tsx:187` | `<select status>` | оставить (как в спринте) |
| `src/lib/forms/derive-links.ts` | `deriveFromContact` | уже есть; не в исходном polish-scope, не ломать |
| `use-contacts.ts` | `companies:contact_company(...)` | данные для autofill есть; хуки трогать не нужно |
| Другие модалки с native select для связей | вне scope | не трогать |

Пробелов для **новой** реализации нет — работа сделана.

---

## Предлагаемые правки в спринт

*(только если обновляете файл как архив; для CC — не править и не запускать)*

1. В шапку:  
   `> STATUS: DONE — 2b9b8fc; follow-up open/project — 9b9a7b7 / derive-links.ts. НЕ запускать в CC.`
2. Заменить блок «сейчас register + select» на фактическое состояние (или пометку «pre-2b9b8fc»).
3. Поправить sed-якоря ProjectModal на ~504–541 (Controller company/contact).
4. Ссылку на follow-up sprint + `src/lib/forms/derive-links.ts`.
5. Learnings (опционально, вне CC): одна строка про Combobox в event-модалках + empty-gate autofill.

---

## Чеклист перед CC

- [x] РАЗВЕДКА в тексте есть  
- [ ] РАЗВЕДКА совпадает с live — **нет** (устарела)  
- [x] Миграций нет (не нужны)  
- [x] Schema claims — N/A  
- [x] org_id/RLS — N/A (UI-only)  
- [x] Целевые файлы существуют  
- [x] Задачи 1–2 **уже в main**  
- [x] Follow-up (open + project) **уже в main**  
- [ ] Learnings «После» — **ещё нет** (косметика)  
- [ ] **Запуск в CC — НЕТ**

---

## Итог одной строкой

Спринт описывает **уже сделанный** polish (`2b9b8fc` + усиление `9b9a7b7`); live-код на Combobox + `deriveFromContact`. **В Claude Code не отдавать** — только пометить DONE / дописать learnings при желании.
