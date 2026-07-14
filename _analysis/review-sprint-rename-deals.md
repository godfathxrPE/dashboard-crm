# Review: sprint-rename-deals.md

**Дата:** 2026-07-10  
**Ревьюер:** Grok (верификация по коду `feat/aura-theme`)  
**Объект:** `_analysis/sprint-rename-deals.md` — UI-переименование «Проекты» → «Сделки»

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Идея и scope (только UI, роуты/схема не трогаем) | ✅ Согласен |
| Границы «не трогать» (фаза-трек, PCT-1 доски) | ✅ Согласен |
| Перечисленные файлы в Задачах 1–4 | ✅ В основном верны |
| Ошибка по `ProjectsTable.tsx:99` | ❌ Исправить до запуска |
| Полнота инвентаря | 🟡 ~60% — много пропусков |
| `ProjectModal` | ❌ Нужна отдельная подзадача |
| Оценка трудоёмкости 0.5–1 ч | 🟡 Реалистично 1.5–2.5 ч с полным охватом |

**Спринт можно выполнять** после правок инвентаря. Концепция верная и согласуется с gap-анализом HubSpot (`projects(type='client')` = сделки).

---

## С чем согласен полностью

### Стратегия

Раздел `/projects` по факту — **пресейл-сделки** (`projects.type = 'client'`). Переименование только пользовательских подписей без смены URL, таблиц и идентификаторов — правильный минимальный шаг до отдельного модуля delivery («Проекты» внедрения).

### Границы «ЖЁСТКО НЕ ТРОГАТЬ» — корректны

- Роут `/projects` — bookmarks, saved views (`use-saved-views.ts` хранит `route: '/projects'`).
- `projects`, `project_id`, `project_columns`, `entity_type`, хуки, типы.
- Фаза-трек `getTrack()` → `'Проект'` в `ProjectsTable.tsx` (строки 27, 73, 91) — это **трек воронки IIoT** (Подготовка / Эксперимент / Проект), не название раздела.
- Вкладка **«Доска задач»** в `ProjectDetail` — PCT-1, исполнение, не продажи.
- Осознанный компромисс: `type='internal'` остаётся в списке «Сделки» с бейджем «Внутренний» — честно и правильно задокументировано.

### Осторожность с DashboardHome

Ключ `'Активные проекты'` в `SCANDI_KPI_META` / `FUJI_KPI_META` / `WASHI_KPI_META` используется для lookup метрик. Менять только вложенные `label` / `short` / `watermark`, **не ключ** — верно.

### Cmd+K

`act-project` уже `'Новая сделка'` — консистентно, не трогать.

---

## Ошибка в спринте (критично)

В **Задаче 2** для `ProjectsTable.tsx` указано **не трогать строку :99** как фаза-трек. Это неверно.

```tsx
// ProjectsTable.tsx — строка 99
const columns: Column<Project>[] = [
  {
    key: 'name',
    label: 'Проект',   // ← колонка таблицы name, МЕНЯТЬ на 'Сделка'
```

| Строка | Что это | Действие |
|--------|---------|----------|
| :27 | `getTrack()` return `'Проект'` | **НЕ трогать** (фаза-трек) |
| :73 | `track_proj` filter | **НЕ трогать** |
| :91 | chip `label: 'Проект'` для `track_proj` | **НЕ трогать** |
| :99 | column `name` label | **Менять** → `'Сделка'` |
| :315 | CSV export column `name` | **Менять** → `'Сделка'` (уже в спринте) |

---

## Пропущенные места (дополнить инвентарь)

Спринт покрывает примерно 60% user-facing строк. Ниже — полный дополнительный список по результатам `grep -ri "проект" src/components src/lib`.

### Критично (видно сразу при работе)

