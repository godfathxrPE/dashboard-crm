# Ревью: sprint-audit-B-schema-truth — «Схема — источник истины»

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-audit-B-schema-truth.md` — baseline-снимок прода, архив 001–039, 040 RLS/FK hardening, gen types + generic-клиент  
**Контекст:** AUDIT-2026-07-12 (1.2, 2.3, 2.4, 2.6, 2.10, 3.3, 3.8). Совместный CC+Cowork спринт (решение «снимок-база»). Файл промпта датирован **2026-07-13**; на `main` уже лежат коммиты B1/B2/B3 + follow-up (`ba33108` sync applied, 041–046 после B).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Стратегия (snapshot-baseline, не бэкпорт) | ✅ верная и реализована |
| Роли CC / Cowork / Олег (не apply из CC) | ✅ по learnings.md |
| Schema truth / имена политик и функций | ✅ совпадают с baseline + 040 |
| Пути / статус задач на `main` (2026-07-16) | ❌ промпт **устарел**: работа **уже влита и применена** |
| Отклонение 2.6 (SET NULL → CASCADE для kpi) | ✅ корректное (в 040), в промпте **не отражено** |
| learnings (SECURITY DEFINER, ACL, ON DELETE, no flowType) | ✅ соблюдено в реализации |
| Безопасность повторного запуска в CC | ❌ **не запускать** — дубли / регрессия / ложный FK-diff |

**Оценка: 4/10 как handoff «запусти сейчас».**  
Как *исторический* дизайн-спек до реализации (2026-07-12/13) — было ~8.5–9/10 (зрелое разделение ролей, эталон 34/7/41/53/97/113, честный disclaimer про «дыры только в archive»). Как живой промпт для Claude Code на текущем `main` — **непригоден**.

**Рекомендация:** **не запускать в CC.** Спринт AUDIT-B закрыт в коде и (по schema.md + заголовку 040) на проде. Архив/DONE-метка промпта; остаточный долг — отдельными микро-спринтами (token-invite, schema body для kpi FK, middleware generic).

---

## Статус реализации (факт репо)

| Задача спринта | Статус на `main` | Доказательство |
|----------------|------------------|----------------|
| 1.1 baseline `20260712230000_baseline.sql` | ✅ готов | 34 tables, 7 enums, 41 functions, 53 triggers (`CREATE OR REPLACE TRIGGER` + `EXECUTE FUNCTION`), 97 policies, RLS×34, realtime-аддендум на 10 таблиц |
| 1.2 archive `001…039` | ✅ | `supabase/migrations/archive/` — **39** файлов (`001`…`039_reorder_tasks.sql`) |
| 1.3 `migrations/README.md` | ✅ | baseline = точка истины; archive не реплеится; CC пишет / Cowork apply |
| 1.4 удалить root `005_calls_meetings.sql` | ✅ | файла в корне **нет** |
| 2.1–2.4 `040_rls_hardening.sql` | ✅ **написан + APPLIED** | `040_rls_hardening.sql` header: applied `20260713073955`; schema.md: 040 applied 2026-07-13 |
| 2.3 org-INSERT ai_hub | ✅ | `transcripts_insert` / `ai_runs_insert` + `org_id = (SELECT current_org_id())` |
| 2.10 notif_update WITH CHECK | ✅ | USING = WITH CHECK (org + recipient) |
| 2.4 confirmed-email invites | ✅ | `apply_pending_invites(..., p_email_confirmed)` + `handle_new_user`; TODO token-flow в комментарии; ACL service_role-only |
| 2.6 FK ON DELETE | ✅ с **отклонением** | activities/scheduled_calls **уже SET NULL в baseline** — не трогали; `kpi_entries.profile_id` → **CASCADE** (не SET NULL) |
| 3.1 `src/types/supabase.gen.ts` | ✅ | ~2311 строк; Tables включают `contact_company`, `meeting_attendees`, `is_milestone`, `do_url`, `stage_entered_at`, `phones`, … |
| 3.2 `database.ts` thin layer | ✅ | re-export gen + `RelaxOrgId` + кастомные хелперы (AI, Phone, …) |
| 3.3 generic client | ✅ | `client.ts` / `server.ts`: `createBrowserClient<Database>` / `createServerClient<Database>` (+ cast ssr@0.5) |
| Коммиты из спринта | ✅ уже есть | см. ниже |
| Пост-B миграции (вне scope) | ✅ поверх baseline | `041`…`046` в `migrations/` |

Коммиты (совпадают с разделом «КОММИТЫ» + довески):

| SHA | Сообщение |
|-----|-----------|
| `5705776` | `chore(db): baseline-снимок прод-схемы, архив старой цепочки, удалён дубль 005 (AUDIT B1)` |
| `9b451e1` | baseline-файл доложен (прерванный `git add` в 5705776) |
| `8c1b2b5` | `docs(db): README migrations/` |
| `411a468` | `fix(rls): … (040, pending) (AUDIT B2)` |
| `92ab0ff` | гейт-фикс REVOKE на `apply_pending_invites` |
| `0418bfa` | `feat(types): генерированные Supabase-типы + generic-клиент (AUDIT B3)` |
| `ba33108` | `chore(db): sync generated types + migration headers с прод-состоянием (040/041 applied)` |

`docs/schema.md` / skill `schema.md` описывают baseline + applied 040 (и дальше 041–046) — референсы **после** B, не «как до спринта».

---

## С чем согласен полностью (как с планом до реализации)

### 1. Snapshot-база вместо бэкпорта archive

Дыры `attendees_all USING(true)` и сырой `activity_log` **есть в archive** (`archive/005_calls_meetings.sql:75`, `archive/008` / `009`), **нет в baseline** (`attendees_own` + EXISTS; `Users insert own logs` с `org_id + user_id`). Решение «чинить репо, не прод 1.2» — верное.

### 2. Эталон счётчиков baseline

Локальная сверка baseline:

| Метрика | Промпт / README | Факт файла |
|---------|-----------------|------------|
| Tables | 34 | 34 `CREATE TABLE` |
| Enums | 7 | 7 `CREATE TYPE` |
| Functions | 41 | 41 |
| Triggers | 53 | 53 `CREATE OR REPLACE TRIGGER` / `EXECUTE FUNCTION` |
| Policies | 97 | 97 |
| RLS enabled | 34 | 34 |
| Realtime tables | 10 | 10 в аддендуме (`activities`…`tasks`) |
| Indexes (pg-смысл) | 113 | 69 explicit INDEX + PK/UNIQUE ≈ 113 (как в gate) |

### 3. CC не apply — Cowork apply

Совпадает с learnings: «CC пишет, Cowork применяет», без `supabase db push` из агента. 040 явно «НЕ применять» в промпте; в файле 040 — applied-метка.

### 4. Org-гард ai_hub INSERT (2.3)

Baseline-политики `transcripts_insert` / `ai_runs_insert` **без** `org_id` в WITH CHECK (только `created_by` + EXISTS) — дыра реальна на снимке 2026-07-12. Фикс 040 — initplan-обёртка `( SELECT current_org_id() )`, имена политик сохранены.

### 5. notif_update WITH CHECK (2.10)

В baseline у `notif_update` только USING — классическая UPDATE-дыра. Фикс 040 = USING + WITH CHECK.

### 6. database.ts = re-export + custom, не «выпилить рукописное»

architecture.md всё ещё говорит «Single file: all Row/Insert/Update types» для `database.ts` — **устарело относительно B3**; фактический паттерн (gen + thin layer) правильнее и совпадает с промптом.

### 7. Нет `flowType` override

`client.ts` / `server.ts` — defaults only. learnings соблюдены.

---

## Блокеры (критично — до «запуска» в CC)

### B1. Спринт уже выполнен на `main` — повторный прогон опасен

| Ожидание промпта | Факт `main` (2026-07-16) |
|------------------|---------------------------|
| «Файл baseline — ГОТОВ, не переделывать» | есть; CC мог бы перезаписать дампом / «починить» |
| «Старую цепочку → archive» | уже в archive/ |
| «Написать 040» | файл есть, **applied**, header говорит не pending |
| «Сгенерировать supabase.gen.ts» | есть; позже regen под 041–046 / B3 stage |
| «Удалить root 005» | уже удалён |
| Коммиты B1/B2/B3 | уже в history |

Повторный CC-прогон → конфликт с archive, риск `DROP`/`CREATE` 040 поверх ужесточённой схемы, откат types, шум в git. **Handoff пометить DONE / архивировать**, не отдавать агенту.

### B2. Задача 2.6 в промпте **фактически неверна** как инструкция к правке

Промпт требует:

- `activities.project_id` → SET NULL  
- `scheduled_calls.company_id/contact_id/project_id` → SET NULL  
- `kpi_entries.profile_id` → SET NULL  

**Факт baseline (живой снимок на момент B):**

- `activities_project_id_fkey` — **уже** `ON DELETE SET NULL` (`baseline` ~2703)  
- `scheduled_calls_*` — **уже** SET NULL (~3083–3103)  
- `kpi_entries.profile_id` — NOT NULL + UNIQUE `(profile_id, week_start, metric)` → **SET NULL физически ломает** схему  

Реализация 040 **правильно отклонилась**: не трогать готовые FK; `kpi` → **CASCADE** с комментарием. Если CC выполнит промпт буквально «как написано», получит no-op DDL или ошибочный SET NULL на NOT NULL-колонке.

**Для любого «перезапуска»:** править промпт под фактический 040, не наоборот.

### B3. VERIFICATION / «pending 040» устарели

Промпт:

> RLS Coverage: WARNING до применения 040  

`docs/schema.md` + header `040_rls_hardening.sql`: **040 applied 2026-07-13**. Тест-сценарии 2–4 — зона гейта Cowork (не CC); повторная «реализация» их не заменяет и не требуется для закрытия B в репо.

### B4. (условно) Секреты в теле промпта

Команда gen types содержит полный connection string с placeholder `[PASS]` к pooler `uoiavcabxgdjugzryrmj`. Даже как шаблон — плохая практика для handoff, который копируют в CC. При переиздании — только env / Dashboard, без URI в markdown.

---

## Предупреждения (остаточный долг / нюансы)

### W1. Minimal invite-fix не закрывает полный threat model (осознанно)

040 сам документирует:

- при **включённой** верификации email `handle_new_user` на INSERT видит `email_confirmed_at IS NULL` → инвайт **не** применится, а UPDATE-on-confirm **не** подхватывает;  
- при **выключенной** верификации GoTrue авто-confirm → гард **не** закрывает «регистрацию на чужой email».

TODO `accept_invitation(p_token)` + `/invite` — **не сделан** (grep по `src/` / миграциям после 040: только комментарии). Это следующий спринт, как и обещал промпт — но статус «B закрыт» ≠ «invite-flow безопасен end-to-end».

### W2. `docs/schema.md` body для `kpi_entries` не отражает CASCADE

В шапке migration history: `kpi_entries.profile_id` → ON DELETE CASCADE.  
В таблице `### kpi_entries`: `| profile_id | uuid | NOT NULL → profiles |` — **без** ON DELETE. learnings: schema обновлять тем же заходом. Мелочь документации, не блокер runtime.

