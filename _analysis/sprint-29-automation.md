# Claude Code Prompt — Sprint 29: Автоматизация v1 (триггер → действие)

## Контекст

БД на 028 (применена руками через SQL Editor; ai-summarize задеплоена, ждёт
кредитов Anthropic — не трогать). S29 — «стадия изменилась → автозадача
ответственному»: композиция поверх готовых механик, почти без нового кода
уведомлений — **INSERT задачи с assigned_to сам триггерит notify_task_assigned
из S26** (INSERT-ветка подтверждена смоком). Ничего не дублировать.

**Скоуп v1 (жёстко):**
- Один trigger_type: `stage_entered` (сделка вошла в стадию).
- Один action_type: `create_task`.
- Без визуального конструктора — форма в Settings, 3 пресета seed'ом.
- Правило стреляет **один раз на пару (сделка, стадия)** — защита от спама
  при пинг-понге стадий. Осознанное ограничение v1, зафиксировать в docs.

**Контракт прежний:** миграцию пишешь, НЕ применяешь (гейт Cowork; если MCP
не оживёт — Олег применит руками, как 028). Разведка живой БД через Supabase MCP
(если коннектор жив; иначе — по docs/schema.md, он синхронен на 027+028).

## РАЗВЕДКА

```bash
# 1. tasks: обязательные поля / дефолты для INSERT из функции
grep -n "text\|lane\|priority\|deadline" src/types/database.ts | sed -n '1,15p'
# 2. Settings: структура секций (куда добавлять «Автоматизации»)
grep -n "Section" src/app/settings/page.tsx | head
# 3. Существующие хуки-паттерны CRUD по org-scoped конфигу (stage_requirements — образец)
sed -n '1,40p' src/lib/hooks/use-stage-requirements.ts
```

Supabase MCP (если жив): AFTER-триггеры на projects (имена, чтобы не
конфликтовать), колонки tasks (text NOT NULL, lane/priority CHECK-значения).

## ЗАДАЧА 1: Миграция 029_automation.sql

### 1.1. Таблицы

```sql
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name           text NOT NULL,
  trigger_type   text NOT NULL CHECK (trigger_type IN ('stage_entered')),
  trigger_config jsonb NOT NULL,  -- {"pipeline_id": uuid, "stage_id": uuid}
  action_type    text NOT NULL CHECK (action_type IN ('create_task')),
  action_config  jsonb NOT NULL,  -- {"task_text": "Подготовить КП по {deal}",
                                  --  "assignee": "deal_owner"|"deal_creator",
                                  --  "lane": "now", "priority": "important",
                                  --  "due_in_days": 3}
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_rules_org
  ON public.automation_rules(org_id) WHERE is_active;

-- Журнал срабатываний + идемпотентность (один выстрел на сделку+стадию)
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id    uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id   uuid NOT NULL,
  task_id    uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  fired_at   timestamptz DEFAULT now(),
  UNIQUE (rule_id, project_id, stage_id)
);
```

RLS: automation_rules — паттерн stage_requirements (SELECT члены org,
write owner/admin). automation_runs — SELECT члены org, write-политик НЕТ
(пишет только definer-триггер).

### 1.2. Функция-исполнитель

```sql
CREATE OR REPLACE FUNCTION public.run_stage_automations() RETURNS trigger ...
```

Требования:
- AFTER UPDATE ON projects, условие внутри: `NEW.stage_id IS DISTINCT FROM OLD.stage_id`.
- SECURITY DEFINER + search_path + ACL только service_role (паттерн триггерных).
- **EXCEPTION-глотание ОБЯЗАТЕЛЬНО** (`EXCEPTION WHEN OTHERS THEN RETURN NEW`):
  автоматизация никогда не блокирует переход — противоположность гейту S27.
  Внутри цикла по правилам — вложенный BEGIN/EXCEPTION на каждое правило:
  падение одного не гасит остальные.
- Цикл по активным правилам org: `org_id = NEW.org_id AND trigger_type='stage_entered'
  AND (trigger_config->>'stage_id')::uuid = NEW.stage_id`.
