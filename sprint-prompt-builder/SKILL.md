---
name: sprint-prompt-builder
description: >
  Owns the Claude Code handoff loop: writes structured sprint/fix prompts AND gates
  the report Claude Code brings back. Prompt triggers: "подготовь промпт", "сделай
  промпт для Claude Code", "сделай спринт", "sprint prompt", "задача для кода",
  "промпт для агента". Gate triggers: "вот отчёт", "отчёт CC", "Claude Code закончил",
  "прими работу", "проверь дифф", "гейт", "ревью спринта", "можно мержить?", "review
  the diff", "CC report", "прогони по линзам", "cold review". Trigger the gate
  proactively whenever the user pastes a Claude Code report, diff or sprint summary.
  The gate routes review lenses (qa-engineer, security-privacy-reviewer,
  crm-design-auditor, a11y-auditor, api-architect, supabase-patterns) by what changed
  in the diff — go through the routing table here, not ad hoc. Supersedes generic
  code-review advice in this loop. dashboard-crm specifics (migrations, advisors,
  schema) — crm-architect. Not for tasks done directly in chat or non-coding prompts.
---
<!-- skill v2.1 · 2026-08-24 · линзы ревью, тесты в DoD, cold review -->

# Sprint Prompt Builder

Universal tool for the Claude Code handoff loop: generate prompts that execute
reliably in the terminal, then gate the result before it reaches main. The goal:
**first-run success** on the way out, **no unverified claims** on the way back.

---

## Why This Skill Exists

Claude Code is a terminal agent. It reads a prompt, executes bash commands,
edits files, and commits. But it has no memory between sessions and no visual
context. A well-structured prompt compensates for this by providing:

1. **Reconnaissance** — verify state before changing anything
2. **Exact references** — real file paths, column names, class names
3. **Atomic steps** — one concern per task block
4. **Verification** — check commands after each change
5. **Rollback awareness** — what to do if something breaks

A bad prompt says "fix the bug". A good prompt says "the bug is in
`src/components/Modal.tsx` line ~45, where `onClick` handler captures stale
state. Verify with `grep -n useState src/components/Modal.tsx`. Fix by
converting to useRef pattern. Verify with `npx tsc --noEmit`."

---

## Handoff Cycle — не менять

```
Claude (chat) пишет спринт-файл
  → внешнее ревью (Grok) → Claude правит
    → Олег отдаёт в Claude Code
      (worktree-isolation → чистый baseline; независимые задачи → sdd-controller)
      → Олег приносит отчёт
        → ГЕЙТ (этот скилл, режим 2)
          → Олег мержит и пушит
```

Правила передачи, действуют в обе стороны:

| Правило | Почему |
|---------|--------|
| Всё, что уходит в CC, — **файлом** в `_analysis/` (`sprint-*.md`, `fix-*.md`) | Промпт в чате теряется и обрезается; файл версионируется вместе с репо |
| В чат CC — **одна строка**: «прочитай файл `_analysis/sprint-N.md` и выполни» | Дублирование содержимого в чат ломает приоритет — CC начинает работать по обрывку |
| CC **не применяет миграции** и не трогает прод-БД | Применение — операция гейта, с откатом и проверками; у CC нет права на необратимое |
| Сгенерированные файлы (типы БД, клиенты API) руками не правятся | Правка руками расходится с генератором при следующем прогоне |
| `.env` и секреты не читаются | Даже чтение оставляет секрет в контексте и в логах |
| Мерж и пуш — **руками у Олега** | Гейт даёт вердикт, но не двигает ветки |
| Экран в спринте — по **апрувленному мокапу** `crm-ui-designer`, не по описанию | Текстовое описание экрана в промпте даёт компоновку «как получится»; мокап на живых токенах ловит это до кода |
| Тест к новой логике — **в том же спринте**, секцией `## ТЕСТЫ` | Тест, дописанный «потом», зеркалит реализацию; тест в спринте проверяет поведение. Спринт без тестов обязан сказать об этом явно |
| Гейт **не перепроверяет руками то, что делает CI** (lint, tsc, vitest, build) | Дубль тратит контекст гейта на то, где машина точнее; гейт смотрит на смысл |

