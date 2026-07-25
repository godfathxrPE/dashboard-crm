# Claude Code Prompt — Sprint T1a: Приём инвайта (BLOCKER онбординга, без внешних зависимостей)

Контекст: dashboard-crm, multi-tenant (organizations/memberships, роли owner/admin/manager/viewer). Аудит 2026-07-18 (`_analysis/TEAM-READINESS-2026-07-18.md`) + подтверждено на живой БД: **приём инвайта сломан**. `handle_new_user` (AFTER INSERT ON auth.users) зовёт `apply_pending_invites(id, email, email_confirmed_at IS NOT NULL)`, но при magic-link на INSERT `email_confirmed_at` = NULL → гард `p_email_confirmed` возвращает 0 → membership не создаётся. Подтверждение приходит на UPDATE, где триггера нет; `accept_invitation` не существует; страницы `/invite` нет. Итог: приглашённый логинится, но попадает в org-less пустой дашборд (реальная жертва — god4azer, расстопорен вручную на гейте).

Решение — **токен-flow** (колонка `invitations.token uuid` уже в схеме, менять её не нужно): `accept_invitation(token)` RPC + страница `/invite?token=` + guard «нет org → /invite, не пустой дашборд». Ноль внешних зависимостей — онбординг заработает по ссылке, которую владелец копирует руками. Автодоставку письма делает отдельный T1b.

**Правила:** миграцию пишем и коммитим, НЕ применяем (гейт Cowork). Новая функция — по hardening-конвенции (`SECURITY DEFINER SET search_path = public, pg_temp` + адресный ACL). Разведка живой БД через Supabase MCP, не папка миграций.

## РАЗВЕДКА

```bash
grep -rn "accept_invitation\|/invite" src supabase/migrations || echo "нет — создаём с нуля"
grep -n "inviteLink\|invited=1" src/lib/hooks/use-invitations.ts
grep -n "copy\|inviteLink\|Скопировать" src/components/settings/TeamSection.tsx
sed -n '1,40p' src/app/\(auth\)/callback/route.ts
sed -n '1,60p' src/lib/supabase/middleware.ts
sed -n '1,50p' src/app/\(dashboard\)/layout.tsx        # куда воткнуть org-guard
grep -rn "current_org_id" src/lib/hooks/use-org-role.ts  # как клиент зовёт RPC
ls src/app                                              # структура route-групп: (auth) / (dashboard)
```

Интроспекция живой БД (Supabase MCP, read-only) — вставить факты в план миграции:

```sql
-- accept_invitation отсутствует (ожидаемо), token существует, триггер только INSERT:
select to_regprocedure('public.accept_invitation(uuid)') is not null as accept_exists;
select column_name from information_schema.columns
 where table_schema='public' and table_name='invitations' and column_name='token';
select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal;
-- memberships INSERT-политика (для справки: accept_invitation — DEFINER, RLS обходит):
select policyname, cmd, with_check from pg_policies
 where schemaname='public' and tablename='memberships';
```

## ЗАДАЧА 1: Миграция T1a — `accept_invitation(token)` RPC

Файл `supabase/migrations/058_accept_invitation.sql` (сверить след. свободный номер разведкой — 057 занят).

```sql
-- 058_accept_invitation.sql — Sprint T1a (приём инвайта, токен-flow).
-- Отвязывает приём инвайта от тайминга подтверждения auth.users: клиент под своим JWT
-- зовёт RPC с токеном из ссылки → membership для auth.uid(). DEFINER обходит RLS memberships
-- (self-join прямым INSERT запрещён политикой — и должен быть). Идемпотентно.

create or replace function public.accept_invitation(p_token uuid)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_invite record;
begin
  if v_uid is null then
    return jsonb_build_object('status','unauthenticated');
  end if;

  select id, org_id, role into v_invite
    from public.invitations
   where token = p_token
     and accepted_at is null
     and expires_at > now()
   for update;

  if not found then
    -- нет / принят / истёк — деталей не палим
    return jsonb_build_object('status','invalid');
  end if;

  insert into public.memberships (org_id, profile_id, role)
  values (v_invite.org_id, v_uid, v_invite.role)
  on conflict (org_id, profile_id) do nothing;

  update public.invitations set accepted_at = now() where id = v_invite.id;

  return jsonb_build_object('status','accepted',
    'org_id', v_invite.org_id, 'role', v_invite.role);
end $$;

revoke all on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.accept_invitation(uuid) to authenticated;
```

**Trade-off (зафиксировать в комментарии):** токен-only приём (bearer-секрет, как invite-ссылки GitHub/Slack) — убирает трение «email при регистрации должен точно совпасть» и чинит тайминг. Если нужна привязка к email — добавить `and lower((select email from auth.users where id = v_uid)) = lower(v_invite.email)` в проверку + отдельный статус `wrong_email`. По умолчанию НЕ добавляем (владелец шлёт токен известному человеку; трение дороже). `handle_new_user` НЕ трогаем — его email-путь остаётся безобидным no-op (на INSERT под magic-link не сработает, но и не мешает).

## ЗАДАЧА 2: Страница `/invite`

Новый route ВНЕ группы `(dashboard)` (чтобы не попал под org-guard задачи 3): `src/app/(auth)/invite/page.tsx` (client component; проверить, что `(auth)` layout не требует сессии жёстко — если требует, сделать `src/app/invite/page.tsx` top-level).

