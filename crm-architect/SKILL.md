---
name: crm-architect
description: >
  Architecture reference and sprint prompt builder for dashboard-crm project
  (Next.js 15 + TypeScript + Tailwind + Supabase on Vercel). Use whenever the user
  mentions CRM, dashboard, дашборд, спринт, or asks about project structure,
  database schema, themes, components, hooks, or Supabase configuration. Also trigger
  on: "подготовь промпт для Claude Code" (для dashboard-crm), "сделай спринт", "что у нас в схеме",
  "добавь фичу в CRM", or any request involving dashboard-crm codebase changes.
  English triggers: "sprint prompt", "add feature to CRM", "database schema",
  "what's in our schema", "prepare prompt for Claude Code". This is the project
  memory — always consult before generating CRM-related code. Do NOT use for
  generic Next.js/Supabase questions unrelated to dashboard-crm. Промпты для
  Claude Code по другим проектам — sprint-prompt-builder. Do NOT use for
  document generation (docx/pdf/pptx) — use dedicated skills.
---

# CRM Architect

Living architecture reference for **dashboard-crm** — a custom CRM for industrial
marking solutions (Честный ЗНАК / Cleverence). This skill is the project's memory:
schema, file structure, design system, conventions, and accumulated learnings from
40+ спринтов (журнал спринтов — у Claude Code, см. ниже).

**Always read the relevant reference file before generating CRM code or sprint prompts.**

---

## Project Identity

| Key | Value |
|-----|-------|
| Stack | Next.js 15, TypeScript, Tailwind CSS, Supabase |
| Repo | `godfathxrpe/dashboard-crm` |
| Local path | `~/Downloads/dashboard-crm` |
| Supabase ref | `uoiavcabxgdjugzryrmj` |
| Migrations | Полный ledger — **`docs/schema.md` в репозитории**, не эта таблица. На 2026-08-12: последний применённый — **123** (`20260812060950 lead_convert_carryover`), всего версий в ledger 118, файлов в `supabase/migrations/` — 83. Номера в папке дырявые: 047 и 088a применены без файла, **060 зарезервирована и не занята**, **116 ОТМЕНЕНА и удалена** (её популяция вычищена вручную до apply — см. `docs/schema.md`). **Номер следующей миграции берётся запросом к `supabase_migrations.schema_migrations`** — не из этой таблицы и не из `ls` папки (069–073 записаны там без числового префикса, греп по номеру их не находит) |
| Tenancy | **Multi-tenant**: organizations + memberships; роли owner/admin/manager/viewer (только в memberships) |
| Deploy | **Vercel** (dashboard-crm-ten.vercel.app; netlify.toml — реликт для отката) |
| Themes | **7 тем**: aura (дефолт) / washi / fuji / **minimal** / frost / aurora / tidal. **minimal — рабочая тема владельца**, смоки визуальных правок гнать в ней в первую очередь. Акцент minimal — петроль `#0E7C86` (терракота ушла, см. theme-system.md) |
| Locale | Russian UI, English code |

---

## Reference Files

| File | Read when | Contents |
|------|-----------|----------|
| `references/schema.md` | Перед любой DB-работой — **прочитать первым** | **Указатель, не схема** (с 2026-08-05): куда идти за истиной + конвенции, которых нет в `docs/schema.md` (порядок слоёв, ownership, RLS org-first, hardening, правила новой org-таблицы). Сами таблицы и колонки — в `docs/schema.md` репозитория |
| `references/architecture.md` | Adding pages, components, hooks, or understanding structure | File tree, component patterns, state management, routing |
| `references/theme-system.md` | Any UI/styling work, theme changes, z-index issues | CSS variable system, theme rules, elevation, z-index hierarchy |
| `references/learnings.md` | Before ANY sprint prompt or architecture decision | Accumulated gotchas, anti-patterns, proven solutions from 40+ sprints |

_(`references/sprint-example.md` в этой таблице числился до 2026-08-05, но файла нет и
не было — строка удалена. Образец промпта — любой `_analysis/sprint-*.md` в репозитории.)_

