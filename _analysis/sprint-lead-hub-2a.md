# Claude Code Prompt — Sprint LEAD-HUB-2a: карточка лида и лид в ленте активности

Второй спринт варианта B (`_analysis/leads-entity-design.md`). LEAD-CORE-1 применён
гейтом 2026-08-10 (117–119 в проде, типы регенерированы, ветка в `main`).

Здесь — **ядро карточки**: лид становится сущностью серверной ленты и получает
страницу `/leads/[id]`. Аналитика лидов, предзаполнение конверсии и остальные
поверхности — LEAD-HUB-2b, **в этом спринте не трогать**.

## Границы

- Миграция пишется и коммитится, **не применяется**. Применяет гейт Cowork.
- `supabase.gen.ts` руками не править. Реген — на гейте (миграция меняет только
  тело функции, набор колонок тот же ⇒ **реген, скорее всего, не понадобится**;
  решает гейт).
- `meetings.lead_id` / `ai_runs` по лиду — вне скоупа (у лида нет транскриптов до
  звонков, встреча до квалификации — редкость). Решение зафиксировано в дизайне.

## РАЗВЕДКА

```sql
-- Номер следующей миграции: ledger целиком, не ls папки
select version, name from supabase_migrations.schema_migrations order by version desc limit 6;
```
Ожидание на 2026-08-10: последняя — `20260810084635 convert_lead_history` (119),
файл `116_cleanup_orphan_import_tasks.sql` и ветка `fix/cleanup-116-rescope` ещё
ждут гейта ⇒ **следующий свободный номер файла — 120**. Сверить, не занял ли его
кто-то, пока спринт лежал.

```sql
-- Живое тело функции — источник для правки (НЕ файл 115, там могли быть правки гейта)
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='entity_timeline' and p.prokind='f';
```

```bash
grep -n "TimelineEntityType" -r src/ | head -20
grep -n "PARENT_TYPES\|isParentType" src/lib/timeline/rpc-adapter.ts
grep -n "parentType" src/types/timeline.ts src/lib/timeline/kind-meta.ts
grep -n "Entity\b\|FK_KEY" src/components/shared/ActivityComposer.tsx
grep -n "project_id?\|contact_id?\|company_id?" src/lib/hooks/use-activity-log.ts
```

Факты, снятые разведкой 2026-08-10 (сверить, что не разъехались):

| Что | Где | Сейчас |
|---|---|---|
| Тип сущности ленты | `use-entity-timeline.ts:45` | `'contact' \| 'company' \| 'project' \| 'org'` |
| Домен parent'а | `rpc-adapter.ts:61-67` `PARENT_TYPES` | `['project','company','contact']` |
| Домен parent'а в типе | `types/timeline.ts:58` | `'project'\|'company'\|'contact'\|null` |
| Ссылка на parent | `kind-meta.ts:46-57` `parentHref` | fallthrough в `/contacts/` |
| Композер заметки | `ActivityComposer.tsx:15-21` | `Entity` + `FK_KEY` без лида |
| Запись в журнал | `use-activity-log.ts:46-48,69-71` | принимает только project/contact/company |
| Заголовок страницы | `ContentHeader.tsx:14-28` | **`/leads` отсутствует** ⇒ «Дашборд» |
| Цвет раздела | `section-colors.ts:7` | `/leads` есть, `/leads/<id>` резолвится сам |
| Хук одного лида | `use-leads.ts` | **нет** — `useLeads()` режет `converted` (`.neq` L18) |
| Страница | `app/(dashboard)/leads/` | только `page.tsx`, `[id]` нет |
| Лид в палитре | `CommandPalette.tsx:299-311` | есть, но `href: '/leads'` плоский (L306) |
| Секция лидов в Today | `TodayView.tsx:288-312` | есть, `onOpen` → `/leads` (L305) и `flatRows` L180 |

---

## ЗАДАЧА 1 — Миграция 120: ветка `lead` в `entity_timeline`

`supabase/migrations/120_lead_timeline.sql`. Берётся **живое тело** из разведки,
правки точечные.

**`create or replace`, БЕЗ `drop function`.** В 115 `drop` стоял потому, что менялся
набор возвращаемых колонок (`42P13`); здесь колонки и аргументы те же — `replace`
сохранит гранты и не уронит зависимости.

### 1.1 Предикат сущности — шесть веток union

В `src_calls`, `src_tasks`, `src_activity` (прямая ветвь) дописать к существующему
`or (p_entity_type = 'contact' and …)` ещё один конъюнкт:

```sql
     or (p_entity_type = 'lead' and c.lead_id = p_entity_id)   -- src_calls
     or (p_entity_type = 'lead' and t2.lead_id = p_entity_id)  -- src_tasks
     or (p_entity_type = 'lead' and al.lead_id = p_entity_id)  -- src_activity
```

`src_meetings`, `src_projects`, `src_ai` — **не трогать**: у `meetings`/`projects`/
`ai_runs` колонки `lead_id` нет (118 её не заводила), лишний предикат упал бы `42703`.
CTE `scope_projects` / `scope_children` тоже не трогать — они про company/contact.

