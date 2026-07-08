# Claude Code Prompt — Sprint Company/Deal-Hub: `<EntityTimeline>` в CompanyDetail и ProjectDetail

> База: Sprint Contact-Hub-A (done) — `<EntityTimeline entityType entityId>` + `useEntityTimeline`
> уже переиспользуемы (contact/company/project), reuse доказан рантайм-смоком на сделке.
> Задача: встроить их в две СУЩЕСТВУЮЩИЕ detail-страницы. НЕ строить с нуля, НЕ переписывать
> целиком. Точечная интеграция + замена унаследованного org-fetch антипаттерна.

---

## РАЗВЕДКА (до изменений)

```bash
# 1. CompanyDetail (тонкий, 205 стр., timeline'а НЕТ) — контакты+проекты списками, org-fetch
sed -n '20,205p' src/components/companies/CompanyDetail.tsx

# 2. ProjectDetail (931 стр., богатый) — ДВА болевых места:
#    (а) ActivityTimeline (стр. ~272) — лента activity_log с полем ВВОДА комментария
#    (б) allTasks/allCalls/allMeetings (стр. ~380) — org-fetch + клиентский фильтр (антипаттерн)
sed -n '248,340p' src/components/projects/ProjectDetail.tsx
sed -n '378,430p' src/components/projects/ProjectDetail.tsx

# 3. Подтвердить API готового timeline
grep -nE "export function useEntityTimeline|includeSystem|TimelineEntityType" src/lib/hooks/use-entity-timeline.ts
grep -nE "export function EntityTimeline|renderAction|onOpenEvent" src/components/shared/EntityTimeline.tsx
```

**Факт (проверено):** `useEntityTimeline(entityType, entityId, {includeSystem})` работает для
всех трёх типов. Для `project`: `activity_log` фильтруется по `project_id=id` напрямую,
`ai_runs` — по звонкам/встречам сделки. Для `company`: транзитивно через проекты компании.

---

## ЗАДАЧА 1: Company Hub (CompanyDetail — чистая добавка)

Timeline'а сейчас нет — добавляем, ничего не ломая.

- Вмонтировать `<EntityTimeline entityType="company" entityId={companyId} onOpenEvent={…} />`
  основной секцией страницы. `includeSystem={false}` в этом спринте (у компании это ленты
  всех её проектов — тяжело и шумно; поднимем позже при желании).
- `handleOpenEvent` — тот же switch, что в ContactDetailHub (call/meeting/task → модалка,
  project → router.push). Переиспользовать логику, не копипастить целиком — если она в
  ContactDetailHub локальна, вынести хелпер `openTimelineEvent(event, { router, setModals })`
  в `src/lib/timeline/` и звать из обоих хабов.
- Существующие карточки Контакты/Проекты компании — ОСТАВИТЬ как связи (правая/боковая
  колонка), это HubSpot-паттерн ассоциаций. Не удалять.
- `useContacts()/useProjects()` тут org-fetch + клиентский фильтр — если правишь секцию,
  переведи на серверный фильтр по `company_id` (как в Sprint A). Если это раздувает диф —
  оставь, помечен долгом; timeline важнее.

---

## ЗАДАЧА 2: Deal Hub (ProjectDetail — замена антипаттерна, аккуратно)

ProjectDetail большой и делает много (stage board, гейты). **Трогаем ТОЛЬКО ленту/списки,
остальное не касаем.**

### 2.1 Заменить разрозненные списки на unified timeline
- Секции, которые сейчас строятся из `allTasks/allCalls/allMeetings` (org-fetch + useMemo
  `projectTasks/projectCalls/projectMeetings`), заменить на
  `<EntityTimeline entityType="project" entityId={projectId} includeSystem onOpenEvent={…} />`.
- `includeSystem` здесь **включить**: у сделки `activity_log` — её собственный журнал,
  `ai_runs` — AI-протоколы по её звонкам, всё это центрально для карточки сделки.
- Снять теперь-ненужные `useTasks()/useCalls()/useMeetings()` + их useMemo, ЕСЛИ они больше
  нигде в компоненте не используются (проверить: stage-логика/гейты могут их дёргать —
  тогда оставить, пометить долгом).

