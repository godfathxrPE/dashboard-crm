# Claude Code Prompt — Sprint 23: Мультитенантность (схема, без смены RLS)

## Контекст и цель

CRM переходит от single-user к multi-user продукту. Sprint 23 — первый из блока
S23–S26 (фундамент). Задача: ввести `organizations` + `memberships` и добавить
`org_id` во все tenant-таблицы, **не меняя существующие RLS-политики** —
приложение после спринта работает ровно как раньше. Рефактор RLS — Sprint 24.

⚠️ В проекте уже есть `profiles.role` ('admin','pm','member','viewer'),
helper `public.user_role()`, колонки `owner_id`/`created_by` на части таблиц.
НЕ трогать их в этом спринте — роли переедут в memberships в Sprint 25.

⚠️ Референс schema.md устарел (описывает миграции до 013, реально их 20).
Опирайся ТОЛЬКО на разведку и реальные файлы миграций.

---

## РАЗВЕДКА

```bash
# 1. Полный список таблиц из миграций
grep -h "CREATE TABLE" supabase/migrations/*.sql | sed 's/IF NOT EXISTS //' | awk '{print $3}' | sort -u

# 2. Какие таблицы имеют user_id / owner_id / created_by / profile_id
for col in user_id owner_id created_by profile_id; do
  echo "== $col =="; grep -l "$col" supabase/migrations/*.sql
done

# 3. Последний номер миграции
ls supabase/migrations/ | tail -3

# 4. Текущие типы
grep -n "export interface Database" -A 5 src/types/database.ts | head -10
grep -n "organizations\|org_id\|membership" src/types/database.ts src/types/entities.ts

# 5. Есть ли где-то в коде упоминание организаций (не должно быть)
grep -rn "org_id\|organization" src/ --include="*.ts" --include="*.tsx" | head -10

# 6. Как создаются записи в хуках (понять, ломает ли NOT NULL org_id инсерты)
grep -n "\.insert(" src/lib/hooks/*.ts | head -20
```

Зафиксируй результат разведки перед изменениями. Если найдёшь таблицы,
не перечисленные в ЗАДАЧЕ 1 — добавь их в миграцию по тем же правилам.

---

## ЗАДАЧА 1: Миграция 021 — organizations, memberships, org_id

Создать файл `supabase/migrations/021_multitenancy.sql`.
Применяется вручную: Supabase Dashboard → SQL Editor (НЕ `supabase db push`).

```sql
-- ============================================
-- Migration 021: Multitenancy (schema only, RLS unchanged)
-- Applied manually via Supabase SQL Editor
-- ============================================

BEGIN;

-- 1. Организации
CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- 2. Членство (роль — org-scoped; глобальную profiles.role не трогаем)
CREATE TABLE IF NOT EXISTS public.memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'manager'
                CHECK (role IN ('owner','admin','manager','viewer')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(org_id, profile_id)
);

-- 3. RLS на новые таблицы (минимальные политики; полный RBAC — Sprint 24/25)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select_member" ON public.organizations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.memberships m
            WHERE m.org_id = organizations.id AND m.profile_id = auth.uid())
  );

CREATE POLICY "membership_select_own_org" ON public.memberships
  FOR SELECT USING (
    profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.memberships m2
               WHERE m2.org_id = memberships.org_id AND m2.profile_id = auth.uid())
  );

-- 4. Helper: организация текущего пользователя (пока у юзера одна org)
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid AS $$
  SELECT org_id FROM public.memberships
  WHERE profile_id = auth.uid()
  ORDER BY created_at LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. org_id на все tenant-таблицы (nullable на этом шаге)
--    ⚠️ Сверь список с разведкой — если появились новые таблицы, добавь.
ALTER TABLE public.companies         ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.contacts          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.contact_company   ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.projects          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.tasks             ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.calls             ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.meetings          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.activities        ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.activity_log      ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.leads             ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.project_files     ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.kpi_entries       ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.call_tracker_days ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.scheduled_calls   ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
-- meeting_attendees: тенантность через meetings (join) — org_id не добавляем
-- user_settings: персональная таблица, вне тенант-модели
-- profiles: глобальная, вне тенант-модели

-- 6. Индексы
CREATE INDEX IF NOT EXISTS idx_memberships_profile ON public.memberships(profile_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org     ON public.memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_companies_org       ON public.companies(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org        ON public.contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_org        ON public.projects(org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org           ON public.tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_calls_org           ON public.calls(org_id);
CREATE INDEX IF NOT EXISTS idx_meetings_org        ON public.meetings(org_id);
CREATE INDEX IF NOT EXISTS idx_activities_org      ON public.activities(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_org    ON public.activity_log(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_org           ON public.leads(org_id);

COMMIT;
```

---

## ЗАДАЧА 2: Миграция 022 — backfill + автозаполнение org_id

Создать `supabase/migrations/022_multitenancy_backfill.sql`.