### W3. `middleware.ts` без `Database` generic

Промпт: «client.ts / server client».  
`src/lib/supabase/middleware.ts` — `createServerClient(` **без** generic (session-only, приемлемо). Не регрессия B3; при желании — микро-выравнивание.

### W4. `BEGIN`/`COMMIT` в файле 040

learnings: `apply_migration` атомарно **без** BEGIN/COMMIT. Файл содержит обёртку транзакции; на гейте уже applied — не чинить задним числом без нужды. Для **новых** миграций — не копировать этот стиль.

### W5. Client cast `as unknown as SupabaseClient<Database>`

Оправдан комментарием ssr@0.5 × postgrest 2.100 (`never` results). Не блокер B; техдолг S-DEPS / upgrade ssr.

### W6. Промпт без классического блока «РАЗВЕДКА» (grep/find)

Есть роль-сплит и эталон, но нет команд «сначала проверь, что X отсутствует». Для **уже выполненного** спринта не важно; для шаблона будущих audit-B handoff — добавить «if baseline exists → STOP».

### W7. skill `schema.md` vs `docs/schema.md` diverge

Файлы **не идентичны** (разный size/mtime). Оба знают про 040; skill подробнее про 042–046. При правках схемы — синхронизировать оба (learnings).

### W8. architecture.md paths для types слегка stale