**Мержит только Олег.** Скилл не предлагает «я закоммичу» — он выдаёт вердикт и список
действий руками.

---

## Gate Review — режим 2

Гейт срабатывает, когда Олег приносит отчёт Claude Code. Задача — **не поверить
отчёту, а проверить его**. Отчёт CC — это заявка, не доказательство.

### Порядок проверки

1. **Дифф** — прочитать реальные изменения, а не описание в отчёте. Начать с
   `git log main..HEAD` и `git diff --stat main...HEAD`: в диффе только этот спринт
2. **Расхождения** — каждое утверждение отчёта («добавил X», «починил Y») сверить с диффом
3. **Тесты** — к новой логике в `lib/` есть `*.test.ts`; тест проверяет поведение
   (вход → ожидаемый выход, граничные случаи), а не зеркалит реализацию; спринт без
   тестов содержит строку «тестов нет: …» с причиной. Нет ни того, ни другого — 🟡,
   для `lib/` с бизнес-логикой (расчёты, статусы, конвертации) — 🔴
4. **Линзы** — прогнать дифф по таблице «Линзы ревью» ниже. По каждой активной линзе
   в ответе либо находка, либо строка «проверено — ок». Молчание = пропуск
5. **Миграции** (если есть) — apply → прогнать advisors → ролевые смоки под каждой ролью
6. **Данные** — независимая сверка через SQL/запрос: не «должно быть», а фактический результат
7. **Cold review** — для рискованного спринта (миграция, RLS, роли, деньги/КП, удаление
   данных) в «Твои действия» первым пунктом: отдать **дифф + acceptance criteria без
   спринт-файла** в чистую сессию или другую модель. Гейт написал план и не увидит
   ошибку в самом плане — это не самокритика, это структура
8. **Правки на месте** — мелкие огрехи чинить самому, не гонять новый круг в CC
9. **Вердикт** — по формату ниже

### Линзы ревью — маршрутизация по диффу

Базовая линза включена всегда. Остальные — по триггеру из изменённых путей, не
«на всякий случай»: лишняя линза даёт 30 находок по мелочи и прячет 🔴.

| Что в диффе (триггер) | Линза (скилл) | Что проверяет на гейте |
|---|---|---|
| Любой спринт | **Базовая** — `qa-engineer`, линзы 1 · 2 · 5 (структура, логика, производительность) + шесть измерений ниже | Дизайн: туда ли положено · Сложность: можно ли проще · Тесты: упадут ли без фикса · Имена и консистентность с соседним кодом · Контекст: файл и систему целиком, не только дифф · Документация тем же PR |
| `supabase/migrations/`, RLS-policy, `memberships`/роли, auth, Storage, PII, AI-фича | `security-privacy-reviewer` (rls-threat-model, authorization-bugs, secrets) | Граница организации первым конъюнктом; IDOR и эскалация роли; секреты и токены не в клиенте; PII не в логах |
| Новая страница/компонент, `globals.css`, `t-*` темы, `TextNavSidebar` | `crm-design-auditor` (по скриншоту/коду) + `a11y-auditor` quick-pass | Токены вместо hex; семантический цвет по всем 7 темам; контраст, фокус, клавиатура; состояния empty/loading/error |
| Server Action, `app/api/`, внешний сервис (1С, Честный Знак, Telegram) | `api-architect` | Zod на границе; error model; идемпотентность и retry; секреты серверные |
| `lib/hooks/`, realtime, клиент Supabase, триггеры | `supabase-patterns` | PKCE по умолчанию; подписки с cleanup; optimistic + invalidate; CASCADE вместо клиентской очистки |

