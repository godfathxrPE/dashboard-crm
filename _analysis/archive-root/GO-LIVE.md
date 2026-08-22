# Go Live — деплой и окружение

Прод: **Vercel**, `dashboard-crm-ten.vercel.app`. Деплой автоматический из `main` —
push запускает сборку. `vercel.json` в репозитории нет: build command и output настроены
дефолтами Next.js, остальное задаётся в дашборде проекта.

История: первый запуск (Sprint 7, июль 2026) шёл на Netlify, переезд на Vercel — август.
Конфиг Netlify и его артефакты удалены 2026-08-21, упоминания в `_analysis/` оставлены как есть —
это записи о том, что было.

---

## 1. Переменные окружения

Vercel Dashboard → Project → Settings → Environment Variables. Обязательный минимум:

| Variable | Пример |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` |

Полный список — в `.env.local.example`. Серверные ключи (`SUPABASE_SERVICE_ROLE_KEY`,
токены интеграций) добавляются там же, но **только** в Production/Preview scope, не в
`NEXT_PUBLIC_*`.

## 2. Supabase — Redirect URLs

Supabase Dashboard → Authentication → URL Configuration:

- `https://dashboard-crm-ten.vercel.app/callback`
- `https://<preview-url>/callback` — если гоняешь авторизацию на preview-деплое
- домен из п.4, когда появится

Без этого Magic Link уводит на `localhost` и вход на проде не работает.

## 3. Проверка после деплоя

1. Открыть прод, войти по Magic Link.
2. Настройки → «Верификация данных» — числа по таблицам совпадают с ожидаемыми.
3. CRUD-смок: задача, проект, звонок — создать и удалить.
4. `Cmd+K` — Command Palette открывается и ищет.
5. Переключение тем: Minimal, одна тёмная (Frost/Aurora/Tidal), Washi.
6. DevTools Console — ноль ошибок; Network — CSS-чанки отдаются 200.

Пункт 6 не формальность: тема ломается именно так — приложение живо, а стили 404.

## 4. Custom domain (когда понадобится)

Vercel Dashboard → Project → Settings → Domains → Add. DNS: `CNAME` на
`cname.vercel-dns.com`, SSL выпускается автоматически. После добавления домена —
дописать его callback в Supabase (п.2).

## 5. Архитектура

```
┌──────────────┐     ┌──────────────┐     ┌────────────┐
│   Browser    │────▶│    Vercel    │────▶│  Supabase  │
│  Next.js 15  │     │  SSR / Edge  │     │ PostgreSQL │
│ React Query  │     │  Middleware  │     │ Auth + RLS │
│  Tailwind    │     │              │     │  Realtime  │
└──────────────┘     └──────────────┘     └────────────┘
```

Крон-задачи живут в Postgres (`pg_cron`), не в платформенных scheduled functions —
решение S-WF-2C, чтобы движок автоматизаций был один и с `SECURITY DEFINER`.
