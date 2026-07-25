# Ревью: S-ONBOARD-1 — профиль self-service + welcome-гейт + T1c email-guard

**Дата:** 2026-07-18  
**Ревьюер:** Grok (верификация по коду `main` @ `47763fd`, schema/architecture/learnings crm-architect, migrations → **059**, middleware, invite, Settings/Team, hooks)  
**Объект:** `_analysis/sprint-S-ONBOARD-1.md` — 061 onboarding · `session_gate` · `complete_onboarding` · `/welcome` · avatars · T1c `wrong_email`  
**Контекст:** T1a (`058_accept_invitation`) token-only в репо; инцидент «owner сжёг чужой invite»; empty `full_name` → «Без имени» в Team; W3 scale резервирует **060** (`contact_last_touch`)

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Диагноз: magic-link без meta → `full_name=''` | ✅ `handle_new_user` baseline L629–630 |
| Self-service only (не owner-edit чужих) | ✅ `profiles_update_own` + 054 WITH CHECK |
| T1c: burn токена под чужой сессией | ✅ 058 L14–19 trade-off + stamp L53 |
| Номер миграции **061** (054–059 заняты; 060 reserved W3) | ✅ файлов 060/061 нет; W3 = `060_contact_last_touch` |
| RPC DEFINER + `search_path` + ACL | ✅ шаблон совпадает 058/learnings |
| Middleware: org → welcome, exclude `/welcome` | ✅ точка вставки L77–87; паттерн `/invite` L46 |
| Storage avatars per-uid (зеркало 055) | ✅ путь/foldername; см. W5 |
| SELECT `email` в REPLACE `accept_invitation` | 🟡 **W1** (обязательный HOW) |
| invite UI: catch-all → `invalid` | 🟡 **W2** |
| `useTeamMembers` + `job_title` | 🟡 **W3** |
| `profiles_update_own` «USING+CHECK» | 🟡 **W4** (054 уже есть) |
| Public avatars + policy re-apply | 🟡 **W5** |
| `git add -A` | 🟡 **W6** |
| crm-architect checklist | ✅ |

**Оценка: 8.5/10.** Зрелый, нужный спринт; диагноз и объём совпадают с live-кодом. Формальных блокеров «не запускать» нет, если CC в 061 явно расширит SELECT до `email` (W1) и в том же PR сделает UI `wrong_email` (W2).  
**Рекомендация:** **запускать в Claude Code** с HOW W1–W3 в уме; миграцию **не** apply из CC; фронт с `session_gate` деплоить **после** apply 061 гейтом (fail-open спасёт app, онбординг — нет).

---

## Статус (репо vs спринт)

| Заход | Статус в репо |
|-------|---------------|
| 058 `accept_invitation` (token-only) | ✅ `supabase/migrations/058_accept_invitation.sql` |
| `/invite` + middleware org-guard + `next` | ✅ `src/app/(auth)/invite/page.tsx`, middleware L44–87 |
| `inviteLink(token)` | ✅ `use-invitations` |
| profiles: `full_name`, `avatar_url`, `settings` | ✅ baseline L1765–1772; `phone`/`job_title`/`onboarded_at` ❌ |
| Settings profile read-only (email initials) | ✅ `SettingsContent` L44–61 |
| TeamSection «Без имени» / initials only | ✅ L69–74; `avatar_url` не рендерится |
| AssigneeSelect уже рисует `avatar_url` | ✅ — после загрузки аватара assignee оживёт сам |
| `session_gate` / `complete_onboarding` / 061 | ❌ |
| `/welcome` · ProfileForm · `use-avatar` | ❌ |
| бакет `avatars` | ❌ (в git только `project-files` 055) |

---

## Разведка (верификация утверждений)

