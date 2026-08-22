# Технологический стек dashboard-crm (Torii CRM)

**Проект:** dashboard-crm / Torii CRM  
**Назначение:** CRM + PM-панель для продаж и внедрений (IIoT / ERP / internal)  
**Дата документа:** 2026-07-20  
**Источник правды:** `package.json`, конфиги репозитория, `src/`, `supabase/`

---

## 1. Одной фразой

**Full-stack TypeScript SPA/SSR на Next.js 15 (App Router) + React 19, UI на Tailwind CSS, бэкенд-данные и auth — Supabase (PostgreSQL + RLS + Realtime + Storage + Edge Functions), деплой — Vercel, AI — Anthropic Claude через Deno Edge Functions.**

Это не «конструктор» (Bitrix/Amo/HubSpot): кастомное веб-приложение с собственной схемой БД, ролями и UI.

---

## 2. Архитектурная схема (логические слои)

```
┌─────────────────────────────────────────────────────────────┐
│  Клиент (браузер)                                           │
│  React 19 · Next.js App Router (Client Components)          │
│  TanStack Query · Zustand · RHF + Zod · dnd-kit · Recharts  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS (Supabase JS / SSR cookies)
┌───────────────────────────▼─────────────────────────────────┐
│  Next.js 15 (Vercel)                                        │
│  Middleware (сессия) · Server Components (auth-обёртки)      │
│  Security headers · Route handlers (auth callback)          │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Supabase                                                   │
│  PostgreSQL + RLS · Auth (Magic Link / JWT)                 │
│  Realtime · Storage (файлы проектов) · RPC / triggers       │
│  Edge Functions (Deno): ai-run, ai-summarize → Claude API   │
└─────────────────────────────────────────────────────────────┘
```

**Паттерн данных (типичный поток):**

```
UI (форма / drag) → Zod / RHF
  → React Query mutation (optimistic)
    → Supabase client (anon key + JWT)
      → Postgres (RLS)
        → triggers (activity_log, org_id, automation…)
          → Realtime → invalidate Query cache
```

**Не используется как основной API-слой:** отдельный Nest/Express/Django backend. Бизнес-логика «на сервере» — в Postgres (RPC, triggers, RLS) и Edge Functions (AI).

---

## 3. Frontend — ядро

| Технология | Версия (package.json) | Роль |
|------------|----------------------|------|
| **Next.js** | `^15.1.0` | Framework: App Router, middleware, SSR/SSG-гибрид, деплой на Vercel |
| **React** | `^19.0.0` | UI-библиотека |
| **React DOM** | `^19.0.0` | Рендер в браузере |
| **TypeScript** | `^5.7.0` | Язык всего `src/` (`strict: true`) |

### 3.1 Роутинг и структура Next.js

- **App Router** (`src/app/`), не Pages Router.
- Группы маршрутов:
  - `(auth)` — login, OAuth/callback без dashboard-shell;
  - `(dashboard)` — рабочие экраны с sidebar / header.
- Страницы-обёртки часто server-side: проверка `supabase.auth.getUser()` → `redirect('/login')`, контент — client components.
- Path alias: `@/*` → `./src/*` (`tsconfig.json`).
- `images.unoptimized: true` — без Next Image Optimization CDN. Настройка досталась от прежней платформы;
  на Vercel оптимизация доступна — снятие флага не проверялось, трогать без замера не нужно (техдолг).

### 3.2 Язык UI и i18n

- UI **на русском**, код/идентификаторы — **английские**.
- `lang="ru"` в root layout.
- Нет i18n-фреймворка (next-intl / react-i18next) — строки зашиты в компоненты.

---

## 4. Стили, дизайн-система, шрифты