### 2.2 Судьба `ActivityTimeline` (лента комментариев с вводом)
Это НЕ то же, что EntityTimeline: `ActivityTimeline` даёт ПОЛЕ ВВОДА для ручного
комментария (`useLogActivity` пишет в `activity_log`). Решение:
- **Read-часть** (список записей activity_log) — теперь дублируется unified timeline'ом
  (`includeSystem` тянет activity_log). Старый read-список убрать.
- **Write-часть** (поле «добавить комментарий») — СОХРАНИТЬ как компактный composer над/под
  лентой. Новый комментарий пишется в `activity_log` → после инвалидации появляется в
  unified timeline. То есть: один composer + одна общая лента, вместо двух разных лент.
- Итог: у сделки одна лента событий (звонки/встречи/задачи/AI/лог) + строка добавления
  заметки. Это и есть HubSpot-поведение.

### 2.3 Что НЕ трогать
- Stage board, гейты S27, probability, чеврон стадий, lost-handling — вне скоупа.
- Правая колонка связей (контакт/компания сделки) — если есть, оставить.

---

## ЗАДАЧА 3: Консистентность (оба хаба)

- `openTimelineEvent` — общий хелпер (Задача 1), чтобы contact/company/deal открывали
  события одинаково. Единственный источник маппинга kind→действие.
- Пустые состояния/группировка/табы приходят из `<EntityTimeline>` — не дублировать.
- Никаких Tickets/Payments, никаких пустых демо-полей (как в Sprint A).

---

## Скоуп-границы (НЕ сейчас)

- AI-роллапы уровня компании/сделки (аналог Contact insights) → вместе со Спринтом B.
- `includeSystem` для company (ленты всех проектов) → позже, если попросят.
- Полный вынос org-fetch хуков, если завязаны на stage-логику ProjectDetail → отдельный
  рефактор-долг, не в этом спринте.
- Company/Deal AI, Inbound/Outbound, «Ask a question» → вне скоупа.

---

## Проверки перед коммитом

1. `npx tsc --noEmit` + `npm run lint` — чисто (учесть pre-existing warnings, не добавлять новые).
2. **Company Hub:** открыть компанию с проектами/звонками → единая лента, серверный фильтр
   `company_id=eq…` в Network, табы без рефетча, клик по событию → модалка.
3. **Deal Hub:** открыть сделку → лента событий (звонки+встречи+задачи+**activity_log**+
   **ai_runs**, т.к. includeSystem); добавить комментарий → появляется в ленте; старой
   дублирующей activity-ленты нет; stage board/гейты работают как раньше (регресс-чек).
4. **Network Deal:** запросы с `project_id=eq…` (серверный фильтр), НЕ голые `calls`/`meetings`.
5. Прогон по контакту (Sprint A) не сломан — тот же `<EntityTimeline>`.

Runtime-чеки #2–#4 — браузером (Chrome MCP), как в Sprint A. Особое внимание: не сломать
stage board / гейты в ProjectDetail (регресс на 931-строчном файле — главный риск спринта).

## Коммит

```bash
git add src/components/companies/CompanyDetail.tsx src/components/projects/ProjectDetail.tsx \
        src/lib/timeline/
git commit -m "feat: Company/Deal Hub на EntityTimeline — единая лента событий (сделка: +activity_log/ai_runs, composer заметок), связи; общий openTimelineEvent"
```

## После (гейт / память)
- architecture.md (crm-architect): `<EntityTimeline>` теперь на всех трёх хабах,
  `openTimelineEvent` — общий маппинг, `includeSystem` включён для сделки.
- Learnings: «У сделки одна лента (EntityTimeline includeSystem) + composer в activity_log,
  не две разные ленты».
- Если ProjectDetail сохранил org-fetch хуки из-за stage-логики — записать как явный
  рефактор-долг, чтобы не потерялся.

## Главный риск (проговорить в PR)
ProjectDetail — 931 строка с боевой stage-логикой и гейтами S27. Замена лент не должна
задеть переходы стадий. Если границы между «лентой» и «stage-логикой» в коде размыты —
СТОП, показать место, не рефакторить вслепую.