### 1.2 `parent_type` — лид добавляется ПОСЛЕДНИМ

В `src_calls` и `src_tasks` (и в `src_activity`, где та же конструкция) `case`/`coalesce`
дополняются лидом **в самом конце**:

```sql
         case when c.project_id is not null then 'project'
              when c.company_id is not null then 'company'
              when c.contact_id is not null then 'contact'
              when c.lead_id    is not null then 'lead'   -- ← последним
         end as parent_type,
         coalesce(c.project_id, c.company_id, c.contact_id, c.lead_id) as parent_id,
```

⚠️ Порядок здесь — не косметика, а поведение. `convert_lead` (119) проставляет
звонку `project_id`, а `lead_id` намеренно оставляет. Поставь лид первым — и после
конверсии звонок в общей ленте показывал бы родителем лид вместо сделки, то есть
ссылку в прошлое. Последним: до конверсии родитель — лид (иначе события вовсе без
родителя), после — сделка. Порядок в `case` и `coalesce` обязан совпадать —
предупреждение уже стоит в теле функции.

### 1.3 Комментарий функции

`comment on function` дополнить: `p_entity_type` теперь принимает `lead`; источники
для лида — `calls`/`tasks`/`activity_log` (у `meetings`/`projects`/`ai_runs` нет
`lead_id`); `parent_type='lead'` возможен только у событий неконвертированного лида.

### 1.4 Проверка (в спринте — только чтение, apply у гейта)

Готовые SELECT'ы приложить в конец файла закомментированными — гейт прогонит их
после apply:

```sql
-- select * from public.entity_timeline('lead', '<lead_id>'::uuid) order by ts desc;
-- select kind, parent_type, count(*) from public.entity_timeline('org') group by 1,2;
```

---

## ЗАДАЧА 2 — Клиентский контур ленты: восемь точек

Все правки — расширение домена, ни одна не меняет поведение существующих хабов.

1. **`use-entity-timeline.ts:45`** — `TimelineEntityType` += `'lead'`.
   `enabled` (L123) правки не требует: у лида всегда есть `entityId`.
2. **`rpc-adapter.ts:61`** — `PARENT_TYPES` += `'lead'`. Без этого `isParentType`
   вернёт `false` и родитель молча схлопнется в `null` — тихая потеря, не ошибка.
3. **`types/timeline.ts:58`** — `parentType?: 'project'|'company'|'contact'|'lead'|null`.
4. **`kind-meta.ts:46`** — `parentHref` += ветка лида **до** финального fallthrough:
   ```ts
   if (parentType === 'lead') return `/leads/${parentId}`;
   return `/contacts/${parentId}`;
   ```
   Сейчас `'lead'` провалился бы в `/contacts/<id лида>` — ссылка на несуществующий контакт.
5. **`ActivityComposer.tsx:15-21`** — `Entity` += `'lead'`, `FK_KEY.lead = 'lead_id'`.
6. **`use-activity-log.ts:46-48,69-71`** — входной тип += `lead_id?: string`, раскладка
   в insert += `lead_id`. Иначе заметка на карточке лида уйдёт без привязки и не
   вернётся в его ленту.
7. **`use-entity-timeline.ts`, `useParentNameMap` (L230-246)** — добавить лидов
   (`useLeads()`), иначе в org-ленте у событий лида будет ссылка без имени.
   ⚠️ `useLeads()` режет `converted` — для карты имён это приемлемо (у сконвертированных
   parent уже сделка), но комментарий об этом оставить.
8. **`KIND_META` не трогать** — лид не новый `kind`, он сущность-владелец ленты.

---

## ЗАДАЧА 3 — Хук одного лида

`use-leads.ts` += `useLead(id: string | null | undefined)`:

- `queryKey: ['leads', 'one', id]` — **не** переиспользовать `['leads']`: список
  отфильтрован `.neq('status','converted')`, и конвертированный лид по прямой ссылке
  из него не достанется. Это ровно тот случай, ради которого страница и заводится.
- `.select('*').eq('id', id).maybeSingle()`, `enabled: Boolean(id)`, `staleTime` как у списка.
- `useUpdateLead` дополнить инвалидацией `['leads','one', id]` — иначе правки на
  карточке не видны до перезахода. Оптимистику списка не ломать.

---

## ЗАДАЧА 4 — Страница `/leads/[id]`

**`src/app/(dashboard)/leads/[id]/page.tsx`** — серверный компонент по образцу
`contacts/[id]/page.tsx` (13 строк): auth-гард → `const { id } = await params` →
`<LeadDetail leadId={id} />`. Бэкстопов на тип, как в `deals/[id]`, здесь не нужно.

**`src/components/leads/LeadDetail.tsx`** — клиентский. Не клон `ProjectDetail`
(54 КБ): лид живёт дни, экран должен читаться за пять секунд. Сверху вниз:

1. **Шапка**: заголовок + бейдж источника + температура; справа — «Ред.» (LeadModal)
   и «Конвертировать» для `qualified`. Для `converted` — вместо действий ссылка
   «К сделке» (`converted_deal_id`) и вся карточка read-only.
