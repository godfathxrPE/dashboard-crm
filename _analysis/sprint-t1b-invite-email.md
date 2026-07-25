# Claude Code Prompt — Sprint T1b: Автодоставка инвайт-письма (additive, после T1a)

Контекст: T1a сделал приём инвайта рабочим по ссылке `/invite?token=`, которую владелец копирует руками. T1b автоматизирует доставку — edge-функция шлёт письмо со ссылкой при создании инвайта. НЕ блокер (T1a уже позволяет ручную ссылку), поэтому делать только после того, как T1a на гейте и приём подтверждён.

**⚠️ Решение до старта (инфра доставки) — выбери одно:**
- **Resend (рекомендую):** матчит существующий edge-паттерн проекта (ai-summarize/ai-run), брендированное HTML-письмо, независимо от GoTrue. Нужен аккаунт resend.com + API-ключ в Supabase secrets (`RESEND_API_KEY`) + верифицированный домен-отправитель (или их тестовый `onboarding@resend.dev` на время).
- **Supabase SMTP / GoTrue:** если не хочешь внешний сервис — настроить SMTP в Supabase Auth и слать через него. Меньше своего кода, но письмо привязано к GoTrue-шаблонам, и всё равно нужен SMTP-провайдер (свой домен/почта).

Дальнейший промпт — под **Resend**. Если выберешь SMTP — скажи, перепишу задачу 1 под него.

## РАЗВЕДКА

```bash
ls supabase/functions/                          # существующие edge (ai-summarize/ai-run) — образец
sed -n '1,40p' supabase/functions/ai-run/index.ts   # паттерн: JWT-клиент, CORS, secrets, verify_jwt
grep -n "verify_jwt\|functions\." supabase/config.toml
grep -n "useCreateInvitation" src/lib/hooks/use-invitations.ts   # куда врезать вызов
```

## ЗАДАЧА 1: Edge-функция `invite-email`

`supabase/functions/invite-email/index.ts` (+ `deno.json`, + запись в `config.toml` c `verify_jwt = true`). Паттерн безопасности — как ai-summarize (клиент под JWT вызывающего, RLS решает; ключ Resend только в secrets):

- Вход: `{ invitation_id: uuid }`. Валидация UUID, иначе 400.
- Клиент под JWT вызывающего (`Authorization` header) → `select * from invitations where id = :id` **под RLS** (только owner/admin своей org видят инвайт — значит только они и разошлют письмо; чужой/не-owner → 404).
- Собрать ссылку `${APP_ORIGIN}/invite?token=${invite.token}` (`APP_ORIGIN` — env-секрет, прод-URL).
- POST на `https://api.resend.com/emails` с `Authorization: Bearer ${RESEND_API_KEY}`: from (верифиц. домен), to (invite.email), subject «Приглашение в <org> — dashboard-crm», HTML с кнопкой-ссылкой. Anti-injection в теле не требуется (данные свои), но email/имя org — только как текст, без интерполяции в атрибуты.
- Ошибку Resend не палим наружу (нейтральный 502 + `console.error`); успех → `{ ok: true }`.
- НЕ использовать service_role. `verify_jwt = true`.

Модель писем/провайдер через env (`RESEND_API_KEY`, `APP_ORIGIN`, `INVITE_FROM`) — смена без редеплоя.

## ЗАДАЧА 2: Дёргать функцию при создании инвайта

`src/lib/hooks/use-invitations.ts` → `useCreateInvitation`: после успешного INSERT инвайта — `supabase.functions.invoke('invite-email', { body: { invitation_id: created.id } })`. Ошибку доставки НЕ ронять в UI как провал создания (инвайт-то создан, ссылку можно скопировать руками — T1a): показать мягкий тост «Инвайт создан, но письмо не ушло — скопируйте ссылку» при ошибке invoke. Кнопка «Отправить повторно» у pending-инвайта (опционально) — тот же invoke.

## ЗАДАЧА 3 (опц.): текст в TeamSection

Подсказку под формой обновить: «Письмо уйдёт автоматически; ссылку также можно скопировать и отправить вручную».

## ПРОВЕРКА / ГЕЙТ (Cowork)

```bash
npx tsc --noEmit
```
Гейт: задеплоить edge (`supabase functions deploy invite-email`, verify_jwt=true), выставить secrets (`RESEND_API_KEY`, `APP_ORIGIN`, `INVITE_FROM`). Смоук: создать инвайт на свой второй email → письмо пришло, ссылка ведёт на `/invite?token=`, приём отрабатывает (T1a). Не-owner вызвал функцию по чужому invitation_id → 404 (RLS). `get_advisors` без новых WARN.

## КОММИТ

```bash
git add supabase/functions/invite-email/ supabase/config.toml src/lib/hooks/use-invitations.ts src/components/settings/TeamSection.tsx
git commit -m "Sprint T1b: автодоставка инвайта — edge invite-email (Resend) + invoke при создании"
```