Логика:
- Требует сессию: если не залогинен → редирект на `/login?next=/invite?token=<...>` (сохранить токен через回, чтобы после логина вернуться). Проверить, поддерживает ли `login/page.tsx` `next`-параметр; если нет — добавить (после `exchangeCodeForSession` в callback читать `next` и редиректить туда).
- `?token` есть: `supabase.rpc('accept_invitation', { p_token: token })`:
  - `status:'accepted'` → тост «Вы добавлены в организацию» + `router.replace('/')` (+ invalidate org-role/team кешей).
  - `status:'invalid'` → «Ссылка недействительна или истекла. Попросите владельца прислать новую.»
  - `status:'unauthenticated'` → отправить на логин с `next`.
- `?token` нет: экран «Вы вошли, но ещё не добавлены в организацию» + текст «Попросите владельца прислать ссылку-приглашение» + кнопка «Выйти» (`supabase.auth.signOut()` → `/login`).

Без внешних либ; стиль — существующие примитивы (`ui/Button`, `ui/Card`), тема через CSS-переменные.

## ЗАДАЧА 3: Org-guard + next-round-trip в MIDDLEWARE (НЕ в layout — он клиентский)

⚠️ **Разведка подтвердила (grok-ревью B1): `src/app/(dashboard)/layout.tsx` — `'use client'` (первая строка).** Server-side `await supabase.rpc(...) + redirect()` там НЕ работает. Guard кладём в **`src/lib/supabase/middleware.ts`** (там уже cookie-session client, который дёргает root `src/middleware.ts`). Client-guard в layout (`useEffect`+`router.replace`) — хуже (мелькнёт пустой дашборд), не делать.

В `src/lib/supabase/middleware.ts` (после получения user в существующей логике):
- Путь `/invite` разрешить всегда (иначе рекурсия редиректа).
- `user есть && current_org_id null && путь ≠ /invite` → redirect `/invite`. RPC тем же cookie-клиентом: `const { data: orgId } = await supabase.rpc('current_org_id')`.
- `user есть && путь /login && ?next` → redirect на `next` (не затирать на `/`).
- Проверить `config.matcher` в `src/middleware.ts` — `/invite` НЕ исключён из middleware.

Так org-less юзер (сбой инвайта, отозванный доступ, удалён из команды) уходит на `/invite`, а не в молчаливо-пустой дашборд (`current_org_id()=NULL` → все SELECT пусты без ошибок).

**Next-round-trip (W1 — иначе «ссылка → magic-link → снова org-less `/`» повторит боль):**
1. `login/page.tsx`: читать `searchParams.next`; сейчас `emailRedirectTo: ${origin}/callback` (L25) → `${origin}/callback?next=${encodeURIComponent(next ?? '/')}`.
2. `callback/route.ts`: прочитать `next` из searchParams, редиректить на него ВМЕСТО `${origin}/` (L14) — **только safe-relative** (open-redirect guard: начинается с одного `/`, не `//`, не абсолютный URL; иначе → `/`).
3. `/invite` (Задача 2) unauth → `/login?next=${encodeURIComponent('/invite?token='+token)}` — сохранить токен через next.

## ЗАДАЧА 4: Ссылка-приглашение → токен (grok W3/W4)

- `src/lib/hooks/use-invitations.ts`:
  - `useCreateInvitation`: INSERT сейчас без возврата строки → добавить `.select('id, token').single()` (иначе токена в URL нет — copy бесполезен).
  - `inviteLink()` сейчас **zero-arg** (`/login?invited=1`) → сменить сигнатуру на `inviteLink(token: string)` → `${origin}/invite?token=${token}`. Обновить ВСЕ call sites (тост после create, copy у pending-инвайта — `copy(inviteLink(inv.token))`).
- `src/components/settings/TeamSection.tsx`: кнопка «Скопировать ссылку» у pending-инвайта копирует `inviteLink(inv.token)` (новый формат). Подсказку под формой обновить: «Скопируйте ссылку и отправьте коллеге — по ней он войдёт и получит доступ» (убрать про «введите тот же email»).

## ПРОВЕРКА

```bash
npx tsc --noEmit
grep -rn "invited=1" src   # не должно остаться (старый формат ушёл)
```

## ГЕЙТ (Cowork)

1. Ревью диффа; `apply_migration` 058; `get_advisors` (новая DEFINER-функция — проверить, что ACL адресный, не публичный).
2. Смоук приёма (симуляция + реальная ссылка):
   - создать тестовый инвайт (owner) → скопировать `/invite?token=…`;
   - под ВТОРЫМ аккаунтом (не owner) открыть ссылку → membership создался, роль верная, `accepted_at` проставлен, редирект в `/`;
   - повторный клик той же ссылки → `invalid` (уже принят), не дубль membership;
   - истёкший токен (выставить `expires_at` в прошлое) → `invalid`;
   - org-less вход без токена → экран «не добавлены», не пустой дашборд.
3. Деплой фронта; обновить `docs/schema.md` + skill (раздел invitations: accept_invitation, токен-flow, org-guard) тем же заходом.

## КОММИТ

```bash
git add supabase/migrations/058_accept_invitation.sql "src/app/(auth)/invite/page.tsx" "src/app/(dashboard)/layout.tsx" src/lib/hooks/use-invitations.ts src/components/settings/TeamSection.tsx src/app/\(auth\)/callback/route.ts src/app/\(auth\)/login/page.tsx
git commit -m "Sprint T1a: приём инвайта — accept_invitation(token) RPC (058), /invite, org-guard, токен-ссылки"
```
