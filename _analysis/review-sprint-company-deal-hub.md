# Ревью: Sprint Company/Deal-Hub (`EntityTimeline` в CompanyDetail / ProjectDetail)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, crm-architect: `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-company-deal-hub.md` — встроить `<EntityTimeline>` в CompanyDetail и ProjectDetail, общий `openTimelineEvent`, composer заметок  
**Контекст:** Contact-Hub-A (done, `d2b7d96`); **этот спринт уже применён** `c776118` (2026-07-08); доработка заметок S-NOTES-TIMELINE-1 `a62ae94` (миграция 042); `architecture.md` уже описывает все три хаба

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Идея / продуктовый смысл (HubSpot-паттерн, единая лента) | ✅ |
| РАЗВЕДКА в промпте | 🟡 команды есть, но **факты устарели** |
| Таблицы/колонки (`calls`/`meetings`/`tasks`/`activity_log`/`ai_runs`, `company_id`/`project_id`) | ✅ |
| API `EntityTimeline` / `useEntityTimeline` | 🟡 в спринте неточный проп |
| Пути файлов | ✅ |
| Line-номера / «timeline'а НЕТ» / «931 стр.» | ❌ устарело |
| Скоуп «не трогать stage/гейты» | ✅ |
| Статус исполнения в репо | ❌ **уже сделано** — повторный запуск опасен |
| architecture.md post-gate | ✅ уже обновлён |
| learnings.md post-gate | 🟡 learning про «одну ленту + composer» в skill **не записан** (есть только в architecture) |

**Оценка: 3/10 как runnable sprint-промпт** (как архитектурный замысел в 2026-07-08 — ~8/10; как handoff на `main` сегодня — **stale / done**).  
**Рекомендация: не запускать в Claude Code.** Работа закрыта коммитом `c776118` (+ follow-up `a62ae94`). Повторное исполнение по этому тексту даст no-op / merge-конфликт / риск регресса на 904-строчном `ProjectDetail`.

---

## Статус (фактический в репо)

| Задача спринта | Статус в `main` | Доказательство |
|----------------|-----------------|----------------|
| 1. Company Hub: `<EntityTimeline entityType="company">` | ✅ done | `CompanyDetail.tsx:237` |
| 1. Связи Контакты/Сделки оставить | ✅ done | `CompanyDetail.tsx:153–228` |
| 1. `openTimelineEvent` общий хелпер | ✅ done | `src/lib/timeline/open-event.ts:29` |
| 2.1 ProjectDetail → unified timeline, `includeSystem` | ✅ done | `ProjectDetail.tsx:827–832` |
| 2.1 Снять `useTasks/useCalls/useMeetings` + useMemo | ✅ done | в `ProjectDetail` **нет** этих хуков |
| 2.2 Read-лента `ActivityTimeline` убрать, write-composer сохранить | ✅ done + улучшено | `ActivityTimeline` **удалён из `src/`**; `ActivityComposer` shared |
| 2.3 Stage board / гейты S27 не трогать | ✅ соблюдено | stage-логика на месте; timeline только в activity-tab |
| 3. Консистентность contact/company/deal | ✅ done | все три зовут `openTimelineEvent` |
| Post: architecture.md | ✅ | секции ProjectDetail + EntityTimeline (стр. ~214–347) |
| Post: learnings.md | 🟡 | в `learnings.md` отдельной записи нет (learning живёт в architecture) |
| Долг: org-fetch связей в CompanyDetail | 📌 open (осознанно) | `useContacts()` / `useProjects()` + client filter, `:37–38`, `:76–81` |

**Коммит исполнения (message = commit message из спринта):**  
`c776118` — `feat: Company/Deal Hub на EntityTimeline — …` (2026-07-08).

**Follow-up (выходит за исходный текст спринта, но меняет поведение company):**  
`a62ae94` S-NOTES-TIMELINE-1 — `ActivityComposer` на company/contact + `includeSystem: true` на всех трёх хабах (заметки через entity-links в `activity_log`).

---

## С чем согласен полностью

### 1. Продуктовая модель
Единая лента на company/deal + связи сбоку — верный HubSpot-паттерн. У сделки `includeSystem` (activity_log + ai_runs) + один composer — правильное решение против «двух лент».

