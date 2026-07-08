# Claude Code Prompt — Sprint Contact-Hub-A: переиспользуемый `<EntityTimeline>` + Contact Hub

> База: оценка `_analysis/estimate-contact-hub.md` (Спринт A). Референс визуала — HubSpot
> contact record (Activities-таб), НО без буквального копирования (см. скоуп-границы).
> Фундамент без AI. AI-роллапы (Спринт B) — отдельно, поверх этого.
>
> **Ключевое решение:** timeline делаем СРАЗУ переиспользуемым `<EntityTimeline entityType entityId>`
> (контакт / компания / сделка), чтобы не переписывать под company/deal hub потом.

---

## РАЗВЕДКА (выполнить до изменений)

```bash
# 1. Текущий Contact Hub — что уже есть, как строит timeline (calls+projects, клиентская фильтрация)
sed -n '146,260p' src/components/contacts/ContactDetailHub.tsx

# 2. Форма хуков-источников: сейчас все тянут ВЕСЬ org-набор, фильтр на клиенте (useMemo)
grep -nE "queryKey|from\(|\.eq\(|select|staleTime" src/lib/hooks/use-calls.ts src/lib/hooks/use-meetings.ts src/lib/hooks/use-tasks.ts src/lib/hooks/use-activity-log.ts

# 3. Типы источников
grep -nE "export type|status|deadline|next_step|agreements" src/types/database.ts | grep -iE "call|meeting|task|activit|ai_run|transcript" | head -40

# 4. Как рендерятся модалки (переиспользуем для quick-actions из timeline)
grep -rn "CallModal\|MeetingModal\|TaskModal" src/components/contacts/ContactDetailHub.tsx
```

**Факты схемы (проверено через Supabase MCP 2026-07-07) — определяют дизайн адаптеров:**

| Источник | Привязка к контакту | Дата события |
|---|---|---|
| `calls` | прямой `contact_id` | `date` |
| `meetings` | прямой `contact_id` | `date` |
| `tasks` | прямой `contact_id` | `deadline` (+ overdue-логика) |
| `projects` | прямой `contact_id` | `created_at` / stage-changes |
| `activity_log` | **только `project_id`** → через связанные проекты контакта | `created_at` |
| `ai_runs` | **полиморфно `entity_type ∈ {call,meeting}`** → через звонки/встречи контакта | `created_at` |

Вывод: у прямых источников фильтр `.eq('contact_id', id)`. У `activity_log` и `ai_runs`
привязки к контакту НЕТ — они попадают в ленту транзитивно (через project_id / через
call|meeting_id контакта). Это НЕ «ещё один адаптер», а отдельная ветка сбора. **В MVP
Спринта A: activity_log и ai_runs в timeline контакта — опционально** (галочка ниже),
чтобы не раздувать. Прямые 4 источника — обязательны.

---

## АРХИТЕКТУРНОЕ РЕШЕНИЕ: где живёт агрегация

Текущий антипаттерн (унаследовать НЕ надо): `ContactDetailHub` тянет `useCalls()` (весь org),
фильтрует `useMemo`. Для 6 источников на одной карточке это 6 полных выборок org. На текущих
объёмах работает, но переиспользуемый timeline не должен тащить этот долг в company/deal.

**Делаем per-entity хук данных**, а компонент — тонкий:

```
src/lib/hooks/use-entity-timeline.ts
  useEntityTimeline(entityType: 'contact'|'company'|'project', entityId: string)
    → под капотом: параллельные запросы с СЕРВЕРНЫМ фильтром по нужной колонке
      (contact_id / company_id / project_id), НЕ клиентская фильтрация org-набора.
    → каждый источник маппится в общий TimelineEvent адаптером.
    → возвращает { events: TimelineEvent[], isLoading }.
```

Отдельные `queryKey` на источник+entity (`['timeline','call','contact',id]` и т.п.), staleTime
как у существующих хуков (60s). Realtime не обязателен в A (открытие карточки = свежий fetch).