| Технология | Версия | Роль |
|------------|--------|------|
| **Tailwind CSS** | `^3.4.16` | Utility-first CSS |
| **PostCSS** | `^8.4.49` | Пайплайн CSS |
| **Autoprefixer** | `^10.4.20` | Вендор-префиксы |
| **clsx** | `^2.1.1` | Условные className |
| **tailwind-merge** | `^2.6.0` | Слияние Tailwind-классов без конфликтов |
| **CSS custom properties** | в `globals.css` | Темы: `.t-aura`, `.t-frost`, … |

### 4.1 Темы

- Мультитемность через класс на `<html>` + CSS-переменные (`--bg`, `--accent`, `--text`, …).
- Tailwind-цвета мапятся на переменные (`bg-surface`, `text-text-main`, `bg-accent` и т.д.).
- Persist темы: **Zustand + localStorage** (`dashboard-theme`).
- FOUC-guard: inline `<script>` theme-init до гидрации.
- Дефолт (актуальный layout): **t-aura**; валидные темы в init-скрипте: aura, washi, fuji, frost, aurora, tidal, minimal.

### 4.2 Шрифты

Подключение через **`next/font/google`**:

| Семейство | Переменная | Назначение |
|-----------|------------|------------|
| Manrope | `--font-manrope` | База / legacy themes |
| IBM Plex Sans | `--font-plex` | Часть тем |
| Onest | `--font-onest` | Aura UI (кириллица) |
| Unbounded | `--font-unbounded` | KPI / заголовки aura |
| Inter | `--font-inter` | Minimal theme |

Пакет `geist` есть в dependencies (исторически / частично); в tailwind config комментарий, что Geist как основная sans-роль убран.

### 4.3 Иконки

- **lucide-react** `^0.460.0` — SVG-иконки (без emoji в UI по конвенции проекта).

### 4.4 Анимации / motion

- CSS transitions + theme tokens (`--duration-fast`, ease tokens).
- Нет Framer Motion / GSAP как зависимости (кастомные stagger/hover в CSS/компонентах).

---

## 5. Состояние приложения

| Слой | Библиотека | Версия | Что хранит |
|------|------------|--------|------------|
| **Server / remote state** | **TanStack React Query** | `^5.62.0` | projects, tasks, calls, pipelines, portfolio… |
| **Client UI state** | **Zustand** | `^5.0.2` | theme, sidebar, drawer, modal UI prefs |
| **URL state** | `useSearchParams` (Next) | — | view, tab, filters, quick filters |
| **Form state** | **React Hook Form** | `^7.54.0` | модалки сущностей |
| **Валидация схем** | **Zod** | `^3.24.0` | single source of truth форм |
| **RHF ↔ Zod** | **@hookform/resolvers** | `^3.9.0` | `zodResolver` |

### 5.1 React Query — детали

- `QueryProvider` с `MutationCache` / `QueryCache`:
  - глобальные toast на ошибки мутаций (**sonner**);
  - обработка протухшей сессии (`handleSessionExpired`);
  - gate-ошибки (stage gates) без лишнего toast.
- `staleTime` ~30s; optimistic updates + rollback в entity-hooks.
- Realtime → `invalidateQueries` ( debounced broadcast ).

### 5.2 Уведомления UI

- **sonner** `^2.0.7` — toast (ошибки, session expired, dependency errors).

---

## 6. Backend / данные — Supabase

| Компонент Supabase | Как используется |
|--------------------|------------------|
| **PostgreSQL** | Основная БД: orgs, memberships, projects, tasks, pipelines, quotes, workflow… |
| **Auth** | JWT-сессии; Magic Link / email flow; PKCE через `@supabase/ssr` |
| **RLS (Row Level Security)** | Мультитенантность: `org_id`, роли owner/admin/manager/viewer |
| **Realtime** | postgres_changes на tasks, activity_log и др.; refcount-менеджер каналов |
| **Storage** | Файлы проектов (`project_files` + storage API) |
| **RPC / SQL functions** | spawn delivery, reorder_tasks, stage gates, automation executor, overdue… |
| **Triggers** | activity_log, set_org_id, stage side-effects, workflow |
| **Edge Functions (Deno)** | `ai-run`, `ai-summarize` |
| **pg_cron** (в миграциях) | scheduled automation / task_overdue |

