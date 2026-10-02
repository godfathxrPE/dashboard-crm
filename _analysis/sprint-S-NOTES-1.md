# Claude Code Prompt — S-NOTES-1: заметка становится сущностью (`notes`)

> Спринт-файл: `_analysis/sprint-S-NOTES-1.md` · ветка `feat/notes-1` от `main`
> Эпик S-NOTES, спринт 1 из 3. Концепция и мокап — артефакт «Лента сделки v2»,
> решения владельца 02.10 (в Claude Project: `claude/concept-S-NOTES-feed-v2-2026-10-02.md`).
> **Миграция пишется и коммитится, НЕ применяется.** Apply — гейт Cowork.

## Зачем

Заметка сейчас — строка `activity_log` с `event_type='comment_added'`. У журнала нет
UPDATE-политики (select · insert own · delete own), и это правильно: аудит не правят.
Отсюда: заметку нельзя изменить, закрепить, удалить с отменой. Все западные CRM
(HubSpot engagements, Pipedrive notes, Salesforce ContentNote) держат заметку отдельным
объектом. Этот спринт — **только слой данных и минимальный клиент**: таблица, права,
RPC, перенос 78 заметок, лента читает заметки из новой таблицы, композер и комментарий
перехода стадии пишут в неё. Карточки, правка, закрепление в UI — S-NOTES-2.

## Замер прода (гейт, 02.10, read-only)

| Что | Значение |
|---|---|
| `comment_added` всего | 79 · project 74 · lead 1 · company 1 · contact 2 · **без привязки 1** |
| пустой текст / `user_id is null` | 0 / 0 |
| с `to_stage_id` (комментарий перехода) | 10 · ключи payload: `text`, `from_stage_id`, `to_stage_id` |
| `projects.pinned_note` непустой | 8 — **в этом спринте не трогаем** (S-NOTES-2) |
| последняя миграция | файл `133_cron_io_budget.sql`, версия `20260926102002` → **следующий файл `134`** |
| `entity_timeline` live == `120_lead_timeline.sql` | да (md5 тела без комментариев совпал) |
| `convert_lead` live == `123_lead_convert_carryover.sql` | да |
| `export_org_data` live == `126_org_export.sql` | да |
| ACL функций | `postgres, authenticated, service_role` — EXECUTE; `public`/`anon` — нет |
| триггеры-образцы | `trg_set_org_id` → `set_org_id()`, `set_updated_at` → `update_updated_at()`, `trg_aa_freeze_org_id` → `freeze_org_id()` (см. `calls`) |
| RLS-образец | `calls_*`: org первым конъюнктом, роль через `(select current_org_role())` |
| realtime | `activity_log` в `supabase_realtime`; лента слушает его в `use-entity-timeline.ts:212` |

## Решения (закрыты, не пересматривать)

- Таблица `notes`, хранение тела — **markdown** (плоский текст — его частный случай).
- Права: owner/admin — всё; manager — создать, править/удалять своё, закреплять любое;
  viewer — только читать. Физического DELETE нет. Закрепление ≤ 3 на сущность.
- Закрепить / удалить / вернуть — **только RPC** (`SECURITY DEFINER`). Право закреплять
  не должно тянуть право править текст.
- Колонки `pinned_*`, `deleted_at`, `created_by`, `org_id` клиент **не пишет вообще** —
  это держат column-level GRANT, а не дисциплина клиента.
- `entity_timeline` получает источник `notes` (`kind='note'`) и параметр `p_search`
  (UI поиска — S-NOTES-3, параметр закладываем сейчас, чтобы не пересоздавать функцию дважды).
