# Ревью: Sprint T1b — Автодоставка инвайт-письма (Resend)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `main` @ `2fe8806`, `supabase/functions/*`, `config.toml`, `use-invitations.ts`, `TeamSection.tsx`, schema/architecture/learnings crm-architect, `docs/schema.md`, T1a/T1c)  
**Объект:** `_analysis/sprint-t1b-invite-email.md` — edge `invite-email` (Resend) + `functions.invoke` после create  
**Контекст:** TEAM-READINESS 2026-07-18 (вариант B); T1a (`058` + `/invite?token=`, commit `5846c55`) и T1c email-guard (`061`) — **в HEAD и в проде** (061 APPLIED 2026-07-18). Письмо — не блокер онбординга (ручная копия ссылки уже есть).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (команды и ожидания) | ✅ совпадает с live |
| Scope: только доставка, additive | ✅ |
| Зависимость от T1a (token-link) | ✅ T1a **уже в репо и в проде** |
| Edge security (JWT, no service_role, RLS, `verify_jwt`) | ✅ как ai-summarize/ai-run |
| Soft-fail UX (create ≠ fail mail) | 🟡 **W1** (ловушка `TeamSection.onError`) |
| Реальные пути/таблицы/колонки | ✅ |
| Имя org в subject | 🟡 **W2** (как достать — не расписано) |
| HTML / APP_ORIGIN | 🟡 **W3** |
| Rate limit / spam resend | 🟡 **W4** |
| Секреты / deploy только на гейте | ✅ |
| Миграции SQL | ✅ не нужны |
| crm-architect checklist | ✅ |

**Оценка: 8.5/10.** Узкий, правильный security-контур, корректно отвязан от T1a.  
**Рекомендация:** **запускать в CC** (код готов писать). Перед смоком гейта — аккаунт Resend + secrets; decision «Resend vs SMTP» зафиксировать (промпт уже под Resend).

---

## Статус (репо сейчас)

| Заход | Статус в репо (`2fe8806`) |
|-------|---------------------------|
| T1a: `inviteLink(token)` → `/invite?token=` | ✅ `use-invitations.ts` L15–17 |
| T1a: create `.select('id, token')` | ✅ L52–60 |
| T1a: `/invite` + `accept_invitation` | ✅ `src/app/(auth)/invite/page.tsx`; gen stub L2384; 061 applied |
| Edge-образцы | ✅ `supabase/functions/{ai-summarize,ai-run}/` + `deno.json` |
| `config.toml` `verify_jwt` | ✅ `ai-summarize`, `ai-run` |
| `invite-email` | ❌ нет |
| `functions.invoke` в create invite | ❌ нет (только ai-summary/ai-run) |
| Подсказка TeamSection «авто-письмо позже» | ✅ L177–179 — цель задачи 3 |
| «Отправить повторно» | ❌ нет (опционально в спринте) |

---

## Разведка (верификация утверждений спринта)

| Утверждение спринта | Live | Вердикт |
|---------------------|------|---------|
| `ls supabase/functions/` → ai-summarize/ai-run | только `ai-run`, `ai-summarize` | ✅ |
| Паттерн JWT-клиент, CORS, secrets, `verify_jwt` | `ai-summarize/index.ts` L101–117; config L7–14 | ✅ |
| `useCreateInvitation` — точка врезки | L39–63: insert → `inviteLink`; **invoke нет** | ✅ |
| Ссылка `${origin}/invite?token=` | `inviteLink` L15–17 | ✅ (T1a) |
| RLS invitations: owner/admin | schema: `inv_select/insert/delete` = `current_org_id()` + role ∈ owner/admin | ✅ |
| Колонки `id`, `token`, `email`, `org_id` | `Invitation` в `database.ts` L450–460 | ✅ |
| `organizations.name` для subject | schema: `organizations.name` NOT NULL; SELECT `is_org_member` | ✅ (доступ есть; в задаче 1 шага нет) |
| `TeamSection.tsx` путь | `src/components/settings/TeamSection.tsx` | ✅ |
| COMMIT-инвентарь | 4 пути — все реальны; `invite-email/` ещё нет | ✅ |
| Нет SQL-миграции | email-only, без DDL | ✅ |