| Утверждение спринта | Live-факт |
|---------------------|-----------|
| `handle_new_user` → `COALESCE(meta->>'full_name','')` | ✅ baseline L629–630 |
| Никто не пишет в `profiles` с клиента | ✅ grep `from('profiles')` — только SELECT в `use-team-members` |
| `profiles_update_own` self only | ✅ baseline L3561 USING; **054** L55–56 `WITH CHECK (id = auth.uid())` |
| Триггер `updated_at` на profiles | ✅ `set_updated_at` → `update_updated_at` L2494 (**не** moddatetime) |
| middleware org-guard `current_org_id` | ✅ L77–87; `/invite` excluded L46; fail-open L79–80 |
| 058 SELECT `id, org_id, role` — **без email** | ✅ L37–42; `invitations.email` NOT NULL в схеме L1602 |
| invite Phase: checking/accepting/invalid/no-token | ✅ L10; unknown status → `invalid` L46–48 |
| `signOut()` на invite | ✅ L71–75 |
| Settings profile ~стр.46 | ✅ карточка L44–61 (email, не full_name) |
| TeamSection full_name / initials | ✅ L30–34, 69–74 |
| `useTeamMembers` select | ✅ L32: `id, full_name, avatar_url` — **нет** `job_title` |
| `use-actor` читает full_name | ✅ |
| LeadModal RHF+zod | ✅ референс валиден |
| `useUploadProjectFile` path `{uid}/…` | ✅ L42–49; bucket `project-files` |
| След. миграция 061; 060 reserved W3 | ✅ 058/059 есть; 060/061 нет; `_analysis/sprint-w3-scale.md` → `060_contact_last_touch.sql` |
| Storage: только project-files в миграциях | ✅ 055 |
| `(auth)/layout` — минимальный chrome | ✅ center layout; `/welcome` логично сюда |

---

## С чем согласен полностью

### 1. Продукт и root-cause

Magic-link/OTP не кладут `full_name` в meta → `handle_new_user` пишет `''` → Team «Без имени». Self-service `/welcome` + Settings — правильный масштаб (owner не вводит чужие имена). RLS уже запрещает чужой UPDATE — owner-edit UI не нужен.

### 2. T1c (must-have в том же 061)

058 осознанно token-as-bearer (L14–19) и **сам** документирует будущий `wrong_email`. Инцидент: wrong session + `accepted_at = now()` = burned invite. Фикс: проверка email **до** INSERT/stamp + статус `wrong_email` без stamp + UI «выйти / войти под нужным» — корректно. ACL/DEFINER/search_path/идемпотентность 058 сохранить.

### 3. Пакет 061

- nullable `phone` / `job_title` / `onboarded_at` + backfill по non-empty `full_name`  
- `session_gate()` один round-trip (org + onboarded)  
- `complete_onboarding` — server guard имени, `where id = auth.uid()`  
- avatars public read / own-folder write  

Модель «CC пишет SQL, Cowork apply» — соблюдена.

### 4. Middleware order

org-less → `/invite` (приоритет); org && !onboarded → `/welcome`; fail-open при error RPC; exclude `/welcome` как `/invite` — иначе цикл. После accept `router.replace('/')` middleware сам отправит на welcome — отдельная ветка на invite page не обязательна.

### 5. Имена «оживут» сами

Хуки уже читают `full_name`/`avatar_url`; AssigneeSelect уже показывает аватар. После онбординга Team/assignee обновятся через invalidate `team-members`.

### 6. 060 не занимать; один коммит фронт+SQL; apply до деплоя гейта

---

## Блокеры (критично — исправить до запуска)

**Нет**, при условии что HOW **W1** (email в SELECT) и **W2** (UI wrong_email + whitelist status) попадут в реализацию 061/invite в том же PR. Без W1 REPLACE `accept_invitation` упадёт на `v_invite.email` (record без поля).

---

## Предупреждения (желательно исправить / HOW для CC)

### W1. `v_invite.email` — расширить SELECT (обязательный HOW)

Сейчас 058:

```sql
select id, org_id, role into v_invite
  from public.invitations
 where token = p_token and accepted_at is null and expires_at > now()
 for update;
```