`types/database.ts — Single file: all Row/Insert/Update types` — после B3 неполная картина (`supabase.gen.ts` + thin layer). Не блокер исполнения B.

---

## Пропущенные места (если бы CC шёл «вслепую» по промпту)

| Файл | Строки / факт | Действие при «запуске» |
|------|----------------|-------------------------|
| `supabase/migrations/20260712230000_baseline.sql` | ~4k+ LOC, снимок | **STOP** — не пересоздавать |
| `supabase/migrations/archive/*` | 39 файлов | **STOP** — не `git mv` повторно |
| `supabase/migrations/040_rls_hardening.sql` | applied header | **STOP** — не rewrite |
| `supabase/migrations/README.md` | полный | no-op |
| `src/types/supabase.gen.ts` | gen + post-B columns | не gen «с нуля» без причины drift |
| `src/types/database.ts` | RelaxOrgId + customs | не затирать customs |
| `src/lib/supabase/client.ts` / `server.ts` | generic + cast | no-op |
| Root `005_calls_meetings.sql` | отсутствует | no-op |
| `docs/schema.md` kpi body | profile_id без CASCADE | опциональный doc-fix (не scope B re-run) |

---

## crm-architect checklist

| Пункт | Статус |
|-------|--------|
| Starts with РАЗВЕДКА | 🟡 роль-сплит + эталон; нет «grep before edit / STOP if done» |
| Real table/column names | ✅ |
| Real file paths | ✅ (`src/types/*`, `src/lib/supabase/*`, migrations) |
| learnings gotchas | ✅ (org boundary, DEFINER search_path, ACL revoke, ON DELETE DB-side, no flowType) |
| SQL as files; not applied from CC | ✅ в промпте и практике |
| org_id / RLS first | ✅ 2.3 / 2.10 |
| SECURITY DEFINER + search_path + ACL | ✅ 040 (`pg_temp`, REVOKE anon/authenticated) |
| No flowType implicit | ✅ |
| DELETE via CASCADE/SET NULL not client | ✅ 2.6 (CASCADE для kpi) |
| schema.md after migration | 🟡 header yes; kpi table body incomplete |
| CSS vars | N/A |

