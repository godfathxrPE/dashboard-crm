# Claude Code Prompt — S-CI-2: зачистка lint до зелёного + уход с `next lint`

**Контекст.** S-CI-1 поставил CI; первый прогон красный на lint: 14 ошибок, 2 warning.
До зелёного lint `Require status checks` на main включать бессмысленно — main будет
постоянно красным. Плюс `next lint` объявлен deprecated и удаляется в Next 16, а CI
на него завязан: команда исчезнет на следующем мажоре.

**Зависимость:** после мержа `chore/ci-1`.

## РАЗВЕДКА

```bash
npx eslint . --format stylish 2>&1 | tail -40    # полный список, не через next lint
npx eslint . --format json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);const m={};r.forEach(f=>f.messages.forEach(x=>{m[x.ruleId]=(m[x.ruleId]||0)+1}));console.log(m)})"
grep -n "setAll" src/lib/supabase/server.ts src/lib/supabase/middleware.ts
grep -rn ': any\|as any' src/components/calls/CallModal.tsx src/components/shared/PhoneFields.tsx src/components/companies/ExcelImport.tsx
grep -rn '<a href="/' src --include=*.tsx
```

Ориентир (снято на гейте 21.08): 11 × `no-explicit-any` — server.ts 2, middleware.ts 2,
ExcelImport.tsx 4, PhoneFields.tsx 2, CallModal.tsx 1; 3 × `no-html-link-for-pages`;
2 warning на неиспользуемые импорты. **Верь разведке, не этому списку.**

## ЗАДАЧА 1: типы для cookie-адаптеров Supabase

### Context
`@supabase/ssr` экспортирует `CookieOptions` — свой тип уже есть, `any` был поставлен
из лени, не по необходимости. `tsc` его пропускал, ловил только eslint.

### Steps
В `src/lib/supabase/server.ts` и `src/lib/supabase/middleware.ts`:

1. Добавь в импорт из `@supabase/ssr`:
   ```ts
   import { createServerClient, type CookieOptions } from '@supabase/ssr';
   ```
   (в middleware.ts — к фактическому импорту из `@supabase/ssr`, проверь грепом)

2. Заведи локальный тип рядом с функцией:
   ```ts
   type CookieToSet = { name: string; value: string; options: CookieOptions };
   ```

3. Замени сигнатуры:
   - `setAll(cookiesToSet: any[])` → `setAll(cookiesToSet: CookieToSet[])`
   - `({ name, value, options }: {name: string; value: string; options: any})` →
     `({ name, value, options }: CookieToSet)`

### Verification
```bash
npx eslint src/lib/supabase/ 2>&1 | tail -5     # 0 ошибок
npx tsc --noEmit 2>&1 | tail -5                 # 0 ошибок — не сломали типизацию
```

⚠️ Если `tsc` начал ругаться на несовместимость `CookieOptions` с `cookieStore.set` —
не откатывайся в `any`: сузь до `Parameters<typeof cookieStore.set>[2]` и опиши причину
в комментарии рядом.

## ЗАДАЧА 2: остальные `any` — по одному, с разбором

### Context
`CallModal.tsx` (1), `PhoneFields.tsx` (2), `ExcelImport.tsx` (4). Контракт проекта:
`any` запрещён, для внешних payload — `unknown` + type guard.

### Steps
Для каждого вхождения из разведки:
- если это **внешний payload** (строка Excel, ответ API) → `unknown` + сужение через
  guard, не каст;
- если это **внутренняя структура** → выписать настоящий тип;
- если тип реально невыразим → `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
  **с однострочной причиной над ним**. Это допустимый исход, но не дефолтный: молчаливых
  disable без причины быть не должно.

ExcelImport — самый вероятный кандидат на `unknown` + guard: там разбор внешнего файла.

### Verification
```bash
npx eslint src/components/ 2>&1 | grep -c "no-explicit-any"   # 0
npx tsc --noEmit && npm run test                              # типы и 1697 тестов целы
```

## ЗАДАЧА 3: `<a href>` → `<Link>` на внутренние страницы

### Context
`no-html-link-for-pages`: обычный `<a>` на внутренний маршрут даёт полную перезагрузку —
теряется клиентское состояние и кэш TanStack Query.

### Steps
В файлах из разведки (ориентир: `SettingsContent.tsx`, `RecentActivityList.tsx`,
`MigrationTool.tsx`, возможно `PipelineBoard.tsx`):
- `import Link from 'next/link';`
- `<a href="/deals" className="...">` → `<Link href="/deals" className="...">`, закрывающий
  тег тоже.

**Внешние ссылки (`http://`, `https://`, `mailto:`) не трогать** — там `<a>` правильный.

### Verification
```bash
npx eslint . 2>&1 | grep -c "no-html-link-for-pages"   # 0
grep -rn '<a href="/' src --include=*.tsx              # остались только внешние/якоря
```

## ЗАДАЧА 4: warning'и — неиспользуемые импорты

### Steps
Убери `TrendingUp` из `src/components/dashboard/StatsWidget.tsx` и `TaskDependency`
из `src/lib/hooks/use-task-dependencies.ts` — **если разведка подтвердила, что они
действительно не используются** (`grep -n "TrendingUp" src/components/dashboard/StatsWidget.tsx`).

### Verification
```bash
npx eslint . 2>&1 | tail -3    # 0 problems
```

## ЗАДАЧА 5: CI и скрипт — с `next lint` на `eslint`

### Context
`next lint` deprecated, удаляется в Next 16. Плоский конфиг `eslint.config.mjs` в проекте
уже есть, бинарь `node_modules/.bin/eslint` на месте — миграция чисто механическая.
Делаем сейчас, пока правило одно и lint зелёный: после мажора это будет аварийная починка.

### Steps
1. В `package.json` замени скрипт:
   ```json
   "lint": "eslint .",
   ```
2. `.github/workflows/ci.yml` **не трогать** — шаг `npm run lint` остаётся, меняется
   только то, что за ним стоит.

### Verification
```bash
npm run lint                    # 0 problems, без строки о deprecation
grep -n '"lint"' package.json
```

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npm run lint && npx tsc --noEmit && npm run test
```

Все три обязаны быть зелёными — это и есть предусловие включения ruleset.

## КОММИТ

Ветка `fix/lint-1` от main (после мержа chore/ci-1):

```bash
git checkout main && git pull
git checkout -b fix/lint-1
git add -A src package.json
git commit -m "fix(lint): типы cookie-адаптеров и payload вместо any, Link вместо <a>, eslint вместо next lint (S-CI-2)"
```

**Не мержить и не пушить.**

## ОТЧЁТ

Отчёт: вывод `npx eslint .` до и после (числом), по каждому `any` — какой тип поставлен
и почему (или причина disable), список файлов с заменой на `<Link>`, вывод финальной
проверки с числом прошедших тестов.

---

## Действия Олега после мержа (руками)

1. Мерж `fix/lint-1` — CI на PR должен быть зелёным целиком.
2. **Теперь** включать ruleset на `main`: Settings → Branches → Require status checks →
   `checks` + Block force pushes.
3. Дальше S-REL-1.