Сниппет T1c читает `v_invite.email` → **PL/pgSQL: record has no field "email"**, если SELECT не расширить:

```sql
select id, org_id, role, email into v_invite
  ...
```

Проверку email — **после** found, **до** INSERT membership и stamp `accepted_at`.

### W2. invite UI: parse status + текущий email + next после logout

Сейчас L46–48: любой status кроме `accepted` / `unauthenticated` / `invalid` → `invalid`.  
`wrong_email` без правки UI = «Ссылка недействительна», хотя токен жив (плохой UX, не data-loss).

Обязательно в том же PR:

- Phase `'wrong-email'` + `invitedEmail`  
- whitelist `wrong_email` **до** catch-all invalid  
- текст: текущий `user.email` (сохранить из `getUser`) + `data.invited_email`  
- «Выйти»: лучше `signOut` → `/login?next=/invite?token=…`, иначе токен теряется из URL (сейчас L71–75 → bare `/login`)

### W3. TeamSection `job_title` без select в хуке

Задача 4: под именем `job_title`.  
`use-team-members.ts` L32 селектит только `id, full_name, avatar_url`; `TeamMember` без `job_title`.

```ts
.select('id, full_name, avatar_url, job_title')
// TeamMember += job_title: string | null
```

Иначе UI всегда пуст. Аватар в TeamSection — отдельный рендер (сейчас только initials L69–70); AssigneeSelect уже готов.

### W4. Формулировка RLS `profiles_update_own`

Спринт: «USING+CHECK уже есть». Baseline — USING-only; **054** добавил WITH CHECK. Не дублировать ALTER в 061. Для avatar direct-update под RLS — достаточно.

### W5. Public avatars + policy hygiene

- `public=true` → URL предсказуем при известном `{uid}` + ext — для аватаров обычно ок; зафиксировать.  
- `CREATE POLICY` без `DROP POLICY IF EXISTS` → re-apply гейта упадёт; зеркалить 055.  
- Initplan: 055 использует `( select auth.uid() )::text`; спринт — bare `auth.uid()::text`. Предпочтительно wrapper (advisor/learnings).  
- Отдельная SELECT-policy при public bucket для `getPublicUrl` не нужна — ок.

### W6. `git add -A`

Слишком широко (в working tree уже чужие dirty handoff/review). Явный list: `061_*.sql`, middleware, `(auth)/welcome`, ProfileForm/AvatarUpload, validators/hooks, invite page, Settings/Team, types после gen.

### W7. `onboarded ?? true` fail-open

При error/битом shape — не гейтить welcome. **Не** ставить `?? false` (lockout). Согласовано с org-guard fail-open.

### W8. Avatar vs `complete_onboarding`

RPC не трогает `avatar_url` — client update под RLS. UX: аватар до/после submit имени — оба ок; задокументировать «после/параллельно», не блокировать submit без аватара.

### W9. Phone / Zod empty string

`optional()` + empty `""` vs RPC `nullif(btrim(...),'')`. Лучше transform `'' → undefined` / align с server.

### W10. Deploy order

Фронт с `rpc('session_gate')` **после** apply 061. До apply: error → fail-open, welcome не работает. Порядок в коммите/тексте спринта верный.

### W11. (minor) «moddatetime» в разведке

Триггер — `update_updated_at`, не extension moddatetime. На реализацию не влияет.

### W12. (minor) `/welcome` для уже onboarded

Спринт не редиректит onboarded с `/welcome` на `/`. Опционально; не блокер.

### W13. (minor) загрузка own profile в Settings

Нет `useOwnProfile`; Settings сейчас только `userEmail`. ProfileForm mode=settings нужен fetch `profiles` where id = auth.uid() (или расширить props). Упомянуть в HOW.

### W14. schema.md после apply

Спринт: gen types. crm-architect: обновить schema.md (колонки + RPC + bucket) — гейт/отдельный docs-pass.

---