```sql
-- ============================================
-- Migration 022: Backfill default org + auto-fill trigger
-- ============================================

BEGIN;

-- 1. Дефолтная организация для существующих данных
INSERT INTO public.organizations (name, created_by)
SELECT 'Default Organization', p.id
FROM public.profiles p
ORDER BY p.created_at LIMIT 1;

-- 2. Членство всем существующим профилям.
--    Маппинг глобальной роли → org-роль: admin→owner, pm→admin,
--    member→manager, viewer→viewer.
INSERT INTO public.memberships (org_id, profile_id, role)
SELECT o.id, p.id,
  CASE p.role
    WHEN 'admin'  THEN 'owner'
    WHEN 'pm'     THEN 'admin'
    WHEN 'viewer' THEN 'viewer'
    ELSE 'manager'
  END
FROM public.profiles p
CROSS JOIN (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1) o
ON CONFLICT (org_id, profile_id) DO NOTHING;

-- 3. Backfill org_id (один UPDATE на таблицу)
DO $$
DECLARE
  v_org uuid;
  t text;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  FOREACH t IN ARRAY ARRAY[
    'companies','contacts','contact_company','projects','tasks','calls',
    'meetings','activities','activity_log','leads','project_files',
    'kpi_entries','call_tracker_days','scheduled_calls'
  ] LOOP
    EXECUTE format('UPDATE public.%I SET org_id = $1 WHERE org_id IS NULL', t)
    USING v_org;
  END LOOP;
END $$;

-- 4. Автозаполнение org_id на INSERT — чтобы существующий клиентский код
--    (хуки не передают org_id) продолжил работать без изменений.
--    Одна функция допустима: она ссылается ТОЛЬКО на NEW.org_id, который
--    есть во всех таблицах, куда вешаем триггер (грабли миграции 011
--    касались колонок, существующих не везде).
CREATE OR REPLACE FUNCTION public.set_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.current_org_id();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','contacts','contact_company','projects','tasks','calls',
    'meetings','activities','activity_log','leads','project_files',
    'kpi_entries','call_tracker_days','scheduled_calls'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_org_id ON public.%I;
       CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_org_id();', t, t);
  END LOOP;
END $$;

-- 5. NOT NULL — только после backfill и триггеров
ALTER TABLE public.companies         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.contacts          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.contact_company   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.projects          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.tasks             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.calls             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.meetings          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.leads             ALTER COLUMN org_id SET NOT NULL;
-- activity_log, activities, project_files, kpi_entries, call_tracker_days,
-- scheduled_calls: оставить nullable в этом спринте — в них пишут
-- SECURITY DEFINER триггеры и фоновые сценарии; ужесточим в Sprint 24
-- после аудита всех путей записи.

COMMIT;
```

⚠️ Перед `SET NOT NULL` выполни контроль:
```sql
SELECT 'companies' t, count(*) FROM public.companies WHERE org_id IS NULL
UNION ALL SELECT 'contacts', count(*) FROM public.contacts WHERE org_id IS NULL
UNION ALL SELECT 'projects', count(*) FROM public.projects WHERE org_id IS NULL
UNION ALL SELECT 'tasks',    count(*) FROM public.tasks    WHERE org_id IS NULL
UNION ALL SELECT 'calls',    count(*) FROM public.calls    WHERE org_id IS NULL
UNION ALL SELECT 'meetings', count(*) FROM public.meetings WHERE org_id IS NULL
UNION ALL SELECT 'leads',    count(*) FROM public.leads    WHERE org_id IS NULL;
-- все нули → можно SET NOT NULL
```

---

## ЗАДАЧА 3: Типы

В `src/types/database.ts`:

1. Добавить типы:
```typescript
export type OrgRole = 'owner' | 'admin' | 'manager' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  org_id: string;
  profile_id: string;
  role: OrgRole;
  created_at: string;
}
```

2. В `Database.public.Tables` добавить `organizations` и `memberships`
   (Row/Insert/Update по образцу существующих).

3. В Row-типы таблиц из ЗАДАЧИ 1 добавить `org_id: string`
   (для оставшихся nullable — `org_id: string | null`).
   В Insert-типы — `org_id?: string` (опционально: заполняет триггер).

Проверь `src/types/entities.ts` — если там продублированы интерфейсы
сущностей, добавь `org_id` и туда.

⚠️ Валидаторы (`src/lib/validators/*`) НЕ трогать: org_id не вводится
в формах, его ставит БД-триггер.

⚠️ Хуки (`src/lib/hooks/*`) НЕ трогать: insert без org_id валиден.

---

## ЗАДАЧА 4: Актуализация schema-документации

Референс схемы устарел (описывает 13 миграций, реально станет 22).
Создать/обновить `docs/schema.md` в репозитории: полный список таблиц
с колонками по фактическим миграциям 001–022, включая organizations,
memberships, leads, kpi_entries, call_tracker_days, scheduled_calls,
user_settings, activities. Отметить, какие таблицы tenant-scoped (org_id),
какие глобальные (profiles, user_settings).

---

## ПРОВЕРКА

```bash
# TypeScript
npx tsc --noEmit 2>&1 | head -10

# Билд
npm run build 2>&1 | tail -5
```

SQL-проверки (после применения миграций в SQL Editor):
```sql
-- 1. Организация и членства созданы
SELECT count(*) FROM public.organizations;   -- = 1
SELECT profile_id, role FROM public.memberships;

-- 2. Триггер автозаполнения работает (вставка без org_id)
INSERT INTO public.tasks (user_id, title, lane)
VALUES (auth.uid(), '_smoke_test_org', 'now') RETURNING org_id;  -- NOT NULL
DELETE FROM public.tasks WHERE title = '_smoke_test_org';

-- 3. Существующие политики не сломаны: открыть приложение,
--    проверить dashboard, projects, tasks, leads — данные видны как раньше.
```

Функциональный smoke-test в UI: создать задачу, звонок и лид через модалки —
записи создаются, ошибок RLS нет.

## КОММИТ

```bash
git add .
git commit -m "Sprint 23: multitenancy schema — organizations, memberships, org_id на tenant-таблицы (RLS без изменений)"
```

---

## Что сознательно НЕ входит в Sprint 23

- Смена RLS-политик на membership-модель → Sprint 24 (+ security-review)
- UI выбора/создания организации, invite flow → Sprint 26
- Перенос ролей из profiles.role в memberships, чистка user_role() → Sprint 25
- NOT NULL на служебных таблицах (activity_log и др.) → Sprint 24
