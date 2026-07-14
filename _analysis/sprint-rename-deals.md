# Claude Code Prompt — Sprint: терминология «Проекты» → «Сделки» (UI-лейблы) — v2

> v2: учтён code-review (`_analysis/review-sprint-rename-deals.md`). Исправлены: `ProjectsTable:99`
> (менять, не исключать), полный инвентарь обоих регистров, **conditional-by-type для per-record
> строк** (client→сделка, internal→проект), единый источник `activity-events.ts`, оценка 1.5–2.5 ч.

Контекст: dashboard-crm, ветка `feat/aura-theme`. Раздел «Проекты» = пресейл-сделки
(`projects.type='client'`). Переименовываем UI-подписи на «Сделки». Настоящий модуль
delivery-«Проекты» — позже, здесь НЕ трогаем. Правка только отображаемых строк.

## Два правила (важно — не слепой replace)

1. **Раздел / список / агрегаты** (навигация, заголовок списка, воронка, дашборд-счётчики,
   секции связей на карточках) → **«Сделки»**. Это раздел продаж; внутренние проекты в нём
   временно живут как меньшинство с бейджем «Внутренний».
2. **Per-record строки** (модалка создания/редактирования, confirm удаления, «Проект: X» в
   ленте, валидатор) → **conditional по `type`**: `client` → «сделка», `internal` → «проект».
   Слепой replace тут НЕПРАВИЛЬНЫЙ — назовёт создание внутреннего проекта «сделкой».

## ЖЁСТКО НЕ ТРОГАТЬ

- Роут `/projects` (URL), `projects`, `project_id`, `project_columns`, `entity_type`, все
  идентификаторы в коде/типах/хуках.
- Вкладку **«Доска задач»** и PCT-1 UI (`project_columns`, `resolve_task_board`).
- Фаза-трек **«Проект»**: `ProjectsTable.tsx:27` (`getTrack()` return), `:73` (`track_proj`),
  `:91` (chip label для track_proj) — это `phase_group` (треки Подготовка/Эксперимент/Проект).
  ⚠️ **`:99` — это НЕ трек, а колонка `name`; её МЕНЯТЬ** (см. Задача 2).
- Селектор «Тип проекта» и подсказку «Внутренний проект — вне воронки…» в ProjectModal (PCT-1).
- Уже корректные: `act-project: 'Новая сделка'` (Cmd+K), STAGE_CONFIG «Сделка выиграна/проиграна»,
  TodayView, AutomationsSection — если уже «сделка», не трогать.

## РАЗВЕДКА (полный инвентарь, ОБА регистра)

```bash
grep -rnE "['\">][^'\"<]*Проект" src/components src/lib --include="*.tsx" --include="*.ts" \
  | grep -vE "//|project_id|projectId|getTrack|track_proj|phase_group|Доска задач"
grep -rnE "['\">][^'\"<]*проект" src/components src/lib --include="*.tsx" --include="*.ts" \
  | grep -vE "//|project_id|projectId|Внутренн|Тип проект"
```
Списки ниже собраны по коду. Если grep даст НОВОЕ сверх них — тоже поправить (в грамматике/правилах).

## Задача 1: Навигация и раздел → «Сделки»

- `layout/Sidebar.tsx:23` `label:'Проекты'`→`'Сделки'` (jpLabel `案件管理`, icon, href — оставить)
- `layout/ScandiSidebar.tsx:19` `label:'Проекты'`→`'Сделки'`, `short:'Пр'`→`'Сд'`
- `layout/ScandiContentHeader.tsx:16` `'/projects':'Проекты'`→`'Сделки'`
- `shared/Hotkeys.tsx:31` `label:'Проекты'`→`'Сделки'` (комбо `G P` оставить)
- `settings/SettingsContent.tsx:122` `['g → p','Проекты']`→`'Сделки'`

## Задача 2: Список / воронка / таблица