**Вывод:** разведка и file inventory актуальны. Промпт можно исполнять as-is; доработки — уточнения UX/HTML, не переписывание архитектуры.

---

## С чем согласен полностью

### 1. Порядок: T1a → T1b
Письмо без token-flow — «ловушка» (TEAM-READINESS). T1a/T1c уже закрыты; T1b только доставляет `${APP_ORIGIN}/invite?token=…`.

### 2. Security-контур edge
- Клиент под JWT вызывающего + `SUPABASE_ANON_KEY` (как ai-summarize)  
- **Без** `service_role`  
- `verify_jwt = true` в `config.toml`  
- Доступ к строке — **RLS invitations** (owner/admin своей org → 404 иначе)  
- Ключ Resend только `Deno.env.get('RESEND_API_KEY')`  
- Ошибки провайдера → нейтральный 502 + `console.error`

Совпадает с learnings (нет `flowType: 'implicit'`; секреты/модель-like через env).

### 3. Soft-fail доставки
Инвайт создан в БД → ручная копия ссылки (T1a) остаётся fallback. Провал Resend не должен быть «Не удалось пригласить».

### 4. Env-driven (`RESEND_API_KEY`, `APP_ORIGIN`, `INVITE_FROM`)
Смена without redeploy — тот же принцип, что `AI_*_MODEL` в learnings.

### 5. Нет миграции / schema.md delta
Только edge + клиент. `get_advisors` «без новых WARN» — формально ок (нет новых policy), но на гейте всё равно прогнать.

### 6. Опциональный resend + текст TeamSection
Правильный scope: resend = nice-to-have; задача 3 — одна строка копи.

---

## Блокеры (критично — исправить до запуска)

**Нет блокеров для CC** при выборе Resend (как в промпте).

**Не считать смок «зелёным»**, пока на гейте:

1. Secrets: `RESEND_API_KEY`, `APP_ORIGIN` (prod URL, **не** из body клиента), `INVITE_FROM`  
2. `supabase functions deploy invite-email` с `verify_jwt=true`  
3. Письмо → клик → `/invite?token=` → accept (T1a)  
4. Чужой `invitation_id` / non-owner·admin → 404  

Инфра Resend (аккаунт, домен или `onboarding@resend.dev`) — **гейт**, не блокирует написание кода в CC.

---

## Предупреждения (желательно исправить в промпте / при имплементации)

### W1. Soft-fail vs `TeamSection.onError` (ловушка)

Сейчас `InviteForm` (L137–141):

```ts
onError: (err) => setError(err instanceof Error ? err.message : 'Не удалось пригласить'),
```

Если CC в `mutationFn` после успешного INSERT сделает `throw` на `functions.invoke` error — UI покажет **жёсткий** фейл create, вопреки задаче 2.

**Явный контракт для CC:**

```ts
// после insert (data.id, data.token)
const { error: mailErr } = await supabase.functions.invoke('invite-email', {
  body: { invitation_id: data.id },
});
if (mailErr) {
  toast.warning('Инвайт создан, но письмо не ушло — скопируйте ссылку');
  // НЕ throw
}
return inviteLink(data.token);
```

`toast` из `sonner` уже в settings (`ProfileForm`, `AvatarUpload`). Паттерн ai-summary (throw on invoke error) **не** копировать 1:1.

### W2. Имя org для subject/HTML

Задача 1: subject «Приглашение в \<org\>», но в шагах только `select * from invitations`. Имя org — вторым запросом под тем же JWT:

```ts
.from('organizations').select('name').eq('id', invite.org_id).maybeSingle()
```

RLS: `is_org_member(id)` — owner/admin, видевший invite, читает org. Fallback: «вашу организацию», если name пустой.

### W3. HTML / APP_ORIGIN

- `APP_ORIGIN` **только** secret; не брать origin из body/headers клиента (open-link / phishing).  
- `token` — uuid → в query safe; всё равно `encodeURIComponent`.  
- Org name / email — **текст** (escape `& < > "` в HTML); **не** в атрибуты `href` кроме собранного URL.  
- Subject: plain text, без HTML.

### W4. Abuse / resend spam

Owner/admin может долбить `invite-email` по id. v1: Resend rate limits + опционально skip если `accepted_at IS NOT NULL` или `expires_at < now()`. Не блокер.