### 2. Переиспользование Contact-Hub-A
Фундамент `useEntityTimeline` + `<EntityTimeline>` + серверный `.eq(col, id)` — корректен. Типы `TimelineEntityType = 'contact' | 'company' | 'project'` уже были готовы (`use-entity-timeline.ts:29`).

### 3. Осторожность с ProjectDetail
Главный риск («не сломать stage board / гейты S27») сформулирован верно; в реальном дифе `c776118` stage-логика не затронута (срез в основном списки + ActivityTimeline → composer).

### 4. Скоуп-границы
AI-роллапы, Tickets/Payments, company-level AI, полный вынос org-fetch связей — правильно «не сейчас».

### 5. Schema / индексы
Миграции в спринте нет (не нужны). FK-индексы timeline уже в **031** (schema.md). S-NOTES добавил **042** отдельно — вне этого промпта.

---

## Блокеры (критично — до запуска в CC)

### B1. Спринт уже исполнен — запускать нельзя
На `main` целевое состояние **уже есть**:

| Спринт утверждает | Живой код (`main`) |
|-------------------|--------------------|
| CompanyDetail «205 стр., timeline'а **НЕТ**» | **253** строки; `EntityTimeline` + `ActivityComposer` (`:230–238`) |
| ProjectDetail «931 стр.»; секции allTasks/allCalls/allMeetings ~380 | **904** строки; org-fetch списков **нет**; `EntityTimeline` + `ActivityComposer` (`:798–833`) |
| `openTimelineEvent` «вынести в `src/lib/timeline/`» | файл **есть** (`open-event.ts`, с 2026-07-08) |
| `ActivityTimeline` — оставить write, убрать read | компонент **удалён**; write → `ActivityComposer` |

Повторный прогон промпта = бессмысленный/опасный re-edit боевого `ProjectDetail`.

### B2. РАЗВЕДКА врёт line-номерами и «фактами»
Команды `sed -n '20,205p' CompanyDetail` / `248–340` / `378–430` ProjectDetail описывают **до-хабовое** состояние. CC, если «проверит» по тексту, а не по `grep`, будет интегрировать timeline **поверх уже встроенного**.

### B3. Неверный API пропа в инструкциях задач
Спринт:

```tsx
<EntityTimeline … includeSystem onOpenEvent={…} />
// и includeSystem={false}
```

Факт (`EntityTimeline.tsx:20–27`, `:67–68`):

```tsx
options?: UseEntityTimelineOptions;
// вызов:
<EntityTimeline … options={{ includeSystem: true }} onOpenEvent={…} />
```

Прямой проп `includeSystem` **не существует** — TS-ошибка при буквальном следовании.

---

## Предупреждения (желательно учесть, не блокируют «не запускать»)

### W1. Расхождение `includeSystem` для company
| | |
|--|--|
| Спринт | company: `includeSystem={false}` («тяжело и шумно») |
| `main` сейчас | **все три** хаба: `options={{ includeSystem: true }}` (Contact, Company, Project) |
| Причина | S-NOTES-TIMELINE-1: заметки на company/contact требуют activity_log в ленте |

Это **осознанный post-sprint pivot**, не баг. Промпт просто устарел; architecture.md уже отражает `includeSystem` на deal и company notes.

### W2. Org-fetch долг CompanyDetail — жив, как и разрешал спринт
`useContacts()` / `useProjects()` + filter в `useMemo`-стиле (`CompanyDetail.tsx:37–38`, `:76–81`) — **не** убраны. architecture.md (долг EntityTimeline) это фиксирует. Timeline при этом уже на серверном `company_id`. Отдельный микро-спринт, не re-run этого файла.

### W3. ContactDetailHub всё ещё org-fetch `useCalls` для upcoming/AI
Вне скоупа Company/Deal Hub, но architecture уже помечает долг Contact-Hub. Не путать с «сделка ещё тянет allCalls» — в ProjectDetail хуков calls/meetings/tasks **нет**.

### W4. learnings.md skill не обновлён
Спринт просил: «У сделки одна лента (EntityTimeline includeSystem) + composer…». Текст есть в `architecture.md` (Learning блок ~335–338), в `~/.claude/skills/crm-architect/references/learnings.md` отдельной записи **нет**. Косметика skill-sync, не код.