### Три хранилища памяти и одно направление

У Claude Code есть **собственный журнал** — `~/.claude/projects/<проект>/memory/`
(индекс `MEMORY.md` + файл на спринт). Cowork на гейте его **не видит**: мост не
выходит за пределы папки проекта. Отсюда правило: **всё, что должно быть видно
проверяющему или пригодится любому следующему спринту, живёт в этом скилле.** Знание,
оставшееся только в журнале CC, для гейта не существует — на гейте спрашивать отчёт,
а не рассчитывать прочитать журнал самому.

Сам скилл существует в трёх экземплярах, и равноправны они **не**:

| Экземпляр | Кто читает | Статус |
|---|---|---|
| `crm-architect/` в репозитории | ревью, гейт (как обычный дифф) | **источник истины** |
| `~/.claude/skills/crm-architect/` | Claude Code | производная, перезаписывается раскаткой |
| Claude.ai → Customize → Skills | Cowork-сессии, в т.ч. гейт | производная, загружается руками |

```
crm-architect/ в репозитории (источник, git)
        │
        ├─ scripts/skill-deploy.sh ──► ~/.claude/skills/crm-architect/   (Claude Code)
        │                         └──► crm-architect.skill (zip)          → загрузить в аккаунт руками
        └─ scripts/skill-verify.sh ──► diff: репо ↔ локальная копия
```

**Почему правило появилось.** 2026-08-05 аккаунтная копия замерла на `v2.0 · 2026-07-29`
и утверждала «миграции 001–075, следующая 076», когда в проекте была 104 — гейт построил
на ней ложный вывод про несуществующий долг `docs/schema.md`, а расхождение копий
выяснилось только через три раунда уточнений.

**Правило: после любой правки памяти — `scripts/skill-deploy.sh` и загрузка
`crm-architect.skill` в аккаунт; иначе гейт работает по старой версии.** Правку вносить
только в репозиторий: направление синхронизации одно, обратного копирования нет.

---

## Output Format Decision

| Ситуация | Формат |
|----------|--------|
| "подготовь спринт" / "sprint prompt" | Markdown sprint prompt (copy-paste в Claude Code) |
| "что у нас в схеме" / architecture question | Inline ответ с цитатами из reference файлов |
| Баг / ошибка / скриншот | Диагностические команды → fix prompt |
| "хочу добавить фичу" / feature design | Архитектурный план (DB → Types → Hook → UI) → sprint prompt |
| "как лучше реализовать X" | Обсуждение вариантов с trade-offs → решение |

---

## Task Types

### 1. Sprint Prompt Generation

When: "подготовь спринт", "сделай промпт для Claude Code", "добавь фичу X"

Workflow:
1. Read `docs/schema.md` **в репозитории** — verify table/column names exist (в скилле схемы нет, `references/schema.md` — указатель)
2. Read `references/architecture.md` — find affected files
3. Read `references/learnings.md` — check for known gotchas
4. Generate prompt in this format:

```
# Claude Code Prompt — Sprint N: [Title]

## РАЗВЕДКА (diagnostic commands first)
bash/grep commands to verify current state

## ЗАДАЧА 1: [Description]
### Step-by-step instructions with exact file paths
### str_replace blocks or new code

## ЗАДАЧА 2: ...

## КОММИТ
git add . && git commit -m "Sprint N: [one-line summary]"
```

Rules for sprint prompts:
- **Always start with РАЗВЕДКА** — bash/grep commands before any changes
- **Use real column/table names** from `docs/schema.md` (репо) или живой БД через MCP, never guess
- **Include commit message** at the end
- **SQL migrations** go to `supabase/migrations/` and are **committed, not applied**: apply — операция гейта Cowork через Supabase MCP (`apply_migration` → gen-types → advisors → ролевые смоки)
- **Verify after each task** — include check commands

### 2. Architecture Questions

When: "как устроен X", "где лежит Y", "что у нас в схеме"

→ Read relevant reference file, answer with exact paths and code references.

### 3. Bug Diagnosis

When: user shares error, screenshot, or describes broken behavior