- `comment_added` после переноса **в ленту не попадает** (иначе дубли).
- Мост: триггер на `activity_log` копирует новые `comment_added` в `notes` — страховка
  на окно «миграция применена, старый клиент ещё в проде». Удаляется в S-NOTES-2.

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -3
git status --short
ls supabase/migrations | sort | tail -4
grep -n "create or replace function public.entity_timeline" -A12 supabase/migrations/120_lead_timeline.sql
grep -n "kind_types\|comment_added\|src_activity as" supabase/migrations/120_lead_timeline.sql
grep -n "UPDATE public.tasks t" -B2 -A6 supabase/migrations/123_lead_convert_carryover.sql
grep -n "'activity_log'" supabase/migrations/126_org_export.sql
grep -n "grant\|revoke" -i supabase/migrations/120_lead_timeline.sql
sed -n 360,415p crm-architect/references/learnings.md      # стаб типов до apply
grep -n "TIMELINE_KINDS\|case 'activity'\|case 'meeting'" src/lib/timeline/rpc-adapter.ts
grep -n "TimelineKind\b\|TimelineKindFilter" src/types/timeline.ts
grep -rn "comment_added" src --include=*.ts --include=*.tsx | grep -v test
grep -rn "useRealtimeSync('activity_log'" src
grep -rn "function TimelineFilterChips\|DEAL_CHIP_KINDS\|NOTE_LABEL" src --include=*.tsx | head
```

Ожидание: последний файл `133_…`; `kind_types` с `array['comment_added'] as note`;
в `convert_lead` есть блоки `UPDATE public.calls` и `UPDATE public.tasks`. Расходится —
стоп, отчёт.

---

## ЗАДАЧА 1: миграция `134_notes.sql` — таблица, триггеры, права

### Steps
Файл `supabase/migrations/134_notes.sql`, всё в одной транзакции (`begin; … commit;`
не писать — apply_migration оборачивает сам; проверить по соседним файлам, как принято).

1. **Таблица**
   ```sql
   create table if not exists public.notes (
     id                 uuid primary key default gen_random_uuid(),
     org_id             uuid not null references public.organizations(id),
     project_id         uuid references public.projects(id)  on delete cascade,
     lead_id            uuid references public.leads(id)     on delete cascade,
     company_id         uuid references public.companies(id) on delete cascade,
     contact_id         uuid references public.contacts(id)  on delete cascade,
     body               text not null,
     kind               text not null default 'note',
     meta               jsonb not null default '{}'::jsonb,
     pinned_at          timestamptz,
     pinned_by          uuid references public.profiles(id) on delete set null,
     created_by         uuid not null default auth.uid() references public.profiles(id),
     created_at         timestamptz not null default now(),
     updated_at         timestamptz not null default now(),
     updated_by         uuid references public.profiles(id) on delete set null,
     edited_at          timestamptz,
     deleted_at         timestamptz,
     legacy_activity_id uuid unique,
     constraint notes_has_parent check (num_nonnulls(project_id, lead_id, company_id, contact_id) >= 1),
     constraint notes_body_len   check (length(btrim(body)) between 1 and 20000),
     constraint notes_kind_check check (kind in ('note','stage_comment')),
     constraint notes_pin_pair   check ((pinned_at is null) = (pinned_by is null))
   );
   ```
   Сверено с живой БД (FK `calls`): `organizations(id)` и `profiles(id)` — без `on delete`.
   ⚠️ Родители — **`on delete cascade`, а НЕ `set null`, как у `calls`.** У `calls` нет
   check'а на родителя; у `notes` он есть (`notes_has_parent`), и `set null` на последнем
   родителе уронил бы удаление сделки/лида ошибкой `23514`. Заметка без сущности смысла
   не имеет.

2. **Индексы** (все частичные — `where deleted_at is null`):
   `(project_id, created_at desc)`, `(lead_id, created_at desc)`, `(company_id, created_at desc)`,
   `(contact_id, created_at desc)`, `(org_id, created_at desc)`, `(created_by)`;
   плюс `(project_id) where pinned_at is not null and deleted_at is null`.

3. **Триггеры**
   - `trg_set_org_id` BEFORE INSERT → `set_org_id()` (как у `calls`).
   - `trg_aa_freeze_org_id` BEFORE UPDATE OF org_id → `freeze_org_id()` (как у `calls`).
   - `set_updated_at` BEFORE UPDATE → `update_updated_at()`.
   - `trg_notes_touch` BEFORE UPDATE — новая функция `notes_touch()`
     (`SECURITY INVOKER`, `set search_path = public, pg_temp`):
     `if new.body is distinct from old.body then new.edited_at := now(); end if;`
     `new.updated_by := coalesce(auth.uid(), new.updated_by);`
     `new.created_by := old.created_by; new.created_at := old.created_at;` (автора не подменить).

4. **RLS** — `alter table public.notes enable row level security;`
   ```sql
   -- читать: своя организация; удалённое видят только автор и owner/admin (для «Вернуть»)
   create policy notes_select on public.notes for select to authenticated
     using ( org_id = (select current_org_id())
             and ( deleted_at is null
                   or created_by = (select auth.uid())
                   or (select current_org_role()) in ('owner','admin') ) );

   -- создать: не viewer; автор = я; родитель — из моей организации (FK орг не проверяет)
   create policy notes_insert on public.notes for insert to authenticated
     with check ( org_id = (select current_org_id())
                  and (select current_org_role()) in ('owner','admin','manager')
                  and created_by = (select auth.uid())
                  and (project_id is null or exists (select 1 from public.projects  x where x.id = project_id))
                  and (lead_id    is null or exists (select 1 from public.leads     x where x.id = lead_id))
                  and (company_id is null or exists (select 1 from public.companies x where x.id = company_id))
                  and (contact_id is null or exists (select 1 from public.contacts  x where x.id = contact_id)) );

   -- править текст: автор (не viewer) или owner/admin; удалённое не правится
   create policy notes_update on public.notes for update to authenticated
     using ( org_id = (select current_org_id())
             and deleted_at is null
             and ( (select current_org_role()) in ('owner','admin')
                   or ( created_by = (select auth.uid())
                        and (select current_org_role()) = 'manager' ) ) )
     with check ( org_id = (select current_org_id()) );
   -- DELETE-политики нет: физического удаления нет.
   ```
   `exists(...)` в insert работает под RLS вызывающего — чужая организация не видна,
   значит и сослаться на неё нельзя (сверено: select-политики `leads`, `companies`,
   `contacts` — org-first; `projects` — ещё и owner/created_by/участник, то есть менеджер
   не напишет заметку в сделку, которую не видит).
   ⚠️ Чтение `notes` — org-wide, как у `calls` и `activity_log` сегодня. Это паритет, не
   регрессия: заметки журнала уже читались всей организацией. Сужение до видимости
   сделки — отдельное решение, в этот спринт не входит; записать в `docs/schema.md`.

5. **Column-level GRANT** — клиент пишет только содержимое:
   ```sql
   revoke all on public.notes from anon, authenticated;
   grant select on public.notes to authenticated;
   grant insert (project_id, lead_id, company_id, contact_id, body, kind, meta)
     on public.notes to authenticated;
   grant update (body) on public.notes to authenticated;
   grant all on public.notes to service_role;
   ```

6. **Realtime**: `alter publication supabase_realtime add table public.notes;`

### Verification
`grep -c "create policy notes_" supabase/migrations/134_notes.sql` → 3.

---

## ЗАДАЧА 2: та же миграция — RPC закрепления, удаления, возврата

Три функции, `language plpgsql security definer set search_path = public, pg_temp`,
после каждой: `revoke all on function … from public, anon; grant execute on function … to authenticated;`
(hardening-конвенция — `crm-architect/references/schema.md`).

Общая часть — найти заметку в своей организации:
`select * into v from notes where id = p_note_id and org_id = current_org_id() for update;`
нет строки → `raise exception 'note not found' using errcode = 'P0002';`

1. `set_note_pinned(p_note_id uuid, p_pinned boolean) returns void`
   - роль `in ('owner','admin','manager')`, иначе `errcode '42501'`;
   - `v.deleted_at is not null` → `P0002`;
   - закрепление: лимит 3 на **основного родителя** — `coalesce(project_id, lead_id, company_id, contact_id)`
     той же заметки; считать среди `pinned_at is not null and deleted_at is null and id <> p_note_id`;
     ≥ 3 → `raise exception 'pin limit' using errcode = 'P0001', hint = 'notes_pin_limit';`
   - `update notes set pinned_at = now(), pinned_by = auth.uid()` / `= null, null`.
   - Повторное закрепление закреплённой — no-op без ошибки (идемпотентность).
2. `soft_delete_note(p_note_id uuid) returns void`
   - право: owner/admin — любую; manager — только `created_by = auth.uid()`; иначе `42501`;
   - уже удалена — no-op;
   - `set deleted_at = now(), pinned_at = null, pinned_by = null`.
3. `restore_note(p_note_id uuid) returns void`
   - те же права; не удалена — no-op; `set deleted_at = null`.

⚠️ `for update` по строке, которую RLS читающего уже скрыла (удалённая чужая), из
`SECURITY DEFINER` видна — поэтому проверка org и прав внутри функции обязательна,
на RLS здесь не полагаться.

---

## ЗАДАЧА 3: та же миграция — перенос и мост

1. **Перенос** (идемпотентно):
   ```sql
   insert into public.notes (org_id, project_id, lead_id, company_id, contact_id,
                             body, kind, meta, created_by, created_at, updated_at, legacy_activity_id)
   select a.org_id, a.project_id, a.lead_id, a.company_id, a.contact_id,
          a.payload->>'text',
          case when a.payload ? 'to_stage_id' then 'stage_comment' else 'note' end,
          case when a.payload ? 'to_stage_id'
               then jsonb_strip_nulls(jsonb_build_object(
                      'from_stage_id', a.payload->'from_stage_id',
                      'to_stage_id',   a.payload->'to_stage_id'))
               else '{}'::jsonb end,
          a.user_id, a.created_at, a.created_at, a.id
   from public.activity_log a
   where a.event_type = 'comment_added'
     and btrim(coalesce(a.payload->>'text','')) <> ''
     and num_nonnulls(a.project_id, a.lead_id, a.company_id, a.contact_id) >= 1
     and a.user_id is not null
   on conflict (legacy_activity_id) do nothing;
   ```
   Строки журнала **не удалять**. Одна заметка без привязки остаётся только в журнале —
   записать это в `docs/schema.md`.
   ⚠️ `trg_notes_touch` срабатывает только на UPDATE — перенос его не задевает.
   ⚠️ Если `body` длиннее 20 000 — `check` уронит миграцию. Замер: максимум 2066. Ок.

2. **Мост** `notes_from_comment_added()` — `security definer`, AFTER INSERT ON
   `activity_log` FOR EACH ROW WHEN `(new.event_type = 'comment_added')`:
   тот же маппинг, что в переносе, для `new`, `on conflict (legacy_activity_id) do nothing`;
   строка без привязки или с пустым текстом — молча пропустить. Триггер `trg_zz_notes_bridge`.
   Комментарий в файле: «удалить в S-NOTES-2, после выката клиента, пишущего в notes».

---

## ЗАДАЧА 4: та же миграция — `entity_timeline`, `convert_lead`, `export_org_data`

1. **`entity_timeline`** — взять тело из `120_lead_timeline.sql` (совпадает с прод).
   Новая сигнатура с последним параметром `p_search text default null` ⇒ это другая
   функция для Postgres. Порядок:
   `drop function if exists public.entity_timeline(text, uuid, timestamptz, text, integer, text[]);`
   → `create function …` → ACL как был (EXECUTE: `authenticated`, `service_role`; отозвать у `public`, `anon`).
   Остаётся `SECURITY INVOKER` (`prosecdef = false`) — RLS `notes` работает сама.

   Правки тела:
   - `kind_types.note` → убрать (заметки больше не срез журнала). Ветки `'note' = any(p_kinds)`
     в `src_activity` удалить.
   - В `src_activity` обе подветки: `and al.event_type <> 'comment_added'`.
   - Новый CTE `src_notes`, по образцу `src_activity` (две подветки через `union`: прямые
     связи + проекты компании/контакта из `scope_projects`):
     ```
     ts = n.created_at · id = 'note:' || n.id · source = 'notes' · kind = 'note'
     actor_id = n.created_by · ref_type = 'note' · ref_id = n.id
     parent_type/parent_id — case/coalesce в порядке project → company → contact → lead
     payload = jsonb_build_object('body', n.body, 'kind', n.kind, 'meta', n.meta,
               'pinned_at', n.pinned_at, 'edited_at', n.edited_at)
     where n.deleted_at is null
       and (p_kinds is null or 'note' = any(p_kinds))
       and (p_entity_type = 'org' or …project/company/contact/lead… = p_entity_id)
       + keyset по (n.created_at, 'note:'||n.id) — как у соседей
     ```
   - **`p_search`**: `v_q = nullif(btrim(p_search), '')`; при длине < 2 — как `null`.
     Если `v_q` задан:
       `src_notes` — `n.body ilike '%' || v_q || '%'`;
       `src_calls` — `coalesce(c.agreements,'') || ' ' || coalesce(c.next_step,'') ilike …`;
       `src_meetings` — `title || notes || next_step`;
       `src_tasks` — `t.text ilike …`;
       `src_projects`, `src_activity`, `src_ai` — при заданном `v_q` не возвращают ничего
       (`and v_q is null`).
     Экранирование `%`/`_` — на клиенте (S-NOTES-3); в SQL — комментарий об этом.
     Функция `language sql` — `v_q` вынести в CTE `q as (select …)`.
   - Финальный `union all` — добавить `select * from src_notes`.
2. **`convert_lead`** — тело из `123_lead_convert_carryover.sql` (совпадает с прод), одна
   вставка сразу после блока `UPDATE public.tasks t …`:
   ```sql
   UPDATE public.notes n
      SET project_id = COALESCE(n.project_id, v_deal_id),
          company_id = COALESCE(n.company_id, v_company_id),
          contact_id = COALESCE(n.contact_id, v_contact_id)
    WHERE n.lead_id = p_lead_id;
   ```
   ⚠️ `UPDATE notes` из `SECURITY DEFINER` проходит мимо column-grant'ов — это и нужно.
   `trg_notes_touch` при этом не ставит `edited_at` (body не меняется) — проверить глазами.
   `pinned_note` в `convert_lead` **не трогать** (S-NOTES-2). Сигнатура та же —
   `create or replace`, ACL сохраняется.
3. **`export_org_data`** — тело из `126_org_export.sql`, в массив таблиц добавить `'notes'`
   рядом с `'activity_log'`. Больше ничего.

### Verification
```bash
grep -n "src_notes\|p_search\|comment_added" supabase/migrations/134_notes.sql
grep -c "drop function if exists public.entity_timeline" supabase/migrations/134_notes.sql   # 1
```

---

## ЗАДАЧА 5: `docs/schema.md`

Раздел `notes` в «Tenant-таблицы»: колонки, check'и, индексы, RLS, column-grants, три RPC,
мост (с пометкой «удалить в S-NOTES-2»), перенос (78 строк, 1 без привязки остаётся в журнале).
Статус миграции 134 — **«НАПИСАНА, НЕ ПРИМЕНЕНА»** (переводит гейт после apply).
`entity_timeline` — новая сигнатура и источник `notes`. `convert_lead` — перенос заметок лида.

---

## ЗАДАЧА 6: клиент читает вид `note`

1. `src/types/timeline.ts`: `TimelineKind` += `'note'`. `TimelineKindFilter` — `'note'`
   теперь настоящий вид, из списка производных убрать (комментарий поправить).
   В `TimelineEvent` аддитивно: `pinnedAt?: string | null`, `editedAt?: string | null`,
   `noteKind?: 'note' | 'stage_comment'`.
2. `src/lib/timeline/rpc-adapter.ts`: `TIMELINE_KINDS` += `'note'`; ветка `case 'note'`:
   `body = text(p,'body')`, `title = splitNoteHead(body).head || 'Заметка'`,
   `sourceId` = id заметки, `actorId`, `pinnedAt`, `editedAt`, `noteKind`
   (неизвестное значение → `'note'`). Без `body` строку отбросить (как прочие битые).
3. `src/lib/timeline/kind-meta.ts`: `note: { icon: StickyNote, … }` — те же токены, что у
   `task` сейчас (`bg-yellow-l`/`text-yellow`), у `task` — оставить как есть.
4. `src/lib/timeline/dot-tone.ts`: `note` → тон касания (как была заметка журнала).
5. Чипы: «Заметки» → `p_kinds=['note']`, «Поля» → `['activity']`. Найти, где `activity`
   разворачивается в «Заметки» + «Поля» (`TimelineFilterChips`, `DEAL_CHIP_KINDS`,
   `EntityTimeline`), и развести на два настоящих вида.
6. Места, где заметку узнавали по `kind==='activity' && eventType==='comment_added'`
   (`DealLastEvent.eventTitle`, `DealActivityFeed.rowParts`, `EntityTimeline`) — перевести
   на `kind === 'note'`. Ветку `comment_added` в `describeEvent` оставить: старые строки
   журнала в org-ленте других экранов могут встречаться в кэше — вреда нет.
7. `openTimelineEvent` (`lib/timeline/open-event.ts`): `note` — клик молчит
   (правка — S-NOTES-2), явной веткой, не через `default`.
8. `use-entity-timeline.ts`: рядом с `useRealtimeSync('activity_log', …)` — подписка на
   `'notes'` с тем же ключом.

### Verification
`npx tsc --noEmit` — кроме записи в `notes` (задача 7), всё должно собраться без стаба.

---

## ЗАДАЧА 7: клиент пишет в `notes`

1. **Стаб типов до apply** — по `learnings.md` (~стр. 368 и 411): `type`-интерсекшен в
   `src/types/database.ts` для `notes` (Row / Insert / Update), alias в `entities.ts`.
   Пометка `// STUB S-NOTES-1 — снять регеном после apply 134`. `supabase.gen.ts` руками
   не править, если паттерн проекта не требует иного (сверить с прецедентом quotes).