### 6.1 Клиентские SDK

| Пакет | Версия | Роль |
|-------|--------|------|
| **@supabase/supabase-js** | `^2.47.0` | Browser/server API |
| **@supabase/ssr** | `^0.5.2` | `createBrowserClient` / `createServerClient`, cookie-сессии |

Файлы:

- `src/lib/supabase/client.ts` — browser client;
- `src/lib/supabase/server.ts` — server components / RSC;
- `src/lib/supabase/middleware.ts` — refresh session на каждом matched request;
- `src/middleware.ts` — entrypoint Next middleware.

### 6.2 Миграции

- Каталог: `supabase/migrations/` (десятки SQL-файлов + baseline snapshot).
- Применение: вручную / через Supabase (не «миграции из CI как единственный путь» в go-live docs).
- Типы: `npm run db:gen-types` → `supabase gen types typescript` (скрипт пишет в `database.ts`; в репо также есть `supabase.gen.ts`).

### 6.3 Env-переменные (клиент)

```env
NEXT_PUBLIC_SUPABASE_URL=https://….supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…
SUPABASE_PROJECT_ID=…          # только для gen types
```

Service role **не** используется в browser-коде (AI edge — JWT пользователя + RLS).

### 6.4 Tenancy-модель

- **Multi-tenant:** `organizations` + `memberships`.
- Роли: owner / admin / manager / viewer (в memberships, не в profiles.role legacy).
- Граница данных: `org_id` + RLS policies + helper functions (`current_org_id()`, `current_org_role()`).

---

## 7. AI-стек

| Часть | Технология |
|-------|------------|
| Runtime | **Supabase Edge Functions** на **Deno** |
| SDK | `@supabase/supabase-js` via **JSR** (`jsr:@supabase/supabase-js@2`) |
| LLM provider | **Anthropic Claude API** (`ANTHROPIC_API_KEY` в Deno env) |
| Модели (дефолты в коде) | Haiku / Sonnet (конфигурируются env: `AI_RUN_MODEL_*`, `AI_SUMMARY_MODEL`) |
| Функции | `ai-summarize` (sync summary), `ai-run` (async preset runs → `ai_runs` + Realtime) |
| Безопасность | JWT caller + RLS; prompt isolation (`<data>` + anti-injection); structured tool_use output |

Нет Vercel AI SDK / OpenAI SDK в `package.json` frontend — AI только через Edge Functions.

---

## 8. Доменные UI-библиотеки (не «фреймворк CRM»)

| Пакет | Версия | Роль в CRM |
|-------|--------|------------|
| **@dnd-kit/core** | `^6.3.0` | Drag-and-drop (kanban, pipeline, project board) |
| **@dnd-kit/sortable** | `^10.0.0` | Сортировка карточек |
| **@dnd-kit/utilities** | `^3.2.2` | Утилиты dnd-kit |
| **recharts** | `^3.8.1` | Графики analytics / dashboard |
| **date-fns** | `^4.1.0` | Даты, локаль `ru` |
| **date-fns-tz** | `^3.2.0` | Таймзоны (MSK helpers) |
| **xlsx** | `^0.18.5` | Excel import/export компаний и т.п. |
| **dotenv** | `^17.3.1` | Env для скриптов/тестов |

Gantt: **кастомный** (`GanttTimeline.tsx`) — не dhtmlx/gantt-lib; Pointer Events + CSS grid + SVG edges.

---

## 9. Хостинг, runtime, DevOps

| Компонент | Выбор |
|-----------|--------|
| **Hosting** | **Vercel** — авто-деплой из `main`. Прод: https://dashboard-crm-ten.vercel.app/ |
| **Next adapter** | нативный (Vercel собирает Next без плагина) |
| **Node (build)** | 20 |
| **Package manager** | npm (`package-lock.json`) |
| **Build** | `npm run build` |
| **Security headers** | `next.config.ts` (XFO, nosniff, Referrer-Policy, Permissions-Policy, HSTS, CSP-lite) — единственный действующий источник |