| Файл | Строки | Было → Стало (пример) |
|------|--------|------------------------|
| `PipelineBoard.tsx` | 315 | «Перетащи проект сюда» → «Перетащи сделку сюда» |
| `PipelineBoard.tsx` | 585, 625 | fallback/ошибка «проект» / «проектов» |
| `PipelineBoard.tsx` | 645, 649 | watermark `ПРОЕКТЫ`, h1 «Воронка проектов» → «СДЕЛКИ» / «Воронка сделок» |
| `PipelineBoard.tsx` | 674 | кнопка «Проект» → «Сделка» (уже в спринте) |
| `StageBoard.tsx` | 247, 409, 425, 468, 477, 484 | drag-hint, confirm, empty, кнопки |
| `ProjectDetail.tsx` | 302 | «Удалить проект?» → «Удалить сделку?» (для client; internal — см. ниже) |
| `ProjectDetail.tsx` | 318 | «Воронка проектов» → «Воронка сделок» |
| `CompanyDetail.tsx` | 182 | `+ Проект` → `+ Сделка` |
| `CompanyDetail.tsx` | 186 | «Нет проектов…» → «Нет сделок…» |
| `ContactDetail.tsx` | 203 | «Нет проектов с этим контактом» → «Нет сделок…» |
| `ProjectsTable.tsx` | 225, 283, 292 | ошибка, empty, bulk confirm |
| `lib/utils/activity-events.ts` | 24 | `'Проект обновлён'` → `'Сделка обновлена'` (**общий источник**, не только DashboardHome:748) |
| `lib/timeline/adapters.ts` | 108 | `` `Проект: ${p.name}` `` → `` `Сделка: ${p.name}` `` (или conditional по type) |

### Дашборд и виджеты

| Файл | Строки | Что менять |
|------|--------|------------|
| `DashboardHome.tsx` | 150 | FUJI watermark `'ПРОЕКТЫ'` → `'СДЕЛКИ'` |
| `DashboardHome.tsx` | 243 | `label: 'Активные проекты'` → `'Активные сделки'` (если ключ lookup позволяет — иначе только display label) |
| `DashboardHome.tsx` | 720 | `projects: 'проект'` → `'сделка'` |
| `DashboardHome.tsx` | 818 | «Создать проект →» → «Создать сделку →» |
| `StatsWidget.tsx` | 76 | «Активных проектов» → «Активных сделок» |
| `FunnelWidget.tsx` | 27 | «Воронка проектов» → «Воронка сделок» |
| `WeeklyReview.tsx` | 96 | «проект(ов)» → «сделок» |
| `CompaniesTable.tsx` | 103 | чип «Есть проекты» → «Есть сделки» |
| `CommandPalette.tsx` | 329–330 | placeholder «проектам» → «сделкам» |
| `TasksSidebar.tsx` | 176 | kanji-meta `label: 'проектов'` → `'сделок'` |

### Валидация и мелочи

| Файл | Строки | Что |
|------|--------|-----|
| `validators/project.ts` | 174 | `'Введи название проекта'` — conditional по type |
| `TaskCard.tsx` | 121 | fallback `'проект'` → `'сделка'` |

---

## ProjectModal — отдельная подзадача (обязательно)

Спринт **не описывает** модалку создания/редактирования. После переименования кнопки «Сделка» пользователь увидит «Новый проект» — разрыв UX.

**Рекомендация: conditional copy по `type`**

| Поле / действие | `type === 'client'` (default) | `type === 'internal'` |
|-----------------|-------------------------------|------------------------|
| Заголовок create | Новая сделка | Новый проект |
| Заголовок edit | Редактировать сделку | Редактировать проект |
| Label name | Название сделки * | Название проекта * |
| Submit | Создать сделку | Создать проект |
| Подсказка client | Сделка в воронке продаж | — |
| Подсказка internal | — | Внутренний проект — вне воронки… (**оставить**) |
| Селектор «Тип проекта» | **оставить** (PCT-1) | **оставить** |

Файл: `src/components/projects/ProjectModal.tsx` (строки 269, 284, 303, 326–327, 571).

Для `ProjectDetail` confirm delete и back-link «Воронка…» — аналогично: для `project.type === 'internal'` можно оставить «проект», для `client` — «сделка».

---

## Уточнить ПРОВЕРКУ в спринте

### Grep — два прохода

