# Claude Code Prompt — Sprint S-QUEUE-1: очередь дня — разделить и отложить

**Ветка:** `feat/queue-snooze`
**Миграция ЕСТЬ** — одна новая org-таблица `queue_snoozes`. **Пишется и коммитится, не
применяется**: apply делает гейт Cowork через Supabase MCP.
**Основание:** `improvements/deals-audit-benchmark-2026-08-23.md`, R-3 (Pipedrive Pulse:
триада очередей + «Hide suggestion»; folk Follow-up Assistant; Close Inbox).

---

## Зачем и почему НЕ так, как написано в отчёте

Отчёт предлагал «триаду вкладок Follow-ups / Упущенные / Новые». Разведка показала, что
буквальный перенос ухудшил бы экран: `TodayView` — **не одна лента**. В нём уже семь
специализированных секций (просроченные звонки · звонки сегодня · лиды · задачи «сейчас» ·
гниющие сделки · остывающие контакты · встречи дня), сквозная клавиатурная навигация j/k по
плоской очереди `flatRows` и личный фильтр «моё» на звонках. Это структурнее, чем фид
Pipedrive, и три вкладки поверх этого разрушили бы и специализацию секций, и `flatRows`.

Переносим из Pulse то, чего у нас действительно нет:

| Что | Сейчас | Данные на 23.08 |
|---|---|---|
| **Разделение «просрочено» и «нет плана»** | одна секция «гниющие сделки» (`getDealHealth !== 'ok'`) | **7** сделок с просроченным шагом и **2** вообще без плана лежат вперемешку |
| **«Скрыть до завтра»** | нет вовсе — строка висит, пока не сделаешь | вся очередь: 13 строк |
| **Каунтеры по секциям** | только общий `total` в шапке | — |

Остальная очередь сегодня: 3 задачи «сейчас», 1 лид, 0 звонков, 0 встреч — экран живой,
фича проверяема сразу.

### Почему разделение важнее косметики

«Шаг просрочен» и «шага нет» требуют **разных действий**: первое — сделать или перенести
обещание, второе — впервые спланировать. В одной секции они читаются как один упрёк, и
именно поэтому 9 из 10 сделок выглядят одинаково безнадёжно. Ровно то же различение мы уже
провели на карточке в S-HEALTH-V2-1 (сигнал `next_step`: `bad` против `warn`) — очередь дня
обязана говорить на том же языке, иначе список и карточка снова разойдутся.

### Что НЕ входит

- Вкладки-срезы поверх секций (см. выше — осознанный отказ).
- Snooze по клавише: `use-keyboard-nav` знает `Enter` (открыть) и букву (`onAction`);
  третьего действия у него нет, и расширять хук ради одной кнопки в этом спринте не будем.
  Мышь — да, клавиша — следующим заходом, если понадобится.
- Snooze для звонков, встреч и задач: у них есть свои механики переноса (`bump` на завтра,
  дедлайн, lane). Откладываем только **сделки, лиды и остывающие контакты** — там переноса нет.
- Изменение `getDealHealth` и порогов: спринт про подачу, не про формулу.

### Красные линии

- ⛔ **Миграцию не применять.** Файл в `supabase/migrations/`, коммит — и всё. Apply, реген
  типов, advisors и ролевые смоки — операция гейта.
- ⛔ **Номер миграции — запросом к `supabase_migrations.schema_migrations`**, не из `ls`
  папки. Последняя применённая на 23.08 — `20260822100301`; имя файла новой — с бóльшим
  timestamp по конвенции проекта.
- ⛔ **`src/types/database.ts` и `supabase.gen.ts` руками не править.** До регена типов
  новая таблица описывается **локальным типом в хуке** (`QueueSnoozeRow`), а запросы к ней
  идут через `supabase.from('queue_snoozes' as never)` с приведением результата — стаб
  снимает владелец вместе с регеном. В отчёте явно указать, что стаб есть и где.
- ⛔ **Ownership — `created_by`, НЕ `user_id`** (конвенция проекта; `activity_log.user_id` —
  исключение, там это актор журнала).
- ⛔ **Клавиатурная навигация не должна поехать.** `flatRows` собирается в том же порядке,
  что секции в JSX, а смещения (`offTodayCalls`, `offLeads`, …) считаются вручную. Добавление
  секции — правка **обоих** мест; расхождение даёт «j/k открывает не ту строку», и это не
  ловится ни tsc, ни тестами.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm

# 1. Номер следующей миграции — ТОЛЬКО отсюда (через Supabase MCP на гейте; локально — глазами)
ls -1 supabase/migrations | tail -5