- `projects/ProjectsTable.tsx`:
  - `:99` колонка `key:'name'` → `label:'Проект'`→**`'Сделка'`** ← ИСПРАВЛЕНИЕ ревью
  - `:235` `<h1>Проекты</h1>`→`Сделки`; `:263` кнопка `Проект`→`Сделка`; `:315` CSV col `Проект`→`Сделка`
  - `:225` error, `:283` empty, `:292` bulk-confirm — «проект(ы)» → «сделк(и/у)»
  - НЕ трогать `:27/:73/:91` (фаза-трек)
- `projects/PipelineBoard.tsx`:
  - `:315` «Перетащи проект сюда»→«…сделку…»; `:585/:625` fallback/ошибка «проект(ов)»→«сделк(а/ок)»
  - `:645` watermark `ПРОЕКТЫ`→`СДЕЛКИ`; `:649` `<h1>Воронка проектов`→`Воронка сделок`
  - `:674` кнопка `Проект`→`Сделка`
- `projects/StageBoard.tsx:247,409,425,468,477,484` — drag-hint / confirm / empty / кнопки «проект(ы)»→«сделк(и)»

## Задача 3: Связи в других сущностях → «Сделки»

- `calls/CallModal.tsx:219` лейбл поля `Проект`→`Сделка`
- `meetings/MeetingModal.tsx:170` лейбл поля `Проект`→`Сделка`
- `contacts/ContactDetail.tsx:199` секция `Проекты`→`Сделки`; `:203` empty «Нет проектов…»→«Нет сделок…»
- `companies/CompanyDetail.tsx:178` секция `Проекты`→`Сделки`; `:182` `+ Проект`→`+ Сделка`; `:186` empty
- `shared/EntityTimeline.tsx:45` таб `label:'Проекты'`→`'Сделки'` (`key:'project'` оставить)
- `widgets/QuickActions.tsx:8` `label:'Проект'`→`'Сделка'` (href/icon оставить)

## Задача 4: Дашборд / аналитика / виджеты → «Сделки/Сделок»

- `layout/ActivityDrawer.tsx:223` `'Проектов'`→`'Сделок'`
- `widgets/TasksSidebar.tsx:176,202` `'проектов'/'Проектов'`→`'сделок'/'Сделок'`
- `dashboard/DashboardHome.tsx`:
  - `:150` FUJI watermark `'ПРОЕКТЫ'`→`'СДЕЛКИ'`
  - `:143/:158` display `label:'Проекты'`/`short`→`'Сделки'/'Сд'` — ⚠️ **ключ `'Активные проекты'` НЕ трогать** (lookup)
  - `:243` `label:'Активные проекты'`→`'Активные сделки'` (только если это display, не lookup-ключ — проверь)
  - `:720` `projects:'проект'`→`'сделка'`; `:818` «Создать проект →»→«Создать сделку →»
- `widgets/StatsWidget.tsx:76` «Активных проектов»→«Активных сделок»
- `widgets/FunnelWidget.tsx:27` «Воронка проектов»→«Воронка сделок»
- `analytics/Charts.tsx:198` «Проекты по фазам»→«Сделки по фазам»; `:215` `name="Проектов"`→`"Сделок"`
- `analytics/ExportPanel.tsx:118` `label:'Проекты'`→`'Сделки'` (`key:'projects'` оставить)
- `analytics/WeeklyReview.tsx:62,96` «Проектов продвинуто»/«проект(ов)»→«Сделок…»
- `companies/CompaniesTable.tsx:103` чип «Есть проекты»→«Есть сделки»
- `migration/VerificationPanel.tsx:17` `label:'Проекты'`→`'Сделки'` (`table:'projects'` оставить)

## Задача 5: Per-record строки — CONDITIONAL по `type` (не слепо!)

Правило: `type==='client'` → «сделка», `type==='internal'` → «проект».