Правила линз:

- Лимит **≤ 8 находок** на гейт, каждая с цитатой из диффа (файл:строка). Остальное —
  одной строкой в «Дальше», не в «Находки».
- Линза «включена» = она названа в «Что проверено» с результатом. Формат строки:
  `Линзы: базовая ✓ · security ✓ (RLS quotes) · design — n/a · api — n/a`.
- Не звать скилл целиком «прогони аудит» — брать из него чеклист под конкретные файлы диффа.
- Что попало в required checks CI (lint, tsc, vitest, build) — на гейте не перепроверять,
  только прочитать статус.

### Формат ответа на гейте

```
Итог           — одна строка: принято / принято с правками / отклонено
Что проверено  — факты с доказательством: SQL-результат, версия, счётчик;
                 обязательная строка «Линзы: …» (какие включены, результат каждой)
Находки        — 🔴 / 🟡 / 🟢, каждая: что · чем грозит · что делать
Что я поправил — правки, внесённые на гейте, и почему
Твои действия  — нумерованный список, только руками
Дальше         — следующий шаг и развилка
```

Правила формата:

- Пустые секции **опускаются**. «Что я поправил» без правок — не пишем.
- **«Итог» и «Твои действия» есть всегда.** Даже «Твои действия: 1. мержи» — строка обязана быть.
- **Строка «Линзы: …» в «Что проверено» есть всегда.** Линза без результата = не прогнана.
- Рискованный спринт ⇒ «Твои действия» начинаются с cold review; вердикт «принято» условный
  до его результата.
- На коротких ответах структуру **не навешивать** — один вопрос про одну строку диффа
  получает один абзац.
- В «Что проверено» — только то, что реально выполнено, с артефактом (вывод команды,
  число строк, номер версии). Фраза без доказательства идёт в «Находки», не в «Что проверено».
- Severity: 🔴 блокирует мерж · 🟡 мержим, чиним следующим спринтом · 🟢 замечание на будущее.
- Отклонено ⇒ хотя бы одна 🔴. Принято ⇒ ни одной 🔴.

### Пример — сжато

```
Итог: принято с правками.

Что проверено:
— Миграция 076 применена, list_migrations показывает 076 последней.
— Advisors: 0 новых WARN (было 3, стало 3 — те же).
— Смок под viewer: SELECT по quotes → 0 строк, RLS держит.
— Тесты: `lib/utils/quote-budget.test.ts` — 6 кейсов, включая пустой budget и accept дважды.
— Линзы: базовая ✓ · security ✓ (RLS quotes, org-граница первым конъюнктом) · design — n/a · api — n/a.

Находки:
🟡 Хук use-quotes.ts без optimistic update — UI моргает на 300мс при accept.
   Чем грозит: заметно пользователю, не ломает данные. Что делать: следующий спринт.

Что я поправил:
— Убрал hardcoded #1a1a1a в QuoteCard.tsx → var(--surface-2): ломало тёмные темы.

Твои действия:
1. Cold review: дифф + AC из шапки спринта — в чистую сессию, без файла спринта (миграция + RLS).
2. Проверь вкладку «КП» на локале — accept должен ставить budget.
3. Мержи и пушь.

Дальше: S-QUOTE-2 (шаблоны КП) — или сначала закрыть 🟡 из этого гейта.
```

---

## Reference Files

| File | Read when | Contents |
|------|-----------|----------|
| `references/templates.md` | Choosing prompt structure for a task type | 7 templates: feature, bug fix, refactor, migration, component, deployment, cleanup |
| `references/claude-code-guide.md` | Need to know Claude Code capabilities/limits | What it can do, what fails, environment, anti-patterns |
| `references/examples.md` | Building a complex multi-task prompt | 5 complete real-world examples across different stacks |

---

## Two Modes

