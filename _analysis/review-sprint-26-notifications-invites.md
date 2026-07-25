# Ревью: Sprint 26 — Уведомления + приглашения

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, archive `025`/`026`, baseline `20260712230000_baseline.sql`, active `040`/`045`, `docs/schema.md`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-26-notifications-invites.md` — invitations + notifications + write-политики memberships + FK `converted_*` SET NULL + UI (колокольчик, Team)  
**Контекст:** Фаза multi-user S23–S26 **уже в проде** (S26 applied 2026-07-06); живая цепочка до **046**; post-S26 hardening **040** (`p_email_confirmed`, `notif_update` WITH CHECK) и **045** (`deal_won`). Аналогично `review-sprint-24` / `review-sprint-25` — handoff-артефакт, не runnable-промпт на `main`.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Актуальность промпта vs репо/прод | ❌ Спринт **уже выполнен** (SQL + UI + docs, гейт пройден) |
| Исторический дизайн (vs archive 025/026) | ✅ Почти 1:1 с applied SQL; баг `profile_id` в sprint-черновике **исправлен** в archive |
| РАЗВЕДКА на `main` 2026-07-16 | ❌ Утверждения «нужно вешать колокольчик / писать 025–026 / schema pending» **ложны** |
| Номера миграций `025` / `026` | ❌ Заняты (archive + baseline + `docs/schema.md` «applied»); next free ≥ **047** |
| Таблицы invitations / notifications + RLS | ✅ В baseline; initplan-обёртки верны |
| Write-политики memberships + `protect_last_owner` | ✅ В archive 026 и baseline |
| notify_* per-table + EXCEPTION-глотание | ✅ Паттерн 011 + learnings S26/S29 |
| `apply_pending_invites` + `handle_new_user` | 🟡 В 026 как в спринте; **прод ≠ 026**: 040 добавил `p_email_confirmed` |
| Задачи 3–4 (hooks + UI) | ❌ **Уже в коде** и расширены (deal_won, TeamSection, z-[9999]) |
| `docs/schema.md` § S26 | ❌ Уже полный блок «026, applied»; Header **не** «025/026 pending» |
| Повторный `CREATE OR REPLACE` / CHECK type | ❌ **Риск регрессии** (040, 045, live handle_new_user) |
| Контракт «CC пишет, не apply» | ✅ Процесс верный (исторически соблюдён) |
| crm-architect checklist (как runnable) | ❌ Провалы по актуальности / номерам / state |

**Оценка: 2/10 как runnable-промпт на `main`.**  
**Как исторический handoff (post-S25, июль 2026): 9/10** — SQL ушёл в `archive/025_fk_converted_set_null.sql` (25 строк) + `archive/026_notifications_invitations.sql` (256 строк); гейт: FK SET NULL, инвайт-цикл идемпотентен, notify-триггеры, last-owner → 42501; UI 1:1 с задачами 3–4.

**Рекомендация: не запускать.** Source of truth — archive `025`/`026`, baseline, `docs/schema.md` § invitations/notifications/memberships write, живые хуки/UI. Новый work по invite token-flow / email — отдельный спринт поверх **047+** (TODO уже в 040), не «перепрогон 025/026».

---

## Статус

| Заход | Статус в репо / проде |
|-------|------------------------|
| S23–S25 (021–024) | ✅ archive + baseline |
| **S26 025 FK converted_* SET NULL** | ✅ **applied** 2026-07-06; `archive/025_fk_converted_set_null.sql`; baseline L2898–2908 `ON DELETE SET NULL` |
| **S26 026 notifications + invitations + memberships write** | ✅ **applied**; `archive/026_notifications_invitations.sql`; policies `inv_*` / `notif_*` / `membership_*` в baseline |
| 040 rls_hardening | ✅ `apply_pending_invites(uuid,text,boolean)` + `notif_update` WITH CHECK; live body ≠ sprint 2.5 |
| 045 notify_deal_won | ✅ CHECK type += `'deal_won'`; UI `NotificationBell` знает тип |
| 027–046 + baseline | ✅ active `040–046` + `20260712230000_baseline.sql` |
| Hooks | ✅ `use-notifications.ts`, `use-invitations.ts`, `use-team-members.ts` (+ role/mutations) |
| UI | ✅ `layout/NotificationBell.tsx` в `ContentHeader`; `settings/TeamSection.tsx` |
| Types | ✅ `database.ts`: `Notification`, `Invitation`, `NotificationType` (+ `deal_won`) |
| **Повторный запуск sprint-26-…md** | ❌ **запрещён** |

Доказательства:

- `docs/schema.md` / crm-architect `schema.md`: «S26 … 025/026 применены 2026-07-06, гейт пройден».
- `ls supabase/migrations/archive/ | rg '025|026'` → оба файла; active chain max **046**.
- `src/components/layout/NotificationBell.tsx` export + mount `ContentHeader.tsx:96`.
- `rg -n Invitation|Notification src/types/database.ts` → блок «Sprint 26».
- architecture.md L50, L365–370, L432–438 — колокольчик, хуки, TeamSection задокументированы.

---

## С чем согласен полностью (как с историческим дизайном S26)

### 1. Продуктовый контракт

Invite **без** email-отправки (ручная ссылка, матч по email при signup); notifications v1 только «тебе назначили»; email-канал — позже (S30). Совпадает с applied 026 и текущим `inviteLink()` → `/login?invited=1` (токен в URL не кладётся).

### 2. Разделение миграций 025 (микро FK) + 026 (ядро)

Гейт S25 (23503 на delete сконвертированной сделки) вынесен отдельно — правильно. Archive 025: три FK `leads_converted_{deal,company,contact}_id_fkey` → `ON DELETE SET NULL` (имена как в recon, не угаданные).

### 3. `trg_set_org_id` на invitations/notifications **не** вешать

Явный `org_id` из UI / definer-триггеров. Совпадает с learnings («На invitations/notifications НЕ вешается»).

### 4. Per-table notify-функции (грабли 011)

Отдельные `notify_task_assigned` / `notify_project_assigned`, не generic `TG_TABLE_NAME`. `EXCEPTION WHEN OTHERS THEN RETURN NEW` — AFTER-исполнитель, не блокирует запись (симметрия S29).

### 5. Initplan + ACL

RLS: `org_id = ( SELECT current_org_id() )`, role/uid через `( SELECT … )`. Триггерные definer: `SET search_path = public, pg_temp` + REVOKE PUBLIC/anon/authenticated + GRANT service_role. В archive 026: **6** `SECURITY DEFINER` (protect + 2 notify + apply + handle + комментарий «INSERT политики НЕТ» не считается; фактических функций-definer **5** — проверка `≥ 4` в § ПРОВЕРКА проходима).

### 6. Write-политики memberships + `protect_last_owner`

Хвост S24: INSERT/UPDATE/DELETE для owner/admin; role `owner` только owner; self-leave; last-owner → `42501`. 1:1 archive 026 L101–146 и baseline policies.

### 7. Баг-пометка про `profile_id` в `INSERT…SELECT`

Спринт явно ловит дыру (`SELECT org_id, role FROM matched` без `p_profile_id`) и требует fix. Archive 026 L226–227: `SELECT org_id, p_profile_id, role FROM matched` — **исправлено** при реализации.

### 8. Контракт процесса

«Миграции пишешь, НЕ применяешь» + гейт Cowork + schema update — совпадает с learnings («CC пишет, Cowork apply»).

---

## Блокеры (критично — не запускать as-is)

### B1. Спринт уже применён; номера 025/026 заняты

Повторный прогон создаст файлы/DDL с **занятыми** именами. Next free migration ≥ **047**. Archive + baseline + docs уже source of truth.

### B2. `CREATE OR REPLACE handle_new_user` / `apply_pending_invites` откатит 040

Спринт §2.5: сигнатура `(uuid, text)` и вызов `PERFORM apply_pending_invites(NEW.id, NEW.email)`.  
Прод (040 L87–146): `(uuid, text, boolean DEFAULT false)` + гард `IF NOT p_email_confirmed THEN RETURN 0` + `NEW.email_confirmed_at IS NOT NULL`.  
Перезапись по тексту спринта **снимает** email-confirm guard (AUDIT 2.4).

### B3. CHECK `notifications.type` без `deal_won` регрессирует 045

Спринт: `CHECK (type IN ('task_assigned','project_assigned'))`.  
045 расширил CHECK до `+ deal_won` и добавил `notify_deal_won`. Recreate constraint по спринту сломает won-уведомления и UI (`NotificationType` уже включает `deal_won`).

### B4. `notif_update` без WITH CHECK — дыра, закрытая в 040

Спринт §2.2 / archive 026: только `USING`. 040 L54–64: `WITH CHECK = USING` (AUDIT 2.10 — нельзя «увести» `org_id`/`recipient_id`). Повтор DROP+CREATE по спринту **откроет** дыру снова.

### B5. Весь UI/hooks уже реализован — дубли и конфликты

| Спринт (задача) | Факт на `main` |
|-----------------|----------------|
| `use-notifications.ts` | ✅ limit 30, unread-first, markRead/markAllRead, `useRealtimeSync('notifications')` |
| `use-invitations.ts` | ✅ pending, create → `inviteLink()`, revoke; explicit `org_id` via `rpc('current_org_id')` |
| `use-team-members` + role | ✅ join memberships; `useUpdateMemberRole` / `useRemoveMember` |
| Колокольчик | ✅ `NotificationBell.tsx` + `ContentHeader` |
| Settings → Team | ✅ `TeamSection.tsx` (owner/admin, invite form, revoke, copy link, role select) |
| `database.ts` types | ✅ + post-S26 `deal_won` |

Повторная реализация = noise / merge conflicts, не value.

### B6. `docs/schema.md` уже описывает S26 as applied

Задача 5 («Header: 025/026 pending») **устарела**. Документ фиксирует applied, gate smoke, и последующие 040/045. Писать «pending» = дрейф docs назад.

---

## Предупреждения (исторические / качество черновика)

### W1. РАЗВЕДКА: пути и state на `main` неверны

| Команда / claim | Факт 2026-07-16 |
|-----------------|-----------------|
| `src/app/settings/page.tssx` (typo) + `page.tsx` | Settings: `src/app/(dashboard)/settings/page.tsx` → `SettingsContent`; **нет** `src/app/settings/` |
| «Куда вешать колокольчик» | Уже висит: `ContentHeader` + `NotificationBell` |
| `grep signUp\|signInWith` | Только `signInWithOtp` в `(auth)/login` — signup-поток OTP/magic link, не password `signUp` |
| Realtime use-realtime | Живой refcount-менеджер (AUDIT 1.5), не «голый» паттерн из старого спринта |

### W2. Черновик notify на INSERT ссылался на `OLD` без `TG_OP`

Спринт §2.4: `NEW.assigned_to IS DISTINCT FROM OLD.assigned_to` без ветки INSERT. Archive 026 L159–161:  
`(TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)` — **обязательный** fix при реализации; иначе INSERT-ветка хрупка.

### W3. z-index: спринт `z-50` vs факт `z-[9999]`

Спринт: «dropdown = z-50». Applied: `NotificationBell` `z-[9999]` (как theme-меню; architecture L432–433). learnings: dropdown ≥ z-50 minimum — `z-50` был floor, не ideal.

### W4. Маршрутизация клика по уведомлению

Спринт: «задача/сделка». Код: `task_assigned` → `/tasks`; `project_assigned` \| `deal_won` → `/deals/${entity_id}` (с бэкстопом deals→projects). Delivery/internal учтены post-S26 — не переписывать по тексту спринта.

### W5. Открытый хвост invite (не scope S26, но важно)

040 явно: full token-flow `accept_invitation(p_token)` + `/invite` + confirm-email trigger — **TODO следующего спринта**. Minimal `p_email_confirmed` не закрывает сценарий «verify email on, accept on confirm». Не чинить перепрогоном 026.

### W6. Мелочи черновика

- Строка ~140: мусор «管理» в комментарии к membership INSERT (в archive 026 уже чистый русский/EN).  
- Нет `inv_update` — осознанно (revoke = DELETE; role/email не правят).  
- `UNIQUE(org_id, email)` + index `lower(email)` — в applied; case-fold на insert в UI (`email.trim().toLowerCase()`).

---

## Пропущенные места (если бы спринт ещё был runnable)

| Файл / область | Строки / факт | Действие |
|----------------|---------------|----------|
| `supabase/migrations/archive/025_*.sql` | 25 lines, SET NULL | Уже source of truth — не трогать |
| `supabase/migrations/archive/026_*.sql` | 256 lines | Уже source of truth |
| `040_rls_hardening.sql` | L50–146 | Не откатывать notif/invite |
| `045_notify_deal_won.sql` | CHECK + trigger | Сохранить `deal_won` |
| `src/components/settings/TeamSection.tsx` | full Team UI | Уже покрывает задачу 4.2 |
| `src/lib/hooks/use-team-members.ts` | role + mutations | Уже шире, чем «добавить роль» |
| Next free migration | **047+** | Любой новый invite/token work — сюда |

На `main` gaps относительно **целей** S26 **нет**. Gaps только относительно **современного** invite-security (040 TODO) — это не этот файл.

---

## Предлагаемые правки в спринт

1. **Не править** sprint-26 для CC-run. Пометить в шапке (опционально, отдельным коммитом docs):  
   `Status: APPLIED 2026-07-06 · archive 025/026 · do not re-run · see review-sprint-26-…`.  
2. Новый work:  
   - token invite accept RPC + `/invite` (из TODO 040);  
   - email-канал (S30);  
   - не дублировать колокольчик/Team.  
3. Если нужен «эталон дизайна» — ссылаться на **archive 026**, не на черновик §2.4/2.5 (OLD/TG_OP, profile_id, 2-arg apply).

---

## Чеклист перед CC

- [ ] **Не запускать** этот файл в Claude Code как executable sprint  
- [ ] Не создавать `025_*.sql` / `026_*.sql` в `supabase/migrations/` (active)  
- [ ] Не `CREATE OR REPLACE` `handle_new_user` / `apply_pending_invites` / `notif_update` по тексту спринта  
- [ ] Не сужать CHECK `notifications.type`  
- [ ] Source of truth: `archive/025`, `archive/026`, baseline, `040`, `045`, `docs/schema.md`  
- [ ] UI/hooks: `NotificationBell`, `TeamSection`, `use-notifications`, `use-invitations`, `use-team-members` — уже done  
- [ ] Новый scope → миграция **≥ 047**, отдельный sprint-файл  
- [ ] (Опционально) ручной шаг Leaked password protection — вне DDL; не блокер ревью кода  

---

## crm-architect checklist (как runnable на `main`)

| Пункт | Статус |
|-------|--------|
| РАЗВЕДКА в начале | ✅ есть в тексте / ❌ claims vs live ложны |
| Реальные table/column names | ✅ (и уже в проде) |
| Реальные file paths | 🟡 settings path / layout устарели |
| learnings gotchas | ✅ 011, EXCEPTION, no set_org_id, ACL — учтены в дизайне |
| SQL as files, not apply from CC | ✅ |
| org_id / RLS org-first + role | ✅ |
| SECURITY DEFINER + search_path + ACL | ✅ |
| No `flowType: 'implicit'` | ✅ (не трогает client) |
| DELETE via CASCADE/SET NULL | ✅ 025 |
| CSS tokens only | ✅ в applied UI |
| schema.md after migration | ✅ уже обновлён historically; задача 5 «pending» ложна |

**Итог:** сильный **исторический** handoff фазы 1 (дизайн → archive → gate), **нулевая** ценность как runnable на текущем `main`. Не запускать.