- `projects/ProjectModal.tsx` (`currentType` / `editProject?.type`):
  - `:269` заголовок: client `editProject?'Редактировать сделку':'Новая сделка'` / internal — «…проект»
  - `:284` `Название проекта *` → client «Название сделки *» / internal «Название проекта *»
  - `:571` submit: client «Создать сделку» / internal «Создать проект»
  - `:303/:308/:326/:327` — селектор типа и подсказки PCT-1 **оставить**
- `projects/ProjectDetail.tsx`:
  - `:268` «Проект не найден» → «Сделка не найдена» (детально это client-путь) — можно без conditional
  - `:302` «Удалить проект?» → conditional (client «Удалить сделку?» / internal «Удалить проект?»)
  - `:318` back-link «Воронка проектов» → «Воронка сделок»
- `lib/utils/activity-events.ts:24` — **единый источник**: `'Проект обновлён'` → `'Сделка обновлена'`
  (это покрывает и DashboardHome-ленту; отдельно DashboardHome:748 не трогать, если он берёт отсюда)
- `lib/timeline/adapters.ts:108` — `` `Проект: ${p.name}` `` → conditional по `p.type`
  (`client` → `Сделка: …`, `internal` → `Проект: …`); если type не прокинут в row — прокинуть
- `lib/validators/project.ts:174` — message «Введи название проекта»: либо conditional, либо
  нейтрально «Введи название» (в discriminatedUnion conditional сложнее — допустимо нейтральное)
- `tasks/TaskCard.tsx:121` fallback «проект» → conditional по type задачи-проекта; если type
  недоступен — оставить нейтральным

## Cmd+K / палитра

- `shared/CommandPalette.tsx:45` `'/projects':'Проекты'`→`'Сделки'`; `:153` nav label→`'Сделки'`;
  `:186` `section:'Проекты'`→`'Сделки'`; `:329-330` placeholder «…проектам…»→«…сделкам…»
- Действие `act-project` уже «Новая сделка» — оставить.

## Осознанный временный компромисс (документировать)

`type='internal'` остаётся в разделе «Сделки» с бейджем «Внутренний» — до отдельного модуля
delivery-«Проекты». В этом заходе не выносим.

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
rm -rf .next && npm run build 2>&1 | tail -8
# Два прохода — остатки вне разрешённого:
grep -rnE "['\">][^'\"<]*Проект" src/components src/lib --include="*.tsx" --include="*.ts" \
  | grep -vE "//|project_id|projectId|getTrack|track_proj|phase_group|Доска задач"
grep -rnE "['\">][^'\"<]*проект" src/components src/lib --include="*.tsx" --include="*.ts" \
  | grep -vE "//|project_id|projectId|Внутренн|Тип проект|resolve_task"
```
Ручной чек: сайдбар «Сделки»; воронка «Воронка сделок» + watermark; список h1 «Сделки»;
Cmd+K навигация «Сделки»; поля «Сделка» в модалках звонка/встречи; **ProjectModal: client →
«Новая сделка», internal → «Новый проект»**; лента «Сделка обновлена» / «Сделка: …»;
empty-states в таблице/воронке/StageBoard; внутренний проект в списке с бейджем «Внутренний».

## КОММИТ

```bash
git add src/
git commit -m "chore(ui): раздел «Проекты» → «Сделки» (лейблы + per-record conditional по type; роут/схема/PCT-1 не тронуты)"
```

---

## VERIFICATION

```
Type Safety:            WARNING (tsc; правки строковые + conditional)
RLS Coverage:           NOT_APPLICABLE
Backward Compatibility: WARNING (роут /projects и идентификаторы сохранены; internal-записи
                         сохраняют «проект» через conditional; фаза-трек и PCT-1 не тронуты)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE
```

Трудоёмкость: **~1.5–2.5 ч** (полный охват + conditional-логика), риск низкий-средний (строк
много, per-record conditional требует аккуратности с `type`). Отдельная сущность delivery-
«Проекты» (воронки `entity_type='project'` уже в БД + доски PCT-1) — следующий D3-заход после
валидации ERP/IIoT-циклов.
