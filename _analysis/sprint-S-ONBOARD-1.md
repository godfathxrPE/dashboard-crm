# Claude Code Prompt — Sprint S-ONBOARD-1: профиль пользователя + welcome-гейт (+ T1c invite email-guard)

Контекст: команда уже в орге (manager god4azer, filipasis), но у всех `profiles.full_name=''` → в «Команде» они «Без имени». Причина: `handle_new_user` берёт имя из `raw_user_meta_data->>'full_name'`, а magic-link/OTP метаданных не несёт. Модуля профиля НЕТ — ни welcome-экрана, ни редактирования, ни один компонент не пишет в `profiles`. Задел готов: `profiles.avatar_url` + `settings jsonb` в схеме; RLS `profiles_update_own` (USING+CHECK `id=auth.uid()`) уже разрешает self-service. Storage: только приватный `project-files` — аватарам нужен НОВЫЙ бакет.

**Решение (владелец): только self-service.** Owner-ввод чужих имён не масштабируется. Каждый вводит данные о себе сам на `/welcome` при первом входе; правит потом в Настройках. Owner чужие профили видит (read), не редактирует — это уже гарантирует RLS, доп. кода не требует.

**Модель миграций (НЕ нарушать):** ты пишешь миграцию `061_onboarding.sql` + коммитишь, **НЕ применяешь**. Применяет гейт Cowork через MCP `apply_migration` + смок ролями + advisors. Разведку БД — через Supabase MCP (read-only) или по файлам, не гадать.

**Следующая свободная миграция — 061.** (054–059 заняты; 060 зарезервирована под будущий W3 `contact_last_touch` — НЕ занимать.)

---

## РАЗВЕДКА (выполнить до правок)

```bash
cd ~/Downloads/dashboard-crm
# профиль: колонки, триггер updated_at, RLS
grep -n "handle_new_user\|profiles" supabase/migrations/20260712230000_baseline.sql | head
grep -rn "moddatetime\|updated_at" supabase/migrations/*.sql | grep -i profile
# middleware org-guard — точка вставки welcome-гейта
sed -n '40,90p' src/lib/supabase/middleware.ts
# accept_invitation — цель T1c
cat supabase/migrations/058_accept_invitation.sql
# /invite страница — добавим ветку wrong_email
sed -n '1,120p' 'src/app/(auth)/invite/page.tsx'
# профиль-карточка в Настройках (сделать редактируемой)
sed -n '40,70p' src/components/settings/SettingsContent.tsx
grep -n "full_name\|avatar\|initials" src/components/settings/TeamSection.tsx
# форм-референс (RHF + zodResolver + shadcn)
sed -n '1,60p' src/components/leads/LeadModal.tsx
# storage upload референс (зеркалим для аватара)
grep -rn "useUploadProjectFile" src/lib/hooks/*.ts
sed -n '1,80p' src/lib/hooks/use-project-files.ts 2>/dev/null || find src/lib/hooks -name "*project-file*"
# как читаются имена (эти хуки после онбординга оживут сами)
grep -n "full_name" src/lib/hooks/use-team-members.ts src/lib/hooks/use-actor.ts
```
Интроспекция живой БД (Supabase MCP, read-only): подтвердить колонки `profiles` (`id,full_name,avatar_url,settings,created_at,updated_at`), наличие `moddatetime`-триггера на `profiles`, список бакетов (ожидаем только `project-files`).

---

## ЗАДАЧА 0 (T1c) — invite email-guard: чужая ссылка не сгорает под залогиненным

WHY: 058 принимает инвайт по токену БЕЗ проверки email (trade-off «токен=bearer»). Инцидент 18.07: owner, открыв invite-ссылку коллеги в своей сессии, принял инвайт под своим uid — токен сгорел, коллега выпал из pending. Чиним и в БД (не стемпить accepted_at при несовпадении), и в UI (объяснить + дать сменить аккаунт).

**061_onboarding.sql — секция T1c (CREATE OR REPLACE accept_invitation).** Добавить проверку email ПОСЛЕ выборки инвайта, ДО INSERT membership:
```sql
-- ... после SELECT ... INTO v_invite ... for update; и проверки found:
if lower((select email from auth.users where id = v_uid)) <> lower(v_invite.email) then
  -- НЕ стемпим accepted_at — токен остаётся валиден для правильного адресата
  return jsonb_build_object('status','wrong_email', 'invited_email', v_invite.email);
end if;
```
Остальное тело 058 не менять (идемпотентность, стемп accepted_at только на успешном пути). ACL/DEFINER/search_path сохранить как в 058.

