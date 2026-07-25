# Ревью: Sprint T1a — Приём инвайта (token-flow)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/chat-ui`, ancestor `5846c55` T1a + `7211ce6` S-ONBOARD/T1c; crm-architect `schema.md` / `architecture.md` / `learnings.md`; `docs/schema.md`)  
**Объект:** `_analysis/sprint-t1a-invite-acceptance.md` — `accept_invitation(token)` · `/invite` · org-guard · токен-ссылки  
**Контекст:** TEAM-READINESS 2026-07-18; 040 `p_email_confirmed` + TODO token-flow; промпт уже впитал прошлые B1/W1 (guard в middleware, next-round-trip); поверх T1a в репо — T1c email-guard (061) и `session_gate` в middleware

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Диагноз бага (`handle_new_user` / timing `email_confirmed_at`) | ✅ совпадает с 040 + baseline `apply_pending_invites` |
| RPC DEFINER + `search_path` + адресный ACL | ✅ hardening-конвенция |
| `invitations.token` / UNIQUE memberships / role CHECK | ✅ схема реальна |
| Org-guard в middleware, не client layout | ✅ (B1 закрыт) |
| Next-round-trip login → callback → `/invite?token=` | ✅ (W1 закрыт) |
| Номер миграции 058 (на момент написания) | ✅ был свободен; **сейчас файл уже есть** |
| Token-only trade-off в SQL спринта | 🟡 **исторически ок; live-тело — 061 с email-guard** |
| Файл-инвентарь секции КОММИТ | 🟡 layout лишний, middleware/gen пропущены |
| Состояние «можно гонять CC» | ❌ **работа уже в git; повторный прогон опасен** |
| crm-architect checklist (как pre-flight спека) | ✅ |

**Оценка: 9/10** как pre-flight-спека (на момент написания).  
**Рекомендация:** **не запускать в Claude Code.** Спринт **уже реализован** (`5846c55`); live-функция дальше эволюционировала в 061 (T1c). Повторный `CREATE OR REPLACE` из SQL задачи 1 **откатит email-guard**. Остаётся только архив/дока; гейт Cowork по 058+061 — отдельно от «прогнать handoff».

---

## Статус

| Заход | Статус в репо (HEAD `feat/chat-ui`) |
|-------|-------------------------------------|
| `supabase/migrations/058_accept_invitation.sql` | ✅ есть; `docs/schema.md` header: цепочка 001–061 в проде; блок 058 всё ещё помечает «гейт» (док-дрейф), 061 **APPLIED** 2026-07-18 и **OR REPLACE** тела accept_invitation |
| `accept_invitation` | ✅ `src/types/supabase.gen.ts` + RPC; live-тело = **061** (`wrong_email`, select `email`) |
| `src/app/(auth)/invite/page.tsx` | ✅ client + Suspense; phases + **wrong-email** (сверх спеки T1a) |
| org-guard + allowlist `/invite` | ✅ `src/lib/supabase/middleware.ts` — через **`session_gate()`** (не голый `current_org_id`, как в тексте спринта) |
| login `next` → `callback?next=` | ✅ `login/page.tsx` L23–26 |
| callback safe-relative `next` | ✅ `callback/route.ts` L4–22 |
| `inviteLink(token)` → `/invite?token=` | ✅ `use-invitations.ts` L15–17 |
| create `.select('id, token').single()` | ✅ L52–59 |
| TeamSection copy + подсказка | ✅ L178–180, L190–206; `invited=1` в `src/` **нет** |
| `(dashboard)/layout.tsx` | ✅ **не тронут** (верно: L1 `'use client'`) |
| `(auth)/layout.tsx` | ✅ только chrome, сессии не требует |
| `config.matcher` | ✅ `/invite` не исключён (`src/middleware.ts` L9–17) |
| docs/schema + skill architecture (гейт) | 🟡 `docs/schema.md` частично; skill `architecture.md` всё ещё `inviteLink()` → `/login?invited=1`; body invitations: token «не кладётся в ссылку» |

---

## Разведка (утверждения спринта vs live)