```bash
# Заглавная П (UI-строки)
grep -rnE "['\">][^'\"<]*Проект" src/components src/lib --include="*.tsx" --include="*.ts" \
  | grep -vE "//|project_id|projectId|getTrack|track_proj|phase_group|Доска задач|PCT-1|internal"

# Строчная п (пропуски спринта v1)
grep -rnE "['\">][^'\"<]*проект" src/components --include="*.tsx" \
  | grep -vE "//|project_id|projectId|PCT-1|internal|Внутренн"
```

### Ручной чек (дополнить)

- [ ] PipelineBoard: заголовок «Воронка сделок», watermark
- [ ] ProjectModal: client → «Новая сделка», internal → «Новый проект»
- [ ] Timeline: событие «Сделка: …» (не «Проект: …»)
- [ ] Activity feed: «Сделка обновлена»
- [ ] Empty states в таблице/воронке/StageBoard
- [ ] Saved views в localStorage: старые имена видов не обновятся автоматически (ожидаемо)

---

## Предлагаемая Задача 5 (добавить в спринт)

### Задача 5: Модалка и карточка сделки (conditional)

- `ProjectModal.tsx` — conditional strings по `currentType` / `editProject?.type`
- `ProjectDetail.tsx` — back-link, confirm delete
- `lib/timeline/adapters.ts` — prefix в title (или передавать type в row)
- `lib/utils/activity-events.ts` — единый источник «обновлена»
- `validators/project.ts` — message по type

### Задача 6: Воронка и empty states

- `PipelineBoard.tsx`, `StageBoard.tsx` — заголовки, watermarks, drag-hints, empty, errors
- `ProjectsTable.tsx` — :99, :225, :283, :292 (помимо уже перечисленного)
- `CompanyDetail.tsx`, `ContactDetail.tsx` — секции и empty (заголовки уже в Задаче 3)

### Задача 7: Виджеты и shared utilities

- `DashboardHome.tsx` — FUJI watermark, feed labels, CTA
- `StatsWidget.tsx`, `FunnelWidget.tsx`, `WeeklyReview.tsx`
- `CompaniesTable.tsx`, `CommandPalette.tsx` placeholder
- `TaskCard.tsx` fallback

---

## Что НЕ менять (напоминание)

```
getTrack() → 'Проект'                    # фаза IIoT-воронки
chip track_proj label: 'Проект'          # фильтр по фазе
ProjectModal: «Внутренний проект»        # PCT-1 delivery
ProjectDetail tab: «Доска задач»         # PCT-1 execution board
project_columns, column_id, resolve_task_board  # код PCT-1
AutomationsSection — уже «сделка»        # не трогать
TodayView — уже «Сделки без шага»        # не трогать
STAGE_CONFIG won/lost — «Сделка выиграна» # уже ок
```

---

## Связь с архитектурой

После этого спринта терминология UI совпадёт с моделью данных:

```
HubSpot Deals  ≈  dashboard-crm projects WHERE type='client'
HubSpot Projects (PM)  →  будущий модуль / projects WHERE type='internal' (позже — отдельный раздел)
```

До выноса internal в отдельный раздел компромисс с бейджем «Внутренний» в списке «Сделки» — приемлемый и должен оставаться в документации спринта.

---

## Рекомендуемый коммит (без изменений)

```bash
git commit -m "chore(ui): переименование раздела «Проекты» → «Сделки» (только лейблы; роут/схема/доски PCT-1 не тронуты)"
```

---

## Action items для Claude Code

1. Исправить в `sprint-rename-deals.md` инструкцию про `ProjectsTable :99` (менять, не исключать).
2. Добавить Задачи 5–7 или расширить Задачи 2–4 таблицами из этого review.
3. Добавить conditional logic для `ProjectModal` / `ProjectDetail`.
4. Расширить grep в блоке ПРОВЕРКА.
5. Пересмотреть оценку: **1.5–2.5 ч** вместо 0.5–1 ч.

---

*Файлы: `_analysis/sprint-rename-deals.md` (исходный спринт), `_analysis/hubspot-map-and-gap-v2.md` (контекст терминологии).*