# dashboard-crm

![CI](https://github.com/godfathxrPE/dashboard-crm/actions/workflows/ci.yml/badge.svg)

CRM для проектного внедрения: компании и контакты, лиды и сделки, проекты и задачи,
звонки, встречи, чат и аналитика. Соло-проект, одна прод-инсталляция.

**Стек:** Next.js 15 App Router · TypeScript strict · Tailwind · Supabase (Postgres + RLS + Edge)
· TanStack Query · Zustand · React Hook Form + Zod. Деплой — Vercel, авто из `main`.

## Quick Start

```bash
npm install
cp .env.local.example .env.local   # заполнить значениями из Supabase Dashboard
npm run dev                        # http://localhost:3000
```

Вход — magic link: Supabase → Authentication → Providers → Email, в URL Configuration
добавить `http://localhost:3000/callback` в Redirect URLs.

## Миграции

**Руками не применяются.** SQL-файлы лежат в `supabase/migrations/`, применяет гейт Cowork
(apply → регенерация типов → advisors → ролевые смоки). Правила — `CLAUDE.md`, раздел
«Жёсткие правила». Актуальная схема — `docs/schema.md`.

`src/types/supabase.gen.ts` и `src/types/database.ts` руками не правятся — только
регенерация (`npm run db:gen-types`).

## Тесты

```bash
npm run test       # vitest, unit — tests/unit/**
npm run test:e2e   # playwright — tests/e2e/**, dev-сервер поднимается сам (reuseExistingServer)
npm run lint       # eslint .
npx tsc --noEmit   # типы
```

## Структура

```
src/app/                 # (auth) и (dashboard) route-группы App Router
src/components/{domain}/ # UI по доменам: leads, projects, tasks, chat, ui, …
src/lib/hooks/           # use-*.ts — TanStack Query
src/lib/{domain,utils}/  # чистая логика; validators/ — Zod; stores/ — Zustand
supabase/                # migrations/ и functions/ (Edge: ai-run, ai-capture, telegram-*, …)
```

## Ссылки

- `CLAUDE.md` — контракт работы с репозиторием (стек, миграции, конвенции, грабли)
- `docs/schema.md` — схема БД · `docs/TECH-STACK.md`, `docs/TELEGRAM-SETUP.md`, `docs/WEBHOOKS-CONTRACT.md`
- `_analysis/` — спринты и аудиты · `improvements/` — roadmap
- `CHANGELOG.md` — история версий (git-cliff) · старые доки эпох — `_analysis/archive-root/`
