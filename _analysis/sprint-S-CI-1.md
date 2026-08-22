# Claude Code Prompt — S-CI-1: GitHub Actions CI (lint + types + unit)

**Контекст.** Аудит репо 21.08 (`_analysis/AUDIT-REPO-2026-08-21-karta.html`): главный
системный разрыв — нет CI. 111 тест-файлов гоняются только руками; урок S-TL-1 (сдан
с зелёными тестами при мёртвой ленте) показал цену. Vercel билдит из main, но lint/tsc/vitest
до пуша никто не гарантирует.

**Scope этого спринта — сознательно узкий:**
- В CI идут **lint + tsc --noEmit + vitest run**. Это не требует ни одного секрета.
- `next build` в CI **не гоняем** — ему нужны `NEXT_PUBLIC_SUPABASE_*`, а класть секреты
  в GitHub — отдельное решение Олега. Билд остаётся на Vercel.
- Playwright e2e в CI **не идёт** — требует живого Supabase и запущенного приложения.
  Остаётся локальным (`npm run test:e2e`) до отдельного спринта.

## РАЗВЕДКА (обязательно, до любых правок)

```bash
node -v                                   # мажорную версию берём в workflow
grep -n '"engines"' package.json || echo "engines не задан"
npm run lint 2>&1 | tail -5               # база: lint зелёный?
npx tsc --noEmit 2>&1 | tail -5           # база: типы зелёные?
npx vitest run 2>&1 | tail -15            # база: сколько тестов падает СЕЙЧАС
ls .github/workflows 2>/dev/null || echo "workflows нет — создаём с нуля"
grep -n '"test"' package.json             # ожидаем: "vitest run"
```

⚠️ Если vitest/tsc/lint красные уже сейчас — **не чинить всё подряд в этом спринте**.
Зафиксируй список падений в отчёте. CI ставим в любом случае: красный CI на реальных
падениях — это рабочий CI. Исключение: если падение — очевидная однострочная поломка,
почини отдельным коммитом `fix:` до коммита workflow.

## ЗАДАЧА 1: workflow-файл

### Context
Один workflow, один job на push/PR. Vitest в проекте — jsdom-окружение (tests/setup.ts),
секреты не нужны.

### Steps
Создай `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22          # ← замени на мажор из разведки (node -v)
          cache: npm
      - run: npm ci
      - name: Lint
        run: npm run lint
      - name: Typecheck
        run: npx tsc --noEmit
      - name: Unit tests
        run: npm run test
```

Если в разведке node мажор ≠ 22 — поставь фактический.

### Verification
```bash
npx yaml-lint .github/workflows/ci.yml 2>/dev/null || node -e "require('js-yaml') && console.log('skip')" 2>/dev/null || echo "yaml-линтера нет — проверь глазами отступы"
git status --short   # должен появиться только .github/workflows/ci.yml
```

## ЗАДАЧА 2: бейдж в README

### Context
Видимость статуса — половина смысла CI.

### Steps
В `README.md` сразу после заголовка `# Dashboard CRM — Phase 3` добавь строку:

```markdown
![CI](https://github.com/godfathxrPE/dashboard-crm/actions/workflows/ci.yml/badge.svg)
```

Остальной README в этом спринте **не трогать** — его переписывает S-REL-1.

### Verification
```bash
head -5 README.md
```

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npm run lint && npx tsc --noEmit && npm run test
# build локально НЕ гонять, если запущен next dev (известные грабли: билд убивает dev-сервер)
```

## КОММИТ

Ветка `chore/ci-1` от main. Один коммит:

```bash
git checkout -b chore/ci-1
git add .github/workflows/ci.yml README.md
git commit -m "chore(ci): GitHub Actions — lint + tsc + vitest на push/PR (S-CI-1)"
```

**Не мержить и не пушить** — мерж руками у Олега после гейта.

## ОТЧЁТ

Отчёт (не план): что создано, вывод финальной проверки (сколько тестов прошло/упало),
фактическая мажорная версия node, список падений из разведки, если были.

---

## Действия Олега после мержа (руками, не CC)

1. Запушить `chore/ci-1`, открыть PR — первый прогон CI пройдёт прямо в PR.
2. GitHub → Settings → Branches → Add branch ruleset для `main`:
   - Require status checks to pass → выбрать `checks`
   - Require branches to be up to date — включить
   - Block force pushes — включить
3. С этого момента красный CI блокирует мерж — это и есть цель.