ℹ️ Конфиг прежней платформы (`netlify.toml`, `.netlify/`) удалён 2026-08-21. До этого он лежал
в репо как «путь отката» и дважды вводил в заблуждение arch-разведку: документ опирался на него
как на источник правды о хостинге. Единственный действующий источник security-заголовков —
`next.config.ts`. Переезд на Vercel (июль 2026) — из-за исчерпания лимитов на деплои.

### 9.1 PWA-лёгкий слой

- `public/manifest.json` — name «Torii CRM», `display: standalone` (не полноценный service worker stack).

### 9.2 Не используется (явно)

- Netlify (был хостингом до 2026-07, конфиг удалён 2026-08-21);
- Docker / k8s в репо;
- GraphQL / tRPC / Prisma / Drizzle;
- Redis / Elasticsearch;
- shadcn/ui как установленный пакет (есть свои UI primitives в `src/components/ui`).

---

## 10. Качество кода, линтинг, тесты

| Инструмент | Версия | Назначение |
|------------|--------|------------|
| **ESLint** | `^9.16.0` | Lint |
| **eslint-config-next** | `^15.1.0` | `next/core-web-vitals`, `next/typescript` |
| **@eslint/eslintrc** FlatCompat | `^3.2.0` | Flat config bridge |
| **TypeScript** | `^5.7.0` | `strict`, `noEmit` |
| **Vitest** | `^4.1.4` | Unit/component tests |
| **@vitejs/plugin-react** | `^6.0.1` | React plugin for Vitest |
| **jsdom** | `^29.0.2` | DOM env для unit |
| **@testing-library/react** | `^16.3.2` | React testing |
| **@testing-library/jest-dom** | `^6.9.1` | DOM matchers |
| **Playwright** | `^1.59.1` | E2E (`tests/e2e`) |

Скрипты:

```bash
npm run dev          # next dev
npm run build        # next build
npm run lint         # next lint
npm test             # vitest run
npm run test:e2e     # playwright
npm run test:all     # unit + e2e
npm run db:gen-types # supabase gen types
```

**Замечание:** `eslint.ignoreDuringBuilds: true` в `next.config.ts` — lint не блокирует production build; TypeScript errors **блокируют** (`ignoreBuildErrors: false`).

---

## 11. Структура репозитория (стек-релевантная)