Workflow:
1. Read `references/learnings.md` — check if this is a known pattern
2. Read `references/architecture.md` — identify affected components
3. Generate diagnostic commands (grep, find)
4. Propose fix with exact file paths

### 4. Feature Design

When: "хочу добавить X", "как лучше реализовать Y"

Workflow:
1. Read `docs/schema.md` (репо) — does it need new tables/columns?
2. Read architecture.md — where does it fit in the file tree?
3. Read learnings.md — any relevant gotchas?
4. Propose: DB changes → Types → Hook → Component → Sprint prompt

---

## Sprint Prompt Quality Checklist

- [ ] Starts with РАЗВЕДКА (diagnostic bash/grep commands)
- [ ] References real table/column names from `docs/schema.md` (репо)
- [ ] References real file paths from architecture.md
- [ ] Checks learnings.md for relevant gotchas
- [ ] SQL migrations are separate files; номер — из `schema_migrations`, не из папки
- [ ] Types updated in `src/types/database.ts`
- [ ] Validators updated in `src/lib/validators/`
- [ ] Hook changes include optimistic updates
- [ ] CSS changes scoped to theme (`.t-aura {}`)
- [ ] No hardcoded colors — CSS variables only
- [ ] **Цвет, кодирующий смысл, взят семантическим токеном (`--danger`/`--info`/…), НЕ `--accent`** — и прогнан по всем 7 темам: в `t-washi` акцент === `--red`, в `t-aura` акцент вообще не цветной (`theme-system.md`)
- [ ] Commit message included
- [ ] No `storageKey` or `flowType` overrides in Supabase client (default `'pkce'` корректен; `flowType: 'implicit'` ломает SSR code exchange)
- [ ] DELETE operations rely on DB CASCADE, not client-side cleanup
- [ ] `docs/schema.md` updated тем же PR, что миграция (**копии в скилле больше нет** — обновлять только репо)
- [ ] **Разведка живой БД через Supabase MCP** (read-only) — не папка миграций
- [ ] **org_id / RLS-паттерн соблюдён** (org-граница первым конъюнктом, роль через `current_org_role()`, ownership через `owner_id`/`created_by`, не `user_id`)
- [ ] **Новые функции по hardening-конвенции** (`SECURITY DEFINER SET search_path = public, pg_temp` + адресный ACL)
- [ ] **Миграции не применяются из CC** — пишутся и коммитятся, применяет гейт Cowork
- [ ] **Новый раздел приложения — шесть точек правки**, не одна (страница · `TextNavSidebar` · `section-colors` · `ContentHeader` · `AuraOrbs`+`globals.css` · `CommandPalette` дважды). Таблицу с последствиями пропуска — в `learnings.md`
- [ ] **Числовой порог в сиде сверен с живой БД** — «сколько строк попадёт сегодня»; ноль допустим, но как решение, не как сюрприз
- [ ] **Правка памяти доехала до всех копий**: изменения в `crm-architect/` (репо) → `./scripts/skill-deploy.sh` → загрузка `crm-architect.skill` в Customize → Skills. Без последнего шага гейт следующего спринта читает прежнюю версию

---

## Гейт Cowork — dashboard-crm

Гейт стоит между «CC отчитался» и «Олег мержит». **Формат ответа на гейте
(Итог → Что проверено → Находки → Что я поправил → Твои действия → Дальше) —
в `sprint-prompt-builder`, режим 2.** Здесь — только то, что специфично для проекта.

### Цикл

```
Claude (chat) → спринт-файл в _analysis/ → ревью Grok → правки
  → Claude Code исполняет → отчёт → ГЕЙТ Cowork → Олег мержит и пушит
```

В CC уходит **файл** `_analysis/sprint-*.md` или `fix-*.md`, в чат — одна строка
«прочитай файл и выполни».

### Что проверяет гейт