---

## ЗАДАЧА 1: Общий тип и адаптеры

`src/types/timeline.ts`:

```ts
export type TimelineKind = 'call' | 'meeting' | 'task' | 'project' | 'activity' | 'ai_run';

export type TimelineEvent = {
  id: string;               // уникален в рамках ленты: `${kind}:${sourceId}`
  kind: TimelineKind;
  title: string;            // «Звонок выполнен», «Встреча: …», «Задача: …»
  date: string;             // ISO — единая ось сортировки
  detail?: string;          // подзаголовок: next_step / agreements / stage / срок
  status?: 'done' | 'pending' | 'overdue';  // для задач/звонков
  href?: string;            // клик → открыть сущность/модалку
  icon: TimelineKind;       // renderer выберет Lucide-икону
};
```

Адаптеры (чистые функции `Row → TimelineEvent`) в `src/lib/timeline/adapters.ts`:
- `callToEvent`, `meetingToEvent`, `taskToEvent` (overdue = `deadline < now && !done`),
  `projectToEvent`. Каждый — только маппинг, без запросов.
- Только текст в `title/detail` (XSS-гигиена как в S28: никакого dangerouslySetInnerHTML).

---

## ЗАДАЧА 2: `useEntityTimeline` (per-entity, серверный фильтр)

`src/lib/hooks/use-entity-timeline.ts`:

- Принимает `(entityType, entityId)`. Маппинг колонки фильтра:
  `contact → contact_id`, `company → company_id`, `project → project_id`.
- Параллельные `useQuery` на calls / meetings / tasks / projects с `.eq(<col>, entityId)`
  на СЕРВЕРЕ (не тянуть весь org). Для `project` источник projects=сама сущность — пропустить.
- Собрать все события, отсортировать `date desc`, отдать плоский массив + `isLoading` (OR по всем).
- **activity_log / ai_runs — за флагом `includeSystem` (default false в A):** если включат,
  activity_log грузится по `project_id ∈ (проекты сущности)`, ai_runs — по `entity_id ∈
  (звонки/встречи сущности)`. Реализовать структуру, но в UI Спринта A не активировать
  (иначе +2 запроса и join-логика; поднимем в B вместе с AI-роллапами).

---

## ЗАДАЧА 3: `<EntityTimeline>` — презентационный компонент

`src/components/shared/EntityTimeline.tsx`:

```tsx
<EntityTimeline entityType="contact" entityId={contactId} onOpenEvent={...} />
```

- Группировка: **Просрочено** (overdue tasks вверху) → **Этот месяц** → **Ранее**.
  (HubSpot: Overdue / July 2026 / …). Заголовки-группы серым, как в макете.
- Фильтр-табы: `Все · Звонки · Встречи · Задачи · Проекты` (клиентский фильтр по `kind` —
  данные уже в памяти). Не тянуть повторно.
- Каждое событие: Lucide-икона по kind, title, detail, дата справа, статус-чип для overdue.
  Клик → `onOpenEvent(event)` (родитель откроет нужную модалку по kind+id).
- Пустое состояние: «Пока нет активности» (без HubSpot-иллюстраций-заглушек).
- Только CSS-переменные, без emoji, скролл-контейнер как в модалках (`max-h`, `overflow-y-auto`).

---

## ЗАДАЧА 4: Встроить в Contact Hub

В `ContactDetailHub.tsx` заменить самодельный `timeline`-useMemo (calls+projects) на
`<EntityTimeline entityType="contact" entityId={contactId} onOpenEvent={handleOpenEvent} />`.

- `handleOpenEvent(e)`: switch по `e.kind` → открыть существующую модалку
  (CallModal / MeetingModal / TaskModal / router.push на проект). Модалки уже подключены.