| Signal | Mode |
|--------|------|
| «подготовь спринт», «сделай промпт», описание задачи для кода | **Режим 1 — Prompt.** Workflow ниже |
| «вот отчёт», «прими работу», «проверь дифф», вставлен отчёт/дифф CC | **Режим 2 — Gate.** Порядок и формат см. Gate Review выше |

---

## Workflow — режим 1

1. **Classify** — determine task type using the Decision Flow below
2. **Gather** — check if enough context is available; if not, ask (see Missing Context table)
3. **Read template** — open `references/templates.md`, pick the matching template
4. **Adapt** — fill template with real file paths, table/column names, class names from user's context
5. **Verify** — run the prompt through the Quality Checklist (12 points)
6. **Deliver** — сохранить файлом в `_analysis/` (`sprint-*.md` / `fix-*.md`) и выдать
   одну строку для чата CC: «прочитай файл `_analysis/<имя>.md` и выполни».
   Если файловая доставка недоступна — один markdown-блок, который Олег сохранит сам.

---

## Missing Context — What to Ask

Before generating a prompt, verify you have enough to produce real file paths
and real names — not placeholders. If any critical piece is missing, ask.

| Missing | Ask | Why |
|---------|-----|-----|
| Stack / framework | "Какой стек? (Next.js, Python, etc.)" | Determines file structure, commands, build tools |
| File paths | "Где лежат компоненты? (src/components/, app/, etc.)" | Prompts with wrong paths fail silently |
| DB schema | "Какие таблицы/колонки задействованы?" | SQL + types must match real schema |
| Current state | "Что сейчас работает, что сломано?" | РАЗВЕДКА must verify the right things |
| Dependencies | "Какие библиотеки уже используются? (UI kit, ORM, etc.)" | Prevents importing conflicting packages |
| Новый экран без мокапа | «Экран спроектирован? Покажи мокап» — нет → сначала `crm-ui-designer` (для CRM) | Экран, описанный текстом в промпте, переделывается после первого же гейта |

Ask only what you cannot infer. If user shared project context earlier in the
conversation or via a project skill (e.g. `crm-architect`) — use that, do not
re-ask.

---

## Prompt Structure

Every prompt follows this skeleton:

```markdown
# Claude Code Prompt — [Title]

## РАЗВЕДКА (always first)
bash/grep/find commands to verify current state before any changes

## ЗАДАЧА 1: [Short title]
### Context (why this change)
### Steps (what to do, with exact file paths)
### Verification (how to confirm it worked)

## ЗАДАЧА 2: [Short title]
...

## ТЕСТЫ
Vitest для новой логики в lib/ (utils, validators, helpers): вход → ожидаемый выход,
граничные случаи. UI-only спринт — строка «тестов нет: только разметка/стили».

## ФИНАЛЬНАЯ ПРОВЕРКА
Lint / typecheck / vitest / build commands

## КОММИТ
git add/commit with descriptive message
```

---

## Decision Flow

```
Вход
  │
  ├─ Отчёт / дифф от Claude Code
  │    → Режим 2: Gate Review — проверка диффа, вердикт по формату
  │
  ├─ Simple fix (1 file, obvious change)
  │    → Single-task prompt, minimal РАЗВЕДКА
  │
  ├─ Feature (new functionality)
  │    → Read templates.md → "feature" template
  │    → Multi-task: DB → Types → Logic → UI → Tests
  │
  ├─ Bug fix (something broken)
  │    → Read templates.md → "bug-fix" template
  │    → Heavy РАЗВЕДКА, hypothesis, targeted fix
  │
  ├─ Refactor (restructure without behavior change)
  │    → Read templates.md → "refactor" template
  │    → Before/after verification, no functionality change
  │
  ├─ DB migration (schema change)
  │    → Read templates.md → "migration" template
  │    → SQL first, then types, then consuming code
  │
  └─ Multi-sprint (large feature)
       → Break into numbered sprints
       → Each sprint is self-contained and deployable
```