| Шаг | Как | Почему |
|-----|-----|--------|
| Ревью диффа | Читать реальные изменения, а не описание из отчёта | Отчёт CC — заявка, не доказательство |
| Миграции: apply | Supabase MCP `apply_migration` — **CC миграции не применяет** | Необратимая операция, нужен контроль и откат |
| Миграции: advisors | `get_advisors` после apply, сравнить с прежним набором WARN | Новый WARN = дыра в RLS или незакрытый search_path |
| **Реген типов** | **НЕ гейтом.** `scripts/gen-types.sh` зовёт `npx`, а Cowork-мост к машине владельца **не имеет сети** — гейт ходит только в БД через MCP | Apply и реген физически разнесены между двумя исполнителями: гейт применяет миграцию, владелец/CC регенерирует типы и снимает стаб. Пропустить второе — оставить в `main` стаб, который врёт про схему |
| Ролевые смоки | Доступ под owner / admin / manager / viewer | Дыры в RLS находятся именно смоком (033, 036b найдены так) |
| Сверка данных | Независимый `execute_sql`, не пересказ отчёта | Фактический результат вместо «должно быть» |
| Обновление памяти | Новая миграция ⇒ `docs/schema.md` в репо тем же PR | Иначе память врёт следующему спринту |
| **Статус миграции** | После `apply_migration` — **в том же заходе** перевести раздел в `docs/schema.md` из «НАПИСАНА, НЕ ПРИМЕНЕНА» в `applied` + версия из `schema_migrations`, **до вердикта** | Статус пишет тот, кто применил: спринт-PR его знать не мог. Пропущено трижды — 104, 107, 098 |

⚠️ **Гейт читает аккаунтную копию скилла, а не репозиторий и не локальную папку.**
Пока `crm-architect.skill` не загружен в Customize → Skills, проверяющий работает по
прежней версии памяти — см. «Три хранилища памяти и одно направление» выше.

### Красные линии

- **`src/types/database.ts` и `supabase.gen.ts` руками не правятся** — только генератор.
- **Стаб типов снимается тем же заходом, что реген.** Оставленный `…Stub` переживает
  миграцию молча и продолжает описывать схему, которой уже нет.
- **`.env` и секреты не читаются** — ни в CC, ни на гейте.
- **CC не трогает прод-БД** — ни apply, ни DDL, ни данные. Смоки на живых записях
  клиентов — тоже нет: заводить тестовую компанию.
- **Агент не меняет настройки среды владельца** — `localStorage`, тема, выбранные
  фильтры: читать можно, писать нет.
- **Мерж и пуш — руками у Олега.** Гейт даёт вердикт, ветки не двигает.

---

## Conventions

### UI-примитивы
| Роль | Что использовать |
|---|---|
| Лист / подложка | `.sheet` (`@layer components`) |
| Карточка под курсором | `.elevation-hover` |
| Карточка доски | `.shadow-card` |
| Активное состояние (drag-over, выбрано) | `--accent-l2`, **не** `-l` с модификатором |

`ui/Card.tsx` удалён 2026-08-21. Подробности и запреты — `references/theme-system.md`.

### Naming
- Pages: `src/app/[entity]/page.tsx`
- Detail pages: `src/app/[entity]/[id]/page.tsx`
- Hooks: `src/lib/hooks/use-[entity].ts` (plural)
- Validators: `src/lib/validators/[entity].ts` (singular)
- Types: `src/types/database.ts` (single file, all entities)
- Modals: `src/components/modals/[Entity]Modal.tsx`

### Data Flow
```
User Action → Modal Form (Zod validation)
  → React Query mutation (optimistic update)
    → Supabase client call
      → Postgres (RLS enforced)
        → Trigger fires (activity_log)
          → Realtime subscription
            → React Query invalidation
```

### State Management
- **Server state**: React Query (TanStack Query) — all Supabase data
- **Client state**: Zustand — theme, sidebar, drawer, UI preferences
- **URL state**: searchParams — filters, active tabs (share-able)
- **Form state**: React Hook Form + Zod validators

### CSS
- All colors via CSS custom properties — never Tailwind color classes
- Theme changes scoped inside `.t-aura {}`, `.t-washi {}`, etc.
- Units: rem/em/clamp — never px (except borders ≤ 2px)
- No emoji in UI — SVG icons only (Lucide)