# 2. Образец org-таблицы с личной видимостью: 092 (deal_stakeholders)
grep -rn "deal_stakeholders" supabase/migrations/*.sql | head -3
sed -n '1,80p' "$(grep -rln 'create table.*deal_stakeholders' supabase/migrations/*.sql | head -1)"

# 3. Точки правки очереди
grep -n "rottingDeals\|flatRows\|offDeals\|offCooling\|const total" src/components/today/TodayView.tsx
sed -n '1,50p' src/components/today/QueueRow.tsx

# 4. Паттерн оптимистичной мутации + realtime
sed -n '100,180p' src/lib/hooks/use-deal-stakeholders.ts

# 5. Убедиться, что таблицы ещё нет
grep -rn "queue_snoozes" src/ supabase/ || echo "OK: имя свободно"
```

---

## ЗАДАЧА 1 — Миграция `queue_snoozes` (пишем, НЕ применяем)

Файл `supabase/migrations/<timestamp>_queue_snoozes.sql`. Конвенции новой org-таблицы —
из памяти проекта, соблюсти все:

```sql
create table if not exists public.queue_snoozes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  entity_type text not null check (entity_type in ('deal','lead','contact')),
  entity_id   uuid not null,
  -- До какого ДНЯ включительно строка скрыта. Дата, не timestamptz: «до завтра» —
  -- календарное обещание, а не 24 часа от клика.
  until       date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Одна отложенная строка на человека и сущность: повторный snooze ПРОДЛЕВАЕТ,
-- а не плодит вторую (клиент делает upsert по этому ключу).
create unique index if not exists queue_snoozes_owner_entity_uniq
  on public.queue_snoozes (created_by, entity_type, entity_id);

-- Рабочий запрос всегда «мои активные на сегодня».
create index if not exists queue_snoozes_active_idx
  on public.queue_snoozes (created_by, until);
```

Дальше — обязательная обвязка:

- `alter table public.queue_snoozes enable row level security;`
- `revoke all on public.queue_snoozes from anon;` + явные гранты `authenticated`;
- триггер `updated_at` на существующую `public.update_updated_at()` (имя именно такое);
- **заморозка org_id вручную**: `create trigger trg_aa_freeze_org_id before update of org_id …
  execute function freeze_org_id()` — автоцикл 054 покрыл только таблицы, существовавшие на
  его момент;
- `trg_set_org_id` (BEFORE INSERT) — как у прочих org-таблиц, чтобы клиент не слал `org_id`.

**RLS — org-граница первым конъюнктом, личная видимость вторым.** Snooze — это **личное**
состояние очереди: чужое «отложить» не должно прятать строку у коллеги.

```sql
create policy queue_snoozes_select on public.queue_snoozes for select
  using (org_id = (select public.current_org_id()) and created_by = (select auth.uid()));
-- insert/update/delete — тем же предикатом (WITH CHECK = USING на insert/update).
```

⚠️ Вызовы `current_org_id()` — в initplan-обёртке `( select … )`, иначе планировщик зовёт
функцию построчно.

В `docs/schema.md` добавить раздел таблицы со статусом **«НАПИСАНА, НЕ ПРИМЕНЕНА»** — статус
переведёт гейт после apply, в том же заходе.

---

## ЗАДАЧА 2 — Хук `src/lib/hooks/use-queue-snooze.ts`

```ts
export interface QueueSnooze {
  id: string;
  entity_type: 'deal' | 'lead' | 'contact';
  entity_id: string;
  until: string;   // YYYY-MM-DD
}
```

- `useQueueSnoozes()` — только **активные**: `.gte('until', localDateKey())`. Ключ
  `['queue_snoozes']`. Возвращает и сырой список, и `Set` ключей `type:id` для дешёвой
  проверки в фильтрах;
- `useSnooze()` — upsert по `(created_by, entity_type, entity_id)` с `until = завтра`
  (`localDateKey(new Date(Date.now() + 86400000))`, тот же хелпер, что уже зовёт TodayView);
- `useUnsnooze()` — удаление по id;
- обе мутации **оптимистичные с rollback** (паттерн `use-deal-stakeholders`), инвалидация
  ключа в `onSettled`;
- realtime не вешать: таблица новая и в публикацию не добавляется — очередь и так
  перечитывается при мутациях, а второй пользователь чужие snooze не видит по построению;
- ⚠️ **типы**: до регена — локальный интерфейс + `from('queue_snoozes' as never)`; в шапке
  файла комментарий «стаб до регена типов, снимается вместе с apply миграции».

---

## ЗАДАЧА 3 — TodayView: две секции вместо одной + «Отложить»

### 3.1 Разделение

`rottingDeals` разбивается на два мемо по уже существующему `getDealHealth`:

```ts
const dealsOverdueStep = // getDealHealth(p) === 'overdue-action'
const dealsNoPlan      = // getDealHealth(p) === 'no-action'
```

Секции в JSX (сохранить существующий стиль заголовков и маркеров):

- **«Просрочен шаг»** — маркер `filled: true`, цвет `RED`; подпись строки — «просрочен N дн.»
  (`getNextActionOverdueDays`, уже импортирован). Primary-действие прежнее (`openDeal`).
- **«Без плана»** — маркер `filled: false`, цвет `YELLOW`; подпись — «шаг не назначен» либо
  «у шага нет даты» (различать так же, как `deal-signals.nextStepSignal`: непустой
  `next_step` при пустой дате — это вторая формулировка, не первая). Primary — «Запланировать
  шаг» (`openDeal`).

⚠️ Обе секции скрываются целиком, когда пусты (как остальные секции экрана).

### 3.2 Snooze в строках

`QueueRow` уже принимает `secondary` — используем его, новый проп не заводим:
`secondary: { label: 'Отложить', onClick: … }` для сделок (обе новые секции), лидов и
остывающих контактов.

- Отложенные строки **исключаются** из своих списков до наступления `until`;
- под секциями (одной строкой на весь экран, не в каждой секции) — «Отложено на завтра: N ·
  показать», раскрытие рендерит их тем же `QueueRow` с `secondary: { label: 'Вернуть' }`;
- ⚠️ **`total` в шапке считает видимое** — иначе «13 требуют действия» при пустом экране;
- каунтер у заголовка каждой секции: `Просрочен шаг · 7`.

### 3.3 Клавиатура — правится в ДВУХ местах

`flatRows` и смещения `offTodayCalls / offLeads / offTasks / offDeals / offCooling /
offMeetings` собираются вручную и обязаны совпадать с порядком секций в JSX. После
разделения секции сделок смещений становится больше — пересчитать все и **сверить глазами**
по порядку JSX. Расхождение выглядит как «j/k подсвечивает одну строку, Enter открывает
другую» и не ловится ни tsc, ни тестами.

---

## ЗАДАЧА 4 — Тесты

`tests/unit/queue-snooze.test.ts` — чистые функции (вынести из компонента в
`src/lib/domain/queue-snooze.ts`, если удобнее тестировать):

1. `isSnoozed(key, snoozes, today)`: `until` = сегодня → **скрыта** (обещание «до завтра»
   включает сегодняшний день); `until` вчера → видна.
2. Ключ строится как `type:id`; сделка и лид с одинаковым uuid не путаются.
3. Разделение по `getDealHealth`: сделка с `next_step` без даты попадает в «Без плана», а не
   в «Просрочен шаг»; сделка с датой в прошлом — наоборот.
4. `total` считает только видимые строки: отложенная не увеличивает счётчик.

Запуск: `npx vitest run tests/unit/queue-snooze.test.ts`

---

## САМОПРОВЕРКА

```bash
npx tsc --noEmit
npx eslint src/lib/hooks/use-queue-snooze.ts src/components/today/TodayView.tsx
npx vitest run

# Миграция написана, но НЕ применена (в БД таблицы быть не должно — проверит гейт):
ls -1 supabase/migrations | tail -3
grep -n "queue_snoozes" docs/schema.md | head -3

# Порядок секций и смещений совпадает (глазами, но начать с грепа):
grep -n "off[A-Z][a-zA-Z]* =" src/components/today/TodayView.tsx
```

**Визуальный смок в `t-minimal`** (данные на 23.08: 7 + 2 сделки, 3 задачи, 1 лид):

1. Секции «Просрочен шаг» (7) и «Без плана» (2) разделены, каунтеры совпадают с числом строк.
2. «Отложить» на сделке — строка исчезает, счётчик в шапке уменьшается, появляется
   «Отложено на завтра: 1 · показать».
3. «Вернуть» из раскрытого списка возвращает строку в свою секцию.
4. `j/k` проходит по всем строкам по порядку, `Enter` открывает **ту же** строку, что
   подсвечена (проверить на границе секций — там ломается в первую очередь).
5. Пустая очередь: шапка говорит «ничего не требует действия», отложенные не попадают в
   счётчик, но их блок остаётся доступен.

⚠️ **Мутации не заработают до apply миграции** — до гейта проверяется только разделение
секций и клавиатура; snooze даст ошибку «relation does not exist», и это ожидаемо. Отметить
в отчёте, что смок snooze выполнен ПОСЛЕ apply (или отложен до него).

---

## КОММИТ

```bash
git checkout -b feat/queue-snooze
git add -A
git commit -m "S-QUEUE-1: очередь дня — разделить просроченное и незапланированное, отложить строку

- две секции вместо одной «гниющей»: «Просрочен шаг» и «Без плана» (тот же getDealHealth,
  что и на карточке — список и карточка говорят одним языком)
- queue_snoozes: личный snooze строки до завтра (миграция НАПИСАНА, НЕ ПРИМЕНЕНА),
  хук с оптимистичными мутациями, блок «Отложено · показать»
- каунтеры секций; total в шапке считает видимое
- flatRows и смещения клавиатурной навигации пересчитаны под новые секции"
```

**Отчёт** — `_analysis/sprint-S-QUEUE-1.md`. Обязательно указать: (1) точное имя файла
миграции и что она не применялась; (2) где стоит стаб типов и что он снимается вместе с
регеном; (3) прошёл ли смок клавиатуры на границах секций.