---

## Output Format

Always deliver the finished prompt as a **single markdown code block** in chat.
The user copies it and pastes directly into Claude Code — no extra formatting,
no wrapper text inside the block.

If the prompt exceeds 5 ЗАДАЧА blocks, split into numbered sprints
(e.g. Sprint 12.1, Sprint 12.2) and deliver each as a separate code block
with a one-line note between them explaining the dependency.

---

## Prompt Quality Checklist

Run before delivering any prompt:

- [ ] Starts with РАЗВЕДКА — diagnostic commands before changes
- [ ] All file paths are plausible (not invented)
- [ ] Table/column/class names verified against user's context
- [ ] One concern per ЗАДАЧА block
- [ ] Each ЗАДАЧА has verification command
- [ ] str_replace blocks show enough context to be unique
- [ ] No placeholder names — real names or explicit "find via grep"
- [ ] Секция ТЕСТЫ есть: vitest для новой логики в `lib/` или явное «тестов нет: …» с причиной
- [ ] Тест описан поведением (вход → выход, граничные случаи), не «покрыть функцию»
- [ ] ФИНАЛЬНАЯ ПРОВЕРКА includes typecheck/lint/vitest/build
- [ ] КОММИТ with descriptive message
- [ ] Edge cases addressed (what if file doesn't exist, column already exists)
- [ ] `IF NOT EXISTS` / `IF EXISTS` in SQL statements
- [ ] No assumptions about state — РАЗВЕДКА verifies everything

---

## Prompt Writing Rules

### 0. Спринт, который трогает ПОКАЗ поля, разведует ДАННЫЕ, а не только код
Форматтер пишется под то, что реально лежит в колонке. «Пустое» в импортированной базе
почти никогда не `NULL`: в dashboard-crm пустая фамилия записана дефисом, и фикс F-01
прошёл тесты, но не сработал на экране. В РАЗВЕДКУ такого спринта — запрос распределения:

```sql
select coalesce(<col>,'∅') as val, count(*) from <table>
where <col> is null or length(trim(<col>)) <= 3 group by 1 order by 2 desc;
```

Он показывает и заполнители («-», «н/д»), и границу, за которую нельзя чистить по длине
(настоящие короткие значения). Без него спецификация форматтера — предположение.

### 1. РАЗВЕДКА is mandatory
Never skip. Even if you "know" the file structure, Claude Code might be
running in a different state. 3-5 diagnostic commands cost nothing and
prevent cascading errors.

### 2. Use grep/find, not cat
`cat` dumps entire files. `grep -n "pattern" file` finds the exact line.
Claude Code has limited context — surgical reads beat full file dumps.

```bash
# Bad — dumps 500 lines, Claude Code loses focus
cat src/app/globals.css

# Good — finds the exact block
grep -n "t-scandi" src/app/globals.css | head -20
```

### 3. str_replace needs unique anchors
When instructing Claude Code to edit a file, the search string must be
unique. Include enough surrounding context:

```bash
# Bad — might match multiple places
str_replace "return data" → "return data || []"

# Good — unique with surrounding context
str_replace:
  old: |
    const { data, error } = await supabase.from('tasks').select('*');
    return data;
  new: |
    const { data, error } = await supabase.from('tasks').select('*');
    return data || [];
```

### 4. Order by dependency
```
SQL migration → TypeScript types → Zod validators → Tests (для lib/) →
Hooks/API → Components → Styles
```
Never put UI changes before the data layer they depend on. Тест на чистую функцию
пишется сразу после неё, не в конце спринта — иначе он не пишется.

### 5. One escape hatch per task
If a step might fail, provide a fallback:
```
Если файл не найден, проверь:
find src -name "*Modal*" -type f
```

### 6. Commit messages are descriptive
```bash
# Bad
git commit -m "fix"

# Good
git commit -m "fix(tasks): prevent stale closure in drag handler by converting to useRef"
```

### 7. Multi-sprint decomposition
For large features, split into sprints where each sprint is:
- Self-contained (doesn't break if you stop here)
- Deployable (app works after this sprint)
- Testable (user can verify visually or via commands)

---

## Anti-Patterns in Prompts

| Anti-pattern | Why it fails | Fix |
|-------------|-------------|-----|
| "Fix the bug in the modal" | No location, no diagnosis | Provide file path + line + hypothesis |
| `cat` large files | Floods context, loses focus | `grep -n` for targeted reads |
| Editing multiple concerns in one step | If step 3 fails, steps 1-2 might be broken | One concern per ЗАДАЧА |
| Hardcoded values from memory | Schema might have changed | РАЗВЕДКА verifies first |
| "Add a column" without IF NOT EXISTS | Fails on re-run | Always use IF NOT EXISTS |
| No verification commands | Silent failures compound | Every task gets a check |
| Placeholder names: `<your-table>` | Claude Code takes them literally | Use real names or say "find via grep" |
| Mixing SQL + UI in one task | Different failure modes | Separate tasks: DB first, then UI |
| Промпт целиком в чат CC вместо файла | Обрезается, теряется контекст | Файл в `_analysis/` + одна строка в чат |

---

## Anti-Patterns на гейте

| Anti-pattern | Почему плохо | Как надо |
|-------------|-------------|---------|
| «Судя по отчёту, всё сделано» | Отчёт CC — заявка, не факт | Читать дифф, сверять каждое утверждение |
| «Что проверено: миграция применена» без вывода | Недоказуемо, выглядит как проверка | Приводить артефакт: вывод `list_migrations`, счётчик, версия |
| Все находки одной кучей | Непонятно, что блокирует мерж | 🔴/🟡/🟢 + «чем грозит» на каждую |
| Вердикт «вроде норм, но есть вопросы» | Олег не знает, мержить или нет | Одна строка: принято / принято с правками / отклонено |
| «Твои действия» с пунктом «я закоммичу» | Мерж и пуш — руками у Олега | Только действия, которые делает он |
| Полная 6-секционная структура на вопрос в одну строку | Шум | Короткий ответ — короткий формат |
| Применение миграции без advisors и ролевых смоков | Дыры в RLS находятся именно смоком | apply → advisors → смок под каждой ролью |
| «Дифф соответствует спринт-файлу» как единственный критерий | Гейт написал файл; ошибка в плане пройдёт | Базовая линза (дизайн, сложность, тесты, контекст) + cold review на рискованных |
| Линза не упомянута — «значит, всё чисто» | Молчание неотличимо от пропуска | Строка «Линзы: …» с результатом каждой |
| Гейт руками гоняет tsc/lint/build, которые уже прошли в CI | Контекст гейта уходит на то, где машина точнее | Читать статус checks; гейт — про смысл |
| 20 находок уровня «переименуй переменную» | Прячут 🔴 в шуме | ≤ 8 находок с цитатой; остальное строкой в «Дальше» |
| Спринт без тестов принят молча | Следующий дефект найдётся «тестом соседней сущности» | 🟡/🔴 по правилу шага 3 или явное «тестов нет: …» |

---

## Источник и раскатка

Источник этого скилла — папка `sprint-prompt-builder/` в репозитории dashboard-crm. Копии в
`~/.claude/skills/sprint-prompt-builder/` (Claude Code) и в аккаунте Claude.ai (Cowork, гейт) —
производные: правки в них не переживают раскатку и не попадают в ревью.
Цикл: правка в репо → PR → мерж → `scripts/skill-deploy.sh sprint-prompt-builder` → загрузить
`sprint-prompt-builder.skill` в Claude.ai → Customize → Skills. Повод для правки — изменение
самого процесса (новое правило, фаза, линза), не итог спринта: состояние
проекта живёт в crm-architect, здесь его нет намеренно.