### W5. Composer на company — шире исходного скоупа
Исходный спринт: composer явно только для deal (write-часть ActivityTimeline). Сейчас `ActivityComposer` на company **и** contact (`CompanyDetail:236`, `ContactDetailHub:573`) — корректно после 042, но текст спринта этого не описывает.

### W6. `openTimelineEvent` + `project` → всегда `/deals/${id}`
`open-event.ts:32–36`: push на `/deals/…` с server backstop для delivery/internal. Работает, но при клике из company-ленты по delivery-проекту будет лишний redirect. Не блокер, известный routing-контракт P1.

---

## Пропущенные места / gaps относительно «живого» мира

Спринт как **TODO** gaps не имеет — работа сделана. Gaps = **устаревшие утверждения промпта**:

| Утверждение спринта | Реальность | Действие |
|---------------------|------------|----------|
| CompanyDetail 205 стр., без timeline | 253 стр., timeline + composer | пометить done / архив |
| ProjectDetail 931, allTasks~380 | 904, EntityTimeline:827+ | то же |
| `includeSystem` prop | `options.includeSystem` | если когда-либо править промпт |
| company `includeSystem=false` | `true` (S-NOTES) | то же |
| «ActivityTimeline с вводом» | файла нет; `ActivityComposer` | то же |
| git add только Company/Project/timeline | реальный c776118 + ContactDetailHub + use-entity-timeline | — |

**Файлы, которые «должен был» тронуть спринт — уже на месте:**

| Файл | Роль |
|------|------|
| `src/components/companies/CompanyDetail.tsx` | company hub |
| `src/components/projects/ProjectDetail.tsx` | deal hub |
| `src/lib/timeline/open-event.ts` | общий open |
| `src/lib/timeline/adapters.ts` | (Contact-A) |
| `src/components/shared/EntityTimeline.tsx` | presenter |
| `src/components/shared/ActivityComposer.tsx` | composer (post-hub extract) |
| `src/lib/hooks/use-entity-timeline.ts` | hook + describeEvent |
| `src/components/contacts/ContactDetailHub.tsx` | переведён на `openTimelineEvent` |

---

## Чеклист crm-architect (по промпту)

- [x] Есть РАЗВЕДКА  
- [x] Реальные table/column names  
- [x] Реальные пути (с поправкой на API props)  
- [ ] learnings gotchas отражены post-factum в skill learnings.md — 🟡  
- [x] Нет «применить миграцию из CC» (миграций в спринте нет)  
- [x] org_id/RLS не ломается (только UI + client queries с entity filter)  
- [x] CSS variables / theme — N/A  
- [x] schema.md — 031/042 уже в skill  
- [x] DELETE/CASCADE — N/A  
- [x] no `flowType: 'implicit'` — N/A  

---

## Предлагаемые правки в спринт (если файл оставлять в `_analysis/`)

1. **Шапка:** `STATUS: DONE (c776118, 2026-07-08). DO NOT RE-RUN.`  
2. Заменить «факты разведки» на текущие grep-якоря (`EntityTimeline` в CompanyDetail/ProjectDetail).  
3. Зафиксировать реальный API: `options={{ includeSystem: true }}`.  
4. Отметить post-work: S-NOTES-TIMELINE-1, `ActivityComposer` shared, company `includeSystem: true`.  
5. Открытый долг → отдельный микро-спринт: server-filter для `useContacts`/`useProjects` на CompanyDetail (и аналогичный долг ContactDetailHub).  
6. **Не** править код по этому промпту.

Альтернатива: переименовать/перенести в `_analysis/_to_delete/` или backlog «archive», чтобы watcher не предлагал re-review как pending sprint.

---

## Чеклист перед CC

- [x] ~~Исправить B1–B3~~ → **не запускать**  
- [ ] (опционально) Пометить файл `DONE` / убрать из pending watcher  
- [ ] (опционально) skill-sync: learning «одна лента + composer» → `learnings.md`  
- [ ] (отдельный спринт) org-fetch → server filter для связей CompanyDetail  
- [ ] Runtime-смок хабов **не обязателен** для этого промпта (уже в проде с 07-08); имеет смысл только при регрессии

---

## Итог одной строкой

**Промпт описывает работу, которая уже смержена (`c776118` + `a62ae94`); live-код и `architecture.md` это подтверждают — в Claude Code не отдавать.**