2. Новый `src/lib/hooks/use-notes.ts`:
   - `useCreateNote()` — `insert({ project_id|lead_id|company_id|contact_id, body, kind?, meta? })`,
     только переданные FK (как `useLogActivity`); `onSettled` → `invalidateQueries(['timeline'])`.
   - `insertNote(…)` — fire-and-forget версия для `use-stage-transition.ts` (как `logActivity`).
   - Ошибку `23514` (check) → понятное сообщение «Заметка пустая или длиннее 20 000 символов».
3. `ActivityComposer.tsx` — `useLogActivity` → `useCreateNote`. Поведение поля (автовысота,
   ⌘↵) не трогать.
4. `use-stage-transition.ts` — `logActivity(…, 'comment_added', …)` →
   `insertNote({ project_id, body: text, kind: 'stage_comment', meta: { from_stage_id, to_stage_id } })`.
5. `LeadDetail.tsx` и `StageTransitionModal.tsx` — только комментарии, упоминающие
   `comment_added`, привести к правде.

### Verification
```bash
grep -rn "'comment_added'" src --include=*.ts --include=*.tsx | grep -v test
# ожидание: только describeEvent и NOTE_EVENT_TYPES/тесты
```

---

## ТЕСТЫ

`tests/unit/timeline-rpc-adapter.test.ts` (дополнить):
1. Строка `kind='note'` с `body` из двух строк → `kind:'note'`, `title` = первая строка,
   `body` целиком, `pinnedAt`/`editedAt` проброшены.