| Утверждение спринта (как «до правок») | Live сейчас |
|---------------------------------------|-------------|
| `accept_invitation` / `/invite` нет | **Устарело** — migration 058/061, page, gen, middleware |
| `inviteLink` zero-arg `/login?invited=1` | **Устарело** — `inviteLink(token)` → `/invite?token=` |
| layout client → server redirect нельзя | ✅ L1 `src/app/(dashboard)/layout.tsx` |
| middleware cookie-session + `getUser` | ✅; **org-check = `session_gate`**, fail-open |
| 057 занят, 058 свободен | На момент T1a — да; сейчас 058–067+ в `supabase/migrations/` |
| `membership_insert` запрещает self-join invitee | ✅ baseline: owner/admin + `current_org_id` |
| token-колонка есть | ✅ uuid DEFAULT `gen_random_uuid()` |
| RPC: только `current_org_id` в guard | **Сужено спекой** — код использует `session_gate` (+ welcome) |
| Token-only, email-match НЕ добавлять | **Сужено 061 T1c** после инцидента 18.07 (owner сжигал чужой инвайт) |

**Вывод:** тело спринта — *целевое* состояние T1a, уже в git. РАЗВЕДКА как чеклист «ожидаемого grep до правок» исторически верна; как инструкция re-run — вводит в заблуждение.

---

## С чем согласен полностью

### 1. Корневая причина
`handle_new_user` (AFTER **INSERT** only) → `apply_pending_invites(..., p_email_confirmed := email_confirmed_at IS NOT NULL)`. Под magic-link на INSERT `email_confirmed_at` = NULL → гард 040 → 0 строк; подтверждение на UPDATE без триггера. Token-RPC независим от тайминга auth — правильный фикс. `handle_new_user` не трогать — верно.

### 2. RPC-дизайн (ядро T1a)
- `SECURITY DEFINER SET search_path = public, pg_temp`
- opaque статусы `unauthenticated` / `invalid` / `accepted`
- `FOR UPDATE` + `accepted_at IS NULL` + `expires_at > now()`
- `ON CONFLICT (org_id, profile_id) DO NOTHING` (как `apply_pending_invites`; UNIQUE есть — `memberships_org_id_profile_id_key`)
- REVOKE public/anon, GRANT authenticated  
DEFINER обходит RLS `inv_select` (owner/admin only) — иначе invitee не смог бы `SELECT … FOR UPDATE` по token.

### 3. Org-guard в middleware, не layout
Layout — `'use client'`; server `redirect()` там не работает. Guard в `updateSession` + исключение `/invite` — без рекурсии. Client-guard в layout хуже (мельк пустого UI) — верно отброшен.

### 4. Next-round-trip
Без `next` magic-link снова кидал бы org-less на `/`. Пакет login + callback open-redirect guard + middleware login-bounce + invite unauth → `/login?next=…` — полный и в коде.

### 5. UI токен-ссылок
Смена `inviteLink`, select token, copy pending, текст без «тот же email» — закрывает broken `/login?invited=1`.

### 6. Процесс
Миграция в git, **не apply из CC** — по правилам. T1b отдельно. ЖЁСТКИЕ границы (не трогать `handle_new_user`, не email-инфра) — уместны.

---

## Блокеры (критично — до «запуска» в CC)

### B1. Спринт уже исполнен — повторный прогон деструктивен

Код T1a в `5846c55` (8 файлов). Поверх:

- **061** `CREATE OR REPLACE accept_invitation` + email-guard + UI `wrong_email`
- middleware: **`session_gate`**, `/welcome`, порядок org-less → invite, потом welcome

Если CC выполнит SQL задачи 1 **как написано** (token-only body без `wrong_email`):

1. сотрёт T1c-гард (инцидент 18.07 вернётся);
2. UI `/invite` останется ждать `wrong_email`, которого SQL больше не отдаст;
3. `058_*.sql` уже существует — «создать 058» коллизия.

**Операционный блокер re-run, не блокер качества спеки на момент написания.**

### B2. (нет для first-run дизайна)

Прошлый B1 (server-guard в client layout) в текущем промпте **снят**. Новых design-блокеров по schema/RLS/paths нет.

---

## Предупреждения (желательно)

### W1. Секция КОММИТ — неверный inventory

Промпт:

```text
git add ... "src/app/(dashboard)/layout.tsx" ...
```

- **Лишнее:** `layout.tsx` — задача 3 запрещает client-guard; факт: layout **не** менялся.
- **Пропущено:** `src/lib/supabase/middleware.ts` (ядро org-guard) и `src/types/supabase.gen.ts` (stub RPC).

Фактический `5846c55` — правильные 8 файлов. Для архива HOW — поправить список.

### W2. Текст задачи 3 vs live middleware

Спринт: `await supabase.rpc('current_org_id')`.  
Live: `session_gate` → `{ org_id, onboarded }` (061). Поведение org-less → `/invite` сохранено, но copy-paste задачи 3 **перезапишет** welcome-гейт, если CC «приведёт middleware к спеке».

### W3. docs / skill lag