- Убрать старый timeline-код и связанный useMemo (calls.slice(8) + projects) — заменён.
- `useCalls()`/`useProjects()`, если больше нигде в компоненте не нужны после замены —
  снять, чтобы не тянуть org-наборы зря. **Проверить: остальной UI (upcomingCall,
  linkedProjects, activeProject) их ещё использует — если да, оставить, но это долг на потом.**

---

## ЗАДАЧА 5: Правая колонка связей (HubSpot-стиль, урезанный)

Сворачиваемые карточки в сайдбаре Contact Hub:
- **Компании** (есть данные) — со счётчиком, primary-бейдж, ссылка на компанию.
- **Сделки** (=projects контакта) — счётчик, название, стадия-чип, ссылка. Пустое → «Нет сделок».
- **НЕ добавлять Tickets / Payments** — модели нет, пустые карточки = шум. Явно вне скоупа.
- **Вложения** — только если `project_files` реально доступны по контакту (через проекты);
  если нет прямой привязки — пропустить, не изобретать.

---

## ЗАДАЧА 6: Key-info по факту (не копия HubSpot)

- Ревизия сайдбара key-info: оставить реально заполняемые поля (owner, phone, city,
  company, last-touch). Убрать/не добавлять пустые демо-поля HubSpot
  (`Role in automation`, `Technical proficiency`, `Industry focus`).
- Last-touch индикатор (`useLastTouchMap` уже есть) — вынести наглядно (дней с касания,
  цвет по `touchLevel`). Это преимущество перед HubSpot, не прятать.

---

## Скоуп-границы Sprint A (НЕ делать сейчас)

- AI-роллапы контакта (Contact insights / Sentiment / Challenges) → **Спринт B**.
- Активация `activity_log` / `ai_runs` в ленте (структура заложена, UI-флаг off) → **B**.
- Company Hub / Deal Hub на базе `<EntityTimeline>` → отдельно (компонент уже готов к ним).
- Inbound/Outbound split, «Ask a question» → вне обоих спринтов (см. оценку §B3).
- Server-side пагинация ленты — не нужна на текущих объёмах; `.limit(50)` на источник.

---

## Проверки перед коммитом

1. `npx tsc --noEmit` + `npm run lint` — чисто.
2. Контакт с звонками/встречами/задачами → единая лента, верная сортировка, overdue вверху.
3. Фильтр-табы переключают без повторных запросов (Network — нет новых при смене таба).
4. Контакт без активности → пустое состояние, не спиннер навсегда.
5. Клик по событию открывает правильную модалку.
6. Network при открытии карточки: запросы с `?contact_id=eq...` (серверный фильтр),
   НЕ полная выборка `calls`/`meetings` без фильтра.
7. Смок переиспользования: временно вrender `<EntityTimeline entityType="project"
   entityId={...}>` на detail сделки — лента строится (доказательство, что абстракция рабочая).

## Коммит

```bash
git add src/types/timeline.ts src/lib/timeline/ src/lib/hooks/use-entity-timeline.ts \
        src/components/shared/EntityTimeline.tsx src/components/contacts/ContactDetailHub.tsx
git commit -m "feat: переиспользуемый EntityTimeline (contact/company/project) + Contact Hub — unified timeline (calls/meetings/tasks/projects), связи, key-info по факту; серверный фильтр вместо org-fetch"
```

## После (гейт Cowork / память)
- Обновить `architecture.md` (crm-architect): `<EntityTimeline>`, `useEntityTimeline`,
  адаптеры, паттерн per-entity серверного фильтра (замена клиентской фильтрации org-набора).
- Learnings: «timeline-источники — серверный фильтр по entity-колонке, не тянуть org и
  фильтровать в useMemo (старый паттерн ContactDetailHub)».
- Если covering-индексы под `contact_id`/`company_id` на calls/meetings/tasks отсутствуют
  (advisors уже жаловался на unindexed FK) — добавить миграцией; сверить advisors.