## Пропущенные места

| Файл | Строки / факт | Действие |
|------|----------------|----------|
| `058` REPLACE в 061 | L37–42 SELECT без email | + `email` (W1) |
| `src/app/(auth)/invite/page.tsx` | L10, 46–48, 71–75 | phase wrong-email; whitelist; next=token (W2) |
| `src/lib/hooks/use-team-members.ts` | L9–14, 32 | + `job_title` (W3) |
| `src/components/settings/TeamSection.tsx` | L69–76 | img avatar + job_title |
| `src/lib/supabase/middleware.ts` | L77–87 | `session_gate` + `isWelcome` |
| `src/types/supabase.gen.ts` / `database.ts` | profiles Row | gen после 061 |
| `src/lib/hooks/use-avatar.ts` | — | new |
| `src/components/settings/ProfileForm.tsx` | — | new |
| `src/app/(auth)/welcome/page.tsx` | — | new |
| Storage policies avatars | — | drop-if-exists + initplan wrapper |
| `AssigneeSelect` / `ProjectTeam` | уже avatar | out of scope — ок |

---

## Предлагаемые правки в спринт (опционально, до CC)

1. В T1c явно: `select id, org_id, role, email into v_invite`.  
2. В invite HOW: whitelist status + `login?next=/invite?token=`.  
3. В задачу 4: «расширить `useTeamMembers` select/interface на `job_title`».  
4. Storage: `DROP POLICY IF EXISTS` + `( select auth.uid() )`.  
5. Коммит: explicit paths вместо `git add -A`.  
6. Разведка: `update_updated_at`, не moddatetime.

CC может отработать и без правки файла спринта, если HOW выше попадут в исполнение.

---

## Чеклист перед CC

- [x] 061 свободен; 060 reserved под W3 `contact_last_touch`  
- [x] T1a surface (058 + invite + middleware) готов к T1c  
- [x] Точка вставки middleware ясна (L77–87)  
- [x] `profiles_update_own` + 054 WITH CHECK — avatar/settings update  
- [x] РАЗВЕДКА-команды спринта валидны (пути существуют)  
- [ ] HOW: email в SELECT (W1)  
- [ ] HOW: invite wrong-email UI + status whitelist (W2)  
- [ ] HOW: team-members + job_title (W3)  
- [ ] Не apply 061 из CC  
- [ ] Гейт: smoke wrong_email (accepted_at NULL) + welcome + avatar RLS deny чужой uid  
- [ ] gen types + (желательно) schema.md после apply  

---

## crm-architect checklist

| Item | |
|------|--|
| Starts with РАЗВЕДКА | ✅ |
| Real table/column names | ✅ profiles + invitations.email; новые колонки явно в 061 |
| Real file paths | ✅ middleware, invite, Settings, Team, hooks |
| learnings (DEFINER search_path, no flowType, no apply from CC) | ✅ |
| SQL as file; not applied from CC | ✅ |
| org boundary / role | ✅ session_gate → current_org_id; profile self via auth.uid |
| New functions DEFINER + ACL | ✅ revoke public/anon, grant authenticated |
| No `flowType: 'implicit'` | ✅ N/A (не трогает client config) |
| DELETE CASCADE | N/A |
| CSS variables / theme | ✅ text-text-* classes |
| schema.md after migration | 🟡 post-gate |

---

## Порядок относительно team-wave

```
T1a (058 accept_invitation)     ✅ in repo
T2  (059 membership_role_guard) ✅ applied (HEAD docs)
S-ONBOARD-1 (061)               ← this (T1c + profile/welcome)
W3 scale (060 contact_last_touch) reserved — не занимать
```

**Итог:** спринт готов к Claude Code. Главный HOW — **добавить `email` в SELECT** при CREATE OR REPLACE `accept_invitation`, UI `wrong_email` в том же PR, и `job_title` в `useTeamMembers`. Миграцию применяет гейт Cowork; деплой фронта — после apply.