**`src/app/(auth)/invite/page.tsx`** — обработать новый статус:
- добавить `'wrong-email'` в тип `Phase` + хранить `invitedEmail`;
- в разборе `status`: если `wrong_email` → `setPhase('wrong-email')`, сохранить `data.invited_email`, НЕ считать это `invalid`;
- экран: «Вы вошли как {текущий email}, а приглашение для {invited_email}. Выйдите и войдите под нужным адресом.» + кнопка «Выйти» (переиспользовать существующий `signOut()` — уже есть в компоненте).

VERIFY (для гейта Cowork): под owner-сессией открыть токен инвайта другого email → `wrong_email`, `accepted_at` в БД остался NULL, экран смены аккаунта. Правильный адресат по той же ссылке → `accepted`.

---

## ЗАДАЧА 1 — миграция 061: колонки профиля, бакет аватаров, RPC гейта и онбординга

**061_onboarding.sql** (одна миграция, секции комментариями; используй `IF NOT EXISTS`/`IF EXISTS`):

1. **Колонки `profiles`** (аддитивно, nullable — backward-compat):
```sql
alter table public.profiles
  add column if not exists phone      text,
  add column if not exists job_title  text,
  add column if not exists onboarded_at timestamptz;
```
Email НЕ добавлять — он в `auth.users`, читаем через join/RPC (single source of truth).

2. **Backfill** — кто уже с именем, тот онбординг не проходит (не гейтить owner):
```sql
update public.profiles set onboarded_at = now()
 where onboarded_at is null and coalesce(full_name,'') <> '';
```

3. **Бакет `avatars`** (публичный read — аватар не секрет; upload/update/delete — только своя папка `{uid}/…`, паттерн 055 но ключ = uid, не org):
```sql
insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
  on conflict (id) do nothing;

-- RLS storage.objects для avatars
create policy "avatars_insert_own" on storage.objects for insert to authenticated
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );
create policy "avatars_update_own" on storage.objects for update to authenticated
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text )
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );
create policy "avatars_delete_own" on storage.objects for delete to authenticated
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );
-- read: bucket public=true покрывает публичное чтение; отдельная select-policy не нужна.
```

4. **RPC `session_gate()`** — один round-trip для middleware (заменяет отдельный `current_org_id`-вызов, готовит почву под будущий JWT-claim):
```sql
create or replace function public.session_gate()
returns jsonb language sql security definer set search_path = public, pg_temp stable as $$
  select jsonb_build_object(
    'org_id', public.current_org_id(),
    'onboarded', exists (select 1 from public.profiles p where p.id = auth.uid() and p.onboarded_at is not null)
  );
$$;
revoke all on function public.session_gate() from public, anon;
grant execute on function public.session_gate() to authenticated;
```

5. **RPC `complete_onboarding()`** — серверный гард «имя обязательно» (чтобы гейт нельзя было проскочить пустым сабмитом; аватар грузится отдельно в storage, тут только текст):
```sql
create or replace function public.complete_onboarding(p_full_name text, p_phone text, p_job_title text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  if coalesce(btrim(p_full_name),'') = '' then raise exception 'full_name required' using errcode='23514'; end if;
  update public.profiles
     set full_name = btrim(p_full_name),
         phone = nullif(btrim(coalesce(p_phone,'')),''),
         job_title = nullif(btrim(coalesce(p_job_title,'')),''),
         onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid();
end $$;
revoke all on function public.complete_onboarding(text,text,text) from public, anon;
grant execute on function public.complete_onboarding(text,text,text) to authenticated;
```
Профильная `profiles_update_own` RLS не трогать — она уже разрешает own-row update (аватар через прямой update под RLS).

После применения (гейтом): `generate_typescript_types` → `src/types/database.ts`, снять возможные overrides в `entities.ts`.

---

## ЗАДАЧА 2 — welcome-гейт в middleware

`src/lib/supabase/middleware.ts`: в блоке org-guard заменить вызов `supabase.rpc('current_org_id')` на `session_gate()` и добавить ветку онбординга. Исключить `/welcome` из гейта (как уже исключён `/invite` — иначе цикл).
```ts
const isWelcome = path.startsWith('/welcome');
if (user && !isInvite && !isWelcome && !isAuthRoute) {
  const { data: gate, error } = await supabase.rpc('session_gate');
  const orgId = (gate as { org_id?: string | null } | null)?.org_id ?? null;
  const onboarded = (gate as { onboarded?: boolean } | null)?.onboarded ?? true; // fail-open
  if (!error && !orgId) { /* → /invite, как сейчас */ }
  else if (!error && orgId && !onboarded) {
    const url = request.nextUrl.clone(); url.pathname = '/welcome'; url.search = '';
    return NextResponse.redirect(url);
  }
}
```
Порядок: org-less → `/invite` (приоритет, у него ещё нет орга), затем org-есть-но-не-онбордился → `/welcome`. Fail-open при ошибке RPC (не блокировать легитимного юзера).