- `docs/schema.md`: 058/061 описаны в header/блоках; строка invitations «token не кладётся в ссылку — матчинг по email» **устарела**.
- skill `architecture.md` L377–380: всё ещё `inviteLink()` → `/login?invited=1`.
- skill `schema.md` helpers: `accept_invitation` + email-guard 061 уже есть; body invitations частично старый.

### W4. «Тост после create» — не специфицирован / не сделан

Задача 4 упоминает call site «тост после create»; InviteForm:

```ts
onSuccess: () => setEmail(''),
```

Мутация возвращает URL; форма не копирует и не toast. Рабочий путь: pending → «Скопировать». MVP ок; optional polish.

### W5. Нет UNIQUE/INDEX на `invitations.token`

Baseline UNIQUE только `(org_id, email)`. Lookup `WHERE token = p_token` — seq scan (таблица маленькая). Optional: `UNIQUE (token)`.

### W6. Token-only trade-off (исторический)

В SQL спринта и 058 — bearer-only. **Live политика = email-bind (061)** после инцидента. Спека T1a не должна читаться как «канон prod» без пометки T1c.

### W7. Edge: member с org на `/invite` без token

Org-guard не гонит **с org** с `/invite`. Редко: no-token copy «ещё не в организации» при живой membership. Optional: `orgId && /invite` без token → `/`.

### W8. UI: Card vs Button

Спринт: `ui/Button`, `ui/Card`. Реализация — `Button` + plain div (как login). Стиль ок; Card не обязателен.

---

## Пропущенные места

| Файл | Строки / факт | Действие при re-run |
|------|---------------|---------------------|
| `src/lib/supabase/middleware.ts` | L42–101: invite/welcome/session_gate | **не** упрощать до голого `current_org_id` |
| `supabase/migrations/061_onboarding.sql` | L26–67: email-guard | **не** перезаписывать телом из спринта T1a |
| `src/app/(auth)/invite/page.tsx` | L10, L64–69, L118–136: `wrong_email` | сохранить при любых правках |
| `src/types/supabase.gen.ts` | `accept_invitation` | в inventory коммита |
| skill `architecture.md` | L377–380 | обновить на token-flow (гейт/доки) |

Ложных файлов в scope спринта нет; лишний only `layout.tsx` в git add.

---

## Предлагаемые правки в спринт (если трогать файл)

1. **Шапка статуса:** «IMPLEMENTED (`5846c55`); live accept_invitation = 061 T1c; **do not re-run CC**».
2. **КОММИТ:** убрать `layout.tsx`; добавить `middleware.ts` + `supabase.gen.ts`.
3. **Задача 1 / trade-off:** ссылка на 061 — email-guard обязателен post-инцидент; SQL спринта = snapshot v1.
4. **Задача 3:** org-check через `session_gate` (или «не регрессировать welcome»).
5. **РАЗВЕДКА:** пометить expected outputs «до T1a» vs «после», чтобы CC не «чинил» уже готовое.
6. **Гейт docs:** явная правка body invitations (token в URL) + skill architecture.

---

## Чеклист crm-architect

- [x] Начинается с РАЗВЕДКА
- [x] Реальные table/column (`invitations.token`, `accepted_at`, `expires_at`, memberships UNIQUE)
- [x] Реальные пути (`(auth)/invite`, middleware, hooks, TeamSection)
- [x] learnings: DEFINER search_path; CASCADE не нужен; org boundary
- [x] SQL отдельным файлом; apply не из CC
- [x] org/RLS: DEFINER + ACL; self-insert memberships запрещён политикой — учтено
- [x] Нет `flowType: 'implicit'`
- [x] CSS: токены/примитивы, без новых тем
- [ ] schema.md/skill fully after migration — частично (W3); 058 apply-статус в docs header vs блок 058 — разъехались
- [x] ЖЁСТКО не трогать `handle_new_user` — верно

---

## Чеклист перед CC

- [x] **Не запускать CC по этому файлу** — код T1a + T1c уже в дереве
- [ ] Если цель — доки: обновить skill `architecture.md` + body invitations (token-flow, org-guard, `session_gate`)
- [ ] Если цель — prod-гейт: сверить live `accept_invitation` = тело 061 (wrong_email), не 058-only; advisors/ACL
- [ ] Не `CREATE OR REPLACE` из SQL задачи 1 поверх 061
- [ ] Не коммитить «исправление» middleware к тексту спринта (потеря welcome)
- [ ] T1b (email delivery) — отдельный спринт, не смешивать

---

**Итог:** спека T1a сильная и уже **исполнена**; live-система ушла дальше (email-guard + onboarding gate). Для Claude Code файл — **архив**, не handoff.