- Идемпотентность: INSERT в automation_runs с ON CONFLICT DO NOTHING;
  если строка НЕ вставилась (правило уже стреляло для этой сделки+стадии) — skip.
- Создание задачи: text = шаблон с заменой `{deal}` → NEW.name (простой replace(),
  никакого format()/EXECUTE); assigned_to по action_config->>'assignee':
  'deal_owner' → COALESCE(NEW.owner_id, NEW.created_by), 'deal_creator' →
  NEW.created_by; lane/priority из конфига с валидацией по допустимым значениям
  (whitelist в CASE, дефолты 'now'/'normal' — сверь реальные CHECK-значения
  по разведке!); deadline = CURRENT_DATE + COALESCE((action_config->>'due_in_days')::int, 3);
  project_id/company_id/contact_id из NEW; **org_id = NEW.org_id явно**.
- UPDATE automation_runs SET task_id после создания.
- activity_log: event 'automation_fired', payload {rule_id, task_id, stage_id},
  user_id = COALESCE(auth.uid(), NEW.owner_id, NEW.created_by), org_id = NEW.org_id.
- Уведомление НЕ создавать руками — trg_notify_task_assigned на tasks сделает
  сам (INSERT-ветка; самоназначение отфильтрует).

Триггер: `trg_zz_run_automations` AFTER UPDATE ON projects FOR EACH ROW —
префикс zz_: после всех AFTER-синков (алфавитный порядок), нам нужны финальные
значения NEW.

### 1.3. Seed (3 пресета, идемпотентно, матч стадий по name — паттерн 027)

1. Вход в «Подготовка КП» → задача «Подготовить КП по {deal}», deal_owner,
   important, +3 дня.
2. Вход в «Договор» → «Подготовить договор по {deal}», deal_owner, important, +5.
3. Вход в стадию с is_won=true → «Запросить отзыв/кейс у {deal}», deal_owner,
   normal, +14 (матч по is_won, не по имени).

## ЗАДАЧА 2: Типы + хук

database.ts: AutomationRule, AutomationRun (+ Tables). use-automation-rules.ts —
CRUD по образцу use-stage-requirements (org-scoped, invalidation).

## ЗАДАЧА 3: UI — Settings → «Автоматизации» (owner/admin)

Рядом с гейтами: список правил (человекочитаемо: «Стадия „Подготовка КП“ →
задача „Подготовить КП по {deal}“ → владелец сделки, +3 дня»), is_active-тогл,
удалить, форма добавления: воронка → стадия (селекты из pipelines/stages),
шаблон текста (подсказка про {deal}), исполнитель (владелец/создатель),
приоритет, срок (+N дней). Scandi-токены, Lucide.

## ЗАДАЧА 4: docs/schema.md + скилл

Таблицы, функция (EXCEPTION-политика: глотает, в отличие от гейта — почему),
триггер zz_-порядок, идемпотентность runs, композиция с notify_task_assigned.
Header: 029 pending. Скилл learnings.md: «гейт блокирует (без глотания),
автоматизация глотает (никогда не блокирует) — противоположные политики
EXCEPTION для BEFORE-валидаторов и AFTER-исполнителей».

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
grep -c "EXECUTE \|format(" supabase/migrations/029_automation.sql | head -1  # только seed DO-блок, в функции — 0
```

## КОММИТ

```bash
git add supabase/migrations/029_automation.sql src/ docs/schema.md
git commit -m "Sprint 29: автоматизация v1 — automation_rules/runs, run_stage_automations (идемпотентно, композиция с notify), Settings→Автоматизации, 3 пресета"
```

## Гейт (Cowork; при мёртвом MCP — ручной фолбэк как 028)

1. Ревью: EXCEPTION-политика (глотание + вложенные), идемпотентность,
   whitelist lane/priority, отсутствие EXECUTE/format в функции, org_id явный.
2. apply → smoke: переход сделки в «Подготовка КП» (с выполненными гейт-требованиями!)
   → задача создана с правильным assignee/deadline + уведомление (если assignee ≠
   актор) + automation_runs строка; повторный пинг-понг стадии → второй задачи НЕТ;
   is_active=false → не стреляет; правило с битым конфигом → переход НЕ ломается.
3. Advisors.