### W5. Нет секции «ЖЁСТКО НЕ ТРОГАТЬ»

Рекомендуемый список (для CC):

- `accept_invitation` / `apply_pending_invites` / `handle_new_user`  
- service_role в edge  
- `flowType` / `storageKey` в supabase client  
- SMTP/GoTrue (если остаёмся на Resend)  
- schema/migrations (нет DDL)

### W6. Опциональная кнопка «Отправить повторно»

Если делать: отдельный маленький mutate/handler + pending per `inv.id`, **не** смешивать с create. Иначе раздут scope.

### W7. Stale refs (не править в T1b, знать)

- crm-architect `architecture.md`: `inviteLink` ещё как `/login?invited=1` — **устарело** (T1a).  
- schema skill: «token не кладётся в ссылку» — **устарело**.  
Live-код и `docs/schema.md` (058/061) — источник истины.

### W8. Decision Resend vs SMTP

Промпт честно: «дальше — Resend; SMTP — перепишу». Перед CC зафиксировать выбор, чтобы не писать Resend и на гейте уйти в SMTP.

---

## Пропущенные места

| Файл | Строки / факт | Действие |
|------|----------------|----------|
| `src/lib/hooks/use-invitations.ts` | L39–63 create без invoke | **Задача 2** — invoke + soft toast |
| `src/components/settings/TeamSection.tsx` | L177–179 подсказка | **Задача 3** — новый текст |
| `src/components/settings/TeamSection.tsx` | PendingInvites L201–221 | resend-кнопка (опц.) рядом с copy |
| `supabase/config.toml` | L7–14 | добавить `[functions.invite-email] verify_jwt = true` |
| `supabase/functions/invite-email/` | отсутствует | **Задача 1** (+ `deno.json` как у ai-summarize) |
| `src/lib/hooks/use-ai-summary.ts` | L30–32 | образец `functions.invoke` (но **не** throw-семантику) |

Ложных путей в COMMIT-секции нет.

---

## crm-architect checklist

- [x] РАЗВЕДКА в начале  
- [x] Реальные table/column (`invitations`, `organizations.name`)  
- [x] Реальные пути (`use-invitations.ts`, `TeamSection.tsx`, `supabase/functions/`)  
- [x] learnings: no service_role, JWT+RLS, env secrets, no flowType  
- [x] SQL-миграций нет → apply из CC не требуется  
- [x] org boundary через RLS invitations (не императивный DEFINER)  
- [x] Edge: не SQL DEFINER — ACL/search_path N/A; `verify_jwt` + getUser defense-in-depth как S28  
- [x] DELETE/CASCADE N/A  
- [x] CSS N/A  
- [x] schema.md update N/A (нет DDL; после деплоя edge — по желанию note в architecture)

---

## Предлагаемые правки в спринт (косметика, не стоп)

1. В задаче 2 явно: **не throw** после failed invoke; `toast.warning(...)`; return link.  
2. В задаче 1: шаг `organizations.select('name')` + HTML-escape.  
3. Блок «НЕ ТРОГАТЬ» (W5).  
4. Гейт: проверить и `data?.ok` / non-2xx body, не только transport error.  
5. (Опц.) skip send если `accepted_at` set или expired.

---

## Чеклист перед CC

- [x] T1a token-flow в коде (`inviteLink`, `/invite`, RPC)  
- [x] T1a/T1c в проде (061 applied — accept + email-guard)  
- [x] Образцы edge: ai-summarize / ai-run + config.toml  
- [x] Soft-fail create заложен в промпте (уточнить throw — W1)  
- [ ] Решение: **Resend** (рекомендовано) vs SMTP  
- [ ] Аккаунт Resend + домен или test from  
- [ ] Secrets на гейте: `RESEND_API_KEY`, `APP_ORIGIN`, `INVITE_FROM`  
- [ ] Deploy `invite-email`, `verify_jwt=true`  
- [ ] Smoke: create → mail → accept; чужой id → 404  
- [ ] `npx tsc --noEmit`  
- [ ] `get_advisors` (ожидаемо без новых WARN)

---

**Итог:** спринт качественный, узкий, security-паттерн проекта соблюдён. **CC можно запускать.** Критично только не сломать soft-fail через `throw` + `TeamSection.onError` и на гейте не забыть secrets/Resend.
