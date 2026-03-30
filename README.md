# Dashboard CRM — Phase 3

Next.js 15 + TypeScript + Tailwind CSS + Supabase

## Quick Start

```bash
# 1. Установить зависимости
npm install

# 2. Скопировать env-файл и заполнить данные из Supabase Dashboard
cp .env.local.example .env.local
# Заполни NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3. Применить SQL-миграции
# Зайди в Supabase Dashboard → SQL Editor → выполни файлы из supabase/migrations/ по порядку:
# 001_profiles.sql → 002_companies_contacts.sql → ... → 007_kpi_tracker_settings.sql

# 4. Запустить dev-сервер
npm run dev
# Открой http://localhost:3000
```

## Supabase Setup Checklist

1. **Authentication → Providers → Email**: включить Magic Link
2. **Authentication → URL Configuration**: добавить `http://localhost:3000/callback` в Redirect URLs
3. **SQL Editor**: выполнить все 7 миграций по порядку
4. **Database → Replication**: убедиться что таблицы tasks, projects, calls, meetings, activities в publication `supabase_realtime`

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login + callback (без sidebar)
│   ├── (dashboard)/     # Все рабочие страницы (с sidebar + header)
│   └── layout.tsx       # Root: providers, fonts, global CSS
├── components/
│   ├── layout/          # Sidebar, Header, ThemeProvider, QueryProvider
│   └── ui/              # Reusable UI components (Sprint 1+)
├── lib/
│   ├── supabase/        # Client, server, middleware helpers
│   ├── stores/          # Zustand: theme, UI state
│   ├── hooks/           # React Query hooks (Sprint 1+)
│   ├── utils/           # cn(), dates, validators
│   └── constants/       # Pipeline stages, priorities, roles
└── types/
    ├── database.ts      # Supabase types (replace with gen types)
    └── entities.ts      # Domain type aliases
```

## Deploy on Netlify

1. Подключи GitHub-репозиторий в Netlify
2. Build command: `npm run build`
3. Publish directory: `.next`
4. Environment variables: добавь `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Netlify автоматически определит Next.js и включит SSR через Netlify Runtime.

## Themes

6 тем, перенесённых из текущего дашборда:
- **Claude** (default) — тёплый светлый
- **Frost** — холодный тёмный
- **Paper** — бумажный тёплый
- **Sand** — песочный светлый
- **Aurora** — северное сияние
- **Tidal** — морской тёмный

Переключение: Header → иконка солнца/луны, или Settings → Тема оформления.