2. **Степпер статусов** — Новый → Контакт → Квалифицирован (→ Конвертирован).
   `disqualified` — терминальная ветка отдельной меткой с причиной, не колонка степпера.
   Действия те же, что на карточке канбана (`LeadsView`), логику брать оттуда, не дублируя
   мутации.
3. **Фокус-панель** — паттерн `DealFocusPanel`: следующий шаг + дата через `InlineEdit`,
   просроченная дата красным («шаг просрочен N дн.»), рядом SLA-метка из
   `leadStaleness()` (`constants/leads.ts`) и дни от `first_contacted_at`.
4. **Квалификация** — боль, бюджет, роль контакта, ЧЗ-группы, дедлайн маркировки,
   оценка суммы. Показывать бейдж «маркировка обязательна через N мес.», когда
   `regulatory_deadline` ≤ 12 мес.
5. **Активность** — `<EntityTimeline entityType="lead" entityId={id} onOpenEvent={…} />`
   + `<ActivityComposer entityType="lead" entityId={id} />` + кнопки «+Звонок»
   (`openModal('call', undefined, { leadId })`) и «+Задача».
   `onOpenEvent` — через готовый `openTimelineEvent`, свой маппинг не писать.

⚠️ `ui-store.openModal` третьим аргументом принимает `{contactId?, companyId?, projectId?}` —
добавить `leadId?`, и `GlobalModals` пробросить в `defaultLeadId` у `CallModal`
(проп уже есть с LEAD-CORE-1) и в `TaskModal`.

**`ContentHeader.tsx:14-28`** — `PAGE_TITLES` += `'/leads': 'Лиды'`. Сейчас раздела
там нет вовсе, и `/leads/<id>` резолвится в «Дашборд». `section-colors.ts` править
не нужно — `/leads` там есть, префиксная логика подхватит `[id]` сама.

---

## ЗАДАЧА 5 — Снять костыль `?lead=<id>`

`LeadsView.tsx`: удалить эффект deep-link (`leadParam`, `handledLeadParam`,
`clearLeadParam`, `router.replace('/leads')`) и его комментарии — они описывают
приём, которого больше нет.

- `peek.href` → `/leads/${l.id}` (было `/leads?lead=${l.id}`).
- `peekSuppressed` оставить как есть — модалки на списке никуда не делись.
- **Совместимость**: старые ссылки не ломать. В `LeadsView` — один эффект:
  `?lead=<id>` ⇒ `router.replace('/leads/' + id)`. Три строки вместо тридцати.

`CommandPalette.tsx:306` — `href: '/leads'` → `` `/leads/${l.id}` `` (как у компаний L256
и контактов L267).

`TodayView.tsx` — секция «Лиды без реакции» уже есть: `onOpen` (L305) и `flatRows`
(L180) → `/leads/${l.id}`. Порядок `flatRows` и смещения `off*` **не трогать** —
они завязаны на порядок секций в JSX.

---

## ЗАДАЧА 6 — Тесты

`tests/unit/`:

- `lead-timeline.test.ts` — `parentHref('lead', id) === '/leads/'+id`;
  `rpcRowToEvent` со строкой `parent_type='lead'` отдаёт `parentType: 'lead'`
  (регресс-тест на пункт 2.2: без правки `PARENT_TYPES` тест ловит тихий `null`).
- Существующий `lead-peek.test.tsx` — обновить, если поменялся `href` в peek.

---

## Проверки

```bash
npx tsc --noEmit
npx eslint src --ext .ts,.tsx     # 14 ошибок = baseline проекта, новых быть не должно
npx vitest run
npm run build                     # ПОСЛЕДНИМ — убивает next dev
```

Ручной смок на dev (миграция ещё не применена ⇒ **лента лида будет пустой/ошибкой** —
это ожидаемо, проверяется всё остальное): страница открывается по клику из канбана,
таблицы, палитры и «Сегодня»; степпер двигает статус; фокус-панель пишет шаг;
`?lead=<id>` редиректит на карточку; конвертированный лид открывается и даёт ссылку
на сделку; существующие ленты контакта/компании/сделки не изменились.

## КОММИТ

```bash
git checkout -b feat/lead-hub
git add supabase/migrations/120_lead_timeline.sql src/ tests/ docs/schema.md crm-architect/
git commit -m "Sprint LEAD-HUB-2a: карточка лида /leads/[id], лид в серверной ленте активности"
```

`docs/schema.md` тем же PR: раздел `entity_timeline` — новый `p_entity_type='lead'`,
источники, правило «лид в parent_type последним», статус «НАПИСАНА, НЕ ПРИМЕНЕНА»
(переведёт гейт). `crm-architect/references/architecture.md` — карточка лида в списке
хабов + строка про `TimelineEntityType`.

## Гейту

apply 120 → проверить `entity_timeline('lead', …)` на живом лиде со звонком →
`entity_timeline('org')` не потеряла события (сравнить counts по kind до/после) →
advisors (изменений не ждём: колонок и политик миграция не трогает) → реген типов
нужен, только если поменялась сигнатура (не должна).