```
dashboard-crm/
├── src/
│   ├── app/                 # Next App Router (auth + dashboard pages)
│   ├── components/          # UI по доменам (projects, tasks, deals, …)
│   ├── lib/
│   │   ├── hooks/           # React Query data hooks (~46 файлов)
│   │   ├── stores/          # Zustand (theme, ui, drawer)
│   │   ├── supabase/        # client / server / middleware
│   │   ├── validators/      # Zod schemas
│   │   ├── constants/       # pipelines, delivery phases, …
│   │   └── utils/           # health, dates, filters, cn, …
│   ├── types/               # database.ts, entities, supabase.gen.ts, timeline
│   └── middleware.ts
├── supabase/
│   ├── migrations/          # SQL (schema, RLS, RPC, triggers)
│   └── functions/           # Deno edge: ai-run, ai-summarize
├── tests/
│   ├── unit/                # Vitest
│   └── e2e/                 # Playwright
├── docs/                    # schema.md, этот документ
├── public/                  # manifest, static
├── next.config.ts
├── tailwind.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

---

## 12. Стек по «слоям пиццы» (для PM / заказчика)

| Слой | Что выбрано |
|------|-------------|
| Язык | TypeScript |
| UI framework | React 19 |
| Meta-framework | Next.js 15 App Router |
| Стили | Tailwind 3 + CSS variables (темы) |
| Формы | React Hook Form + Zod |
| Клиентский state | Zustand |
| Серверный/кэш state | TanStack Query v5 |
| Backend-as-a-Service | Supabase |
| БД | PostgreSQL (Supabase) |
| Auth | Supabase Auth (JWT, SSR cookies) |
| Realtime | Supabase Realtime |
| Файлы | Supabase Storage |
| Serverless AI | Deno Edge Functions + Anthropic |
| Charts | Recharts |
| DnD | dnd-kit |
| Excel | SheetJS (xlsx) |
| Hosting | Vercel (авто-деплой из `main`) |
| CI quality | ESLint, tsc, Vitest, Playwright |
| Node runtime (build) | 20 |

---

## 13. Версии «каркаса» — сводная таблица

| Категория | Стек |
|-----------|------|
| **Runtime (browser)** | Modern evergreen browsers (ES2017 target TS) |
| **Runtime (edge AI)** | Deno (Supabase Functions) |
| **Runtime (build/host)** | Node 20, Vercel |
| **Core** | Next 15.1 · React 19 · TypeScript 5.7 |
| **Data** | Supabase JS 2.47 · SSR 0.5 · PostgreSQL |
| **UX libs** | RHF 7 · Zod 3 · Query 5 · Zustand 5 · dnd-kit 6 · Recharts 3 · sonner 2 |
| **CSS** | Tailwind 3.4 · PostCSS 8 · Autoprefixer 10 |
| **Test** | Vitest 4 · Testing Library 16 · Playwright 1.59 |
| **AI** | Anthropic Claude (Haiku/Sonnet) via Edge |

---

## 14. Почему такой стек (продуктовый смысл)

1. **Next + Supabase** — быстрый delivery кастомной CRM без отдельного backend-team.
2. **RLS в Postgres** — мультитенантность и роли на уровне БД, не «на честном слове UI».
3. **React Query + Realtime** — multi-user доски (tasks/deals) без собственного WebSocket-сервера.
4. **Zod + RHF** — единые контракты форм (лиды, сделки, задачи, quotes, automation).
5. **Vercel** — SSR Next без собственной k8s-инфры, нативная поддержка App Router.
   (До июля 2026 — Netlify; переехали из-за лимитов на деплои.)
6. **Claude на Edge** — AI-фичи (саммари, пресеты AI Hub) рядом с данными, ключ не в браузере.

---

## 15. Связанные документы в репо

| Файл | Содержание |
|------|------------|
| `README.md` | Quick start, структура, themes overview |
| `docs/schema.md` | Схема БД, RLS, миграции |
| `docs/Z-INDEX.md` | Слои интерфейса: занятые полосы z-index, правила, инциденты |
| `_analysis/archive-root/GO-LIVE.md` | Деплой на Vercel, env-переменные, Supabase redirect URLs, смок после деплоя |
| `_analysis/archive-root/INTEGRATION.md` | Интеграции (если актуально) |
| `package.json` | Точные версии зависимостей |
| `next.config.ts` | Headers, images, TS/ESLint policy |

---

## 16. Краткий FAQ

**Это React или Next?**  
Оба: React — UI, Next — framework (роутинг, middleware, deploy shape).

**Есть ли отдельный backend?**  
Нет монолита. Backend = Supabase (SQL + Auth + Storage + Edge).

**На чём AI?**  
Anthropic Claude, вызывается из Deno Edge Functions, не из Next API routes (в текущей архитектуре).

**Какая БД?**  
PostgreSQL (managed Supabase).

**Можно ли назвать это MERN/MEAN?**  
Нет. Ближе к **T3-подобному** без tRPC/Prisma: **Next + TS + Tailwind + Supabase**.

**Mobile native?**  
Нет — responsive web (+ PWA manifest). React Native отсутствует.

---

*Документ сгенерирован по состоянию репозитория на 2026-07-20. При смене major-версий сверять `package.json` и `supabase/functions`.*