2. `kind='note'` без `body` → отброшена (`null`/фильтр — как принято в адаптере).
3. `payload.kind='stage_comment'` → `noteKind:'stage_comment'`; мусор → `'note'`.

`tests/unit/` для `use-notes` (если в проекте тестируют хуки через мок supabase — по
образцу соседних; иначе вынести сборку insert-строки в `lib/notes/build-insert.ts` и
тестировать её): передан только `lead_id` → в объекте нет `project_id: undefined`.

Компонентные (`deal-activity-feed-notes.test.tsx` из NOTES-READ-1): событие `kind:'note'`
раскрывается так же, как раньше `activity`+`comment_added`. Тест, который обязан
**покраснеть** на старом коде: событие `kind:'note'` без правки `rowParts` не раскрывается.

SQL-тестов в репо нет — ролевые смоки делает гейт (сценарии ниже, в приёмке).

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm test
npm run lint          # не хуже baseline main
```
`npm run build` — у владельца. Миграцию **не применять**.

## КОММИТ

```bash
git add supabase/migrations/134_notes.sql docs/schema.md src/types src/lib src/components tests
git commit -m "feat(notes): заметка — сущность notes: RLS, RPC закрепления/удаления, перенос из журнала, лента читает kind note (S-NOTES-1)"
```

---

## ПРИЁМКА (для гейта и cold review)

Порядок выката жёсткий: **apply 134 → advisors → смоки → мерж PR**. Наоборот — композер
пишет в несуществующую таблицу. В окне «apply прошёл, деплой ещё нет» старый клиент
не покажет заметки в ленте (неизвестный `kind` отбрасывается `isTimelineRpcRow`), но
писать будет — мост перенесёт. Окно — минуты деплоя.

| Проверка | Ожидание |
|---|---|
| `select count(*) from notes` после apply | 78; `kind='stage_comment'` — 10 |
| Повторный прогон переноса | 0 новых строк |
| `entity_timeline('project', <АНФИШ>)` | заметки приходят `kind='note'`, `comment_added` — ни одного |
| `p_kinds=['note']` | только заметки |
| `p_search='палета'` на сделке АНФИШ | заметка 02.10 находится; поля/AI не приходят |
| viewer: insert | отказ `42501`/RLS |
| manager: update чужой | 0 строк |
| manager: update своей body | ок, `edited_at` проставлен |
| manager: `update notes set pinned_at = now()` напрямую | отказ — column grant |
| manager: `set_note_pinned` 4-й на сделку | `P0001`, hint `notes_pin_limit` |
| manager: `soft_delete_note` чужой | `42501` |
| owner: `soft_delete_note` → `restore_note` | заметка исчезает из ленты и возвращается |
| insert с `project_id` из чужой организации | отказ RLS |
| insert в `activity_log` comment_added (старый клиент) | появляется строка в `notes` |
| `convert_lead` тестового лида с заметкой | у заметки проставлен `project_id` сделки |
| advisors | новых WARN нет |
