# Деплой feat/aura-theme на Netlify — план и чек-лист (2026-07-11)

Факты (сверено по репо): ветка опережает `main` на **63 коммита** и `origin/feat/aura-theme`
на **13** (P2a/P2b не запушены). `netlify.toml` минимальный (build `npm run build`, publish
`.next`, NODE 20, без явного plugin-entry — Next Runtime у Netlify авто-детектится, сайт уже
собирался с main). Есть `src/middleware.ts` (Supabase auth → Netlify Edge) — работал и раньше.
Env: только `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — должны уже стоять
в Netlify UI (сайт жил на старом main). Локальные `tsc`/`build`/94 unit — зелёные.

Принцип: **ничего не менять в конфиге перед первым деплоем ветки** — минимизируем число
переменных. Улучшения netlify.toml — отдельным chore после зелёного прода.

## Шаг 1 — push ветки (локально, НЕ через бридж: git push требует твоих кредов)

```bash
cd ~/Downloads/dashboard-crm
git push origin feat/aura-theme
```

## Шаг 2 — Deploy Preview

Открыть PR `feat/aura-theme → main` на GitHub (godfathxrPE/dashboard-crm) — Netlify соберёт
Deploy Preview автоматически (если Deploy Previews включены; проверить: Site configuration →
Builds → Deploy Previews. Альтернатива — Branch deploy: Site configuration → Branches →
добавить feat/aura-theme).

⚠️ **До логина на превью** — Supabase Dashboard → Authentication → URL Configuration →
Redirect URLs: добавить wildcard превью `https://deploy-preview-*--<site-name>.netlify.app/**`
(иначе PKCE-редирект после логина упадёт). Прод-URL там уже должен быть.

## Шаг 3 — смоук на превью (10 минут)

1. Логин/логаут (PKCE через middleware — главный кандидат на сюрприз).
2. `/deals`: воронка, won-список раскрывается, карточка сделки.
3. `/projects`: канбан 4 состояний, drag; открыть delivery-проект.
4. ProjectDetail: грид стадий, таб «План» (фазовая доска: badge-цикл, DnD), «Команда»
   (добавить себя менеджером — RLS в бою), прогресс N/M в шапке.
5. Spawn с won-сделки (ERP — одна CTA «Внедрение (6 этапов)»).
6. Вторая вкладка: realtime (смена статуса задачи → прогресс обновился без рефреша).
7. Консоль браузера: без красного (CSP/CORS-сюрпризы Netlify видны здесь).

## Шаг 4 — merge → прод

Merge PR (merge commit, НЕ squash — история спринтов ценна) → Netlify задеплоит main.
Повторить смоук-минимум на проде (логин, /deals, /projects, одна доска).

## Если билд упал

Netlify deploy log → первая красная строка. Частые для нашего стека: (а) отсутствующая env
на build-этапе (prerender дёргает `NEXT_PUBLIC_*`) — проверить Site configuration →
Environment variables; (б) NODE_VERSION — у нас пинован 20, ок; (в) плагин Next Runtime —
если сайт очень старый, проверить в deploy log строку «Using Next.js Runtime v5». Лог кидай
мне — разберу.

## После зелёного прода (отдельный chore, не сейчас)

- `netlify.toml`: явный `[[plugins]] package = "@netlify/plugin-nextjs"` (воспроизводимость),
  security headers (X-Frame-Options DENY, X-Content-Type-Options nosniff).
- Почистить тестовые сущности (Test ERP / test / TEST) или оставить как демо.
- Обновить handoff: деплой закрыт.