---

## Предлагаемые правки в спринт (только если файл ещё «живой»)

1. **Шапка:** `Status: DONE (2026-07-13) — do not re-run in CC.`  
2. **Задача 2.6** заменить на фактический 040: «не трогать activities/scheduled_calls; kpi → CASCADE».  
3. **VERIFICATION:** RLS PASS after 040 applied; Runtime — gate history.  
4. **Убрать** URI/password из команд; ссылка на env.  
5. **Разд. «Если baseline уже в репо»:** exit 0 / no-op checklist.  
6. Иначе — **не править**, а переименовать/архивировать: `_analysis/archive/sprint-audit-B-schema-truth.DONE.md`.

---

## Чеклист перед CC

- [ ] **Не запускать** этот файл в Claude Code на текущем `main`
- [x] Baseline + archive + README + root-005 — уже сделаны
- [x] 040 написан, applied, org-INSERT / notif WITH CHECK / invite guard / kpi CASCADE
- [x] `supabase.gen.ts` + thin `database.ts` + generic browser/server client
- [ ] (отдельный спринт) token invite + `/invite` + confirm-email hook
- [ ] (doc) `kpi_entries.profile_id` ON DELETE CASCADE в теле `docs/schema.md`
- [ ] (опц.) `middleware.ts` `<Database>`; sync skill ↔ docs schema
- [ ] Пометить handoff DONE / убрать из очереди watch-sprints

---

**Итог:** AUDIT-B — один из самых «правильных» audit-спринтов по замыслу; на `main` он **уже доведён** (и гейтом, и follow-up). Повторный прогон = риск регрессии. Для CC — только новые спринты поверх baseline/040, не этот handoff.
