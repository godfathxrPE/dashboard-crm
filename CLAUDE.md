# dashboard-crm — контракт работы для Claude Code

Тонкая страховка на случай, если сессия поднялась **без** скилла `crm-architect`.
Полная память проекта — в `~/.claude/skills/crm-architect/` (SKILL.md + references/).
Актуальная программа работ — `improvements/CRM-ROADMAP-2*.md` и `_analysis/`.

## Стек (не менять)

Next.js 15 App Router · TypeScript strict · Tailwind · Supabase (Postgres + RLS + Edge)
· TanStack Query · Zustand (UI-state) · RHF + Zod. Деплой — **Vercel**, авто из `main`
(`netlify.toml` и `.netlify/` — реликты отката, не актуальный конфиг).
Supabase ref: `uoiavcabxgdjugzryrmj`. Применённые миграции — **001–075**, следующая
свободная — **076** (060 зарезервирована и не занята — не возвращаться к ней).

## Жёсткие правила

1. **Миграции не применять.** Писать `supabase/migrations/0NN_name.sql` и коммитить.
   Применяет гейт Cowork (apply_migration → gen-types → advisors → ролевые смоки).
   Прод-БД из CC не трогать: мутаторы Supabase MCP закрыты `deny` в
   `.claude/settings.local.json`; `execute_sql` оставлен **только** под read-only
   разведку (`information_schema`, `pg_policies`, `pg_get_functiondef`) — писать им запрещено
   контрактом, система прав этого не различает.
2. **`src/types/supabase.gen.ts` и `src/types/database.ts` руками не правятся** —
   только регенерация (реген через MCP не отдаёт блок `graphql_public`, который отдаёт
   CLI → в диф придут ~28 ложных удалений; сверять).
3. **`.env` и секреты не читать.**
4. **Разведка перед правкой.** Живая БД — источник истины по схеме, не папка миграций:
   `docs/schema.md` отстаёт (ledger 062–075 не внесён, спринт `S-DOCS-SCHEMA-SYNC`).
5. **`docs/schema.md` обновляется тем же PR, что миграция.** Плюс копия в скилле.
6. **Отчёт о сделанном называть отчётом** — не нумерованным планом с распределением
   ответственности.

## Конвенции

- Хуки `src/lib/hooks/use-*.ts` (plural) · валидаторы `src/lib/validators/*.ts` (singular)
  · типы `src/types/database.ts` · UI `src/components/{domain}/` · чистый домен
  `src/lib/utils/` или `src/lib/domain/` · константы `src/lib/constants/`.
- **RLS org-first**: `org_id = current_org_id()` первым конъюнктом, роль через
  `current_org_role()`, ownership через `owner_id`/`created_by` (не `user_id`).
  Новые функции — `SECURITY DEFINER SET search_path = public, pg_temp` + адресный ACL
  (`revoke all from public, anon` → `grant execute to authenticated|service_role`).
- **Никаких хардкод-цветов** — только CSS-переменные; правки тем скоупятся в `.t-aura {}` и т.п.
- `any` запрещён; для внешних payload — `unknown` + type guard.
- Единицы rem/em/clamp (px только для границ ≤ 2px). Эмодзи в UI нет — иконки Lucide.

## Грабли, которые дороже всего (полный список — learnings.md скилла)

- **Гейт стадии читает pre-update строку**: `aa_enforce_stage_gate` — BEFORE UPDATE,
  `check_stage_requirements` селектит старую строку. `update({stage_id, ...поля})` одним
  запросом упадёт, если гейт требует поле из этого же патча.
- **История стадий не пишется** с 047 (снят `log_stage_change`) — `stage_entered_at`
  хранит только текущее значение.
- **`pipelines`/`pipeline_stages` — глобальные словари**, не org-scoped: org-специфичные
  атрибуты стадий только отдельной таблицей `(org_id, stage_id, …)`.
- **`organizations` UPDATE — owner-only** (`org_update_owner`).
- **Workflow**: `wf.ran` — один проход автоматизаций на транзакцию; `set_field` whitelist —
  `next_step`/`pinned_note`/`next_action_date`/`probability`, **никогда** `stage_id`/`status`/`type`/`org_id`.
- **`npm run build` при живом `next dev` убивает dev-сервер** — билд гонять последним.
- Календарные вычисления из `timestamptz`: ключ дня — MSK (`mskDateKey`), бакеты Ганта — на
  UTC-полдне (`T12:00:00Z`), иначе off-by-one на границах суток/DST.