---

## ЗАДАЧА 3 — `/welcome` экран + переиспользуемая форма профиля

WHY (CRM-паттерн): HubSpot «Complete your profile» гейт до входа в продукт; Salesforce обязательные User-поля (Name required) + аватар. Копируем: имя обязательно, остальное опционально.

1. **`src/lib/validators/profile.ts`** — Zod:
```ts
export const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Укажите имя'),
  phone: z.string().trim().optional(),
  job_title: z.string().trim().optional(),
});
```
2. **`src/components/settings/ProfileForm.tsx`** — переиспользуемая форма (RHF + zodResolver + shadcn, референс LeadModal): поля ФИО (required) / телефон / должность + блок аватара (компонент `AvatarUpload`, задача 4). Проп `mode: 'onboarding' | 'settings'`:
   - `onboarding`: submit → `supabase.rpc('complete_onboarding', {...})` → invalidate `['org-role']`/`['team-members']`/профильный ключ → `router.replace('/')`;
   - `settings`: submit → прямой `update profiles` (RLS пускает) + toast, без редиректа. Dirty-state как в остальных модалках.
3. **`src/app/(auth)/welcome/page.tsx`** — минимальный chrome (как `/invite`, группа `(auth)`), `<Suspense>` если нужен, заголовок «Расскажите о себе» + `<ProfileForm mode="onboarding" />`. Пропустить нельзя (нет «Skip» — имя обязательно серверным гардом).

---

## ЗАДАЧА 4 — загрузка аватара + оживить отображение

1. **`src/lib/hooks/use-avatar.ts`** — `useUploadAvatar()` (зеркало `useUploadProjectFile`): upload в `avatars/{uid}/avatar.<ext>` (`upsert: true`), получить public URL (`getPublicUrl`), `update profiles set avatar_url`. Валидация: image/*, ≤2MB.
2. **`AvatarUpload.tsx`** — превью + кнопка загрузки/замены (Lucide-иконка, без эмодзи), опционально.
3. **`SettingsContent.tsx`** (профиль-карточка ~стр.46): из read-only сделать редактируемой — показать аватар (или инициалы), имя, телефон, должность + кнопка «Редактировать» → `<ProfileForm mode="settings" />` (модалка/инлайн). Owner видит свой профиль тем же компонентом.
4. **`TeamSection.tsx`**: аватар (`avatar_url` → `<img>`, fallback `initials(full_name)`); под именем — `job_title` мелким `text-text-dim`, если есть. Имена оживут автоматически после онбординга (хуки уже читают `full_name`).

---

## EDGE CASES / TESTS (сценарии для гейта, не писать полный suite)
- Новый приглашённый: accept → middleware видит `onboarded=false` → `/welcome`, в дашборд не пускает; сабмит с пустым именем → 23514 (RPC гард), форма показывает ошибку; валидный сабмит → `/`, в «Команде» имя вместо «Без имени».
- Owner (уже с именем, backfill проставил `onboarded_at`) → на `/welcome` не редиректится.
- Аватар: загрузка своего файла ok; RLS storage — попытка записать в `avatars/{чужой-uid}/…` → denied.
- `complete_onboarding` под anon → 42501.
- Backward-compat: старый код, не знающий новых колонок, работает (nullable, дефолт-селекты не ломаются).
- T1c: см. VERIFY задачи 0.

## VERIFICATION LABELS (ожидаемые)
```
Type Safety:            NOT_VERIFIED (нужен gen types после 061)
RLS Coverage:           PASS (profiles_update_own уже есть; avatars — по паттерну 055 per-uid; RPC ACL адресный)
Backward Compatibility: PASS (колонки nullable, backfill не трогает уже-именованных; middleware fail-open)
Runtime Tested:         NOT_VERIFIED (смок — гейтом Cowork)
Regional Availability:  NOT_APPLICABLE (только Supabase/Netlify)
```

## КОММИТ
Один коммит (миграция + фронт неразрывны для welcome-гейта): фронт с welcome-гейтом деплоить ТОЛЬКО после применения 061 — иначе `session_gate` не существует и middleware падает (fail-open спасёт, но онбординг не заработает). Порядок: коммит+пуш → гейт Cowork применяет 061 → Netlify деплой.
```
git add -A && git commit -m "S-ONBOARD-1: профиль self-service + welcome-гейт (061) + T1c invite email-guard"
```
Миграцию НЕ применять из CC. После пуша — память: 061 ждёт apply гейтом.
```
```
