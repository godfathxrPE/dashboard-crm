# Sprint 7 — Go Live Checklist

## 1. Подготовка к деплою

### Netlify Setup
```bash
# Установи Netlify CLI (если ещё нет)
npm install -g netlify-cli

# Логин
netlify login

# Инициализация (из корня проекта)
cd ~/Downloads/dashboard-crm
netlify init
# → Create & configure a new site
# → Team: выбери свой
# → Site name: dashboard-crm (или свой вариант)
# → Build command: npm run build
# → Deploy directory: .next
```

### Environment Variables
В Netlify Dashboard → Site settings → Environment variables, добавь:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` |

### Supabase: Redirect URLs
В Supabase Dashboard → Authentication → URL Configuration:
- Добавь `https://your-site.netlify.app/callback` в Redirect URLs
- Добавь `https://your-custom-domain.com/callback` если будет свой домен

## 2. Первый деплой

```bash
# Push в GitHub
git add -A
git commit -m "Sprint 7: go live"
git push

# Netlify автоматически задеплоит из GitHub
# Или ручной деплой:
netlify deploy --prod
```

## 3. Верификация после деплоя

1. Открой `https://your-site.netlify.app`
2. Проверь Magic Link авторизацию
3. Перейди в Настройки → секция "Верификация данных"
4. Убедись что все таблицы показывают корректные числа
5. Протестируй CRUD: создай задачу, проект, звонок
6. Проверь Cmd+K — Command Palette работает
7. Проверь переключение тем

## 4. Миграция данных (если нужно)

1. Открой старый Dashboard: `https://godfathxrpe.github.io/Dashboard/`
2. В DevTools Console:
   ```js
   // Экспорт всех данных из localStorage
   const backup = {};
   ['tasks','projects','calls','meetings'].forEach(key => {
     try { backup[key] = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
   });
   const blob = new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'});
   const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
   a.download = 'dashboard-export.json'; a.click();
   ```
3. Открой новый Dashboard → Настройки → Миграция данных
4. Загрузи JSON файл → Нажми "Начать миграцию"
5. Проверь результат в Верификации данных

## 5. Отключение старого Dashboard (опционально)

После подтверждения что всё работает:
1. GitHub repo → Settings → Pages → Source: None
2. Или просто оставь как архив

## 6. Custom Domain (опционально)

```bash
# В Netlify Dashboard → Domain settings → Add custom domain
# Настрой DNS: CNAME → your-site.netlify.app
# SSL выпустится автоматически через Let's Encrypt
```

## Итоговая архитектура

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   Browser    │────▶│   Netlify    │────▶│  Supabase  │
│  Next.js App │     │   (SSR/SSG)  │     │ PostgreSQL │
│  React Query │     │   Edge Funcs │     │ Auth + RLS │
│  Tailwind    │     │              │     │ Realtime   │
└─────────────┘     └──────────────┘     └────────────┘
```
