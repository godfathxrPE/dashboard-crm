-- S-TEAM-ROLES-1: расширение project_members.role до 8 значений.
-- Аддитивно: новый набор — суперсет старого (manager/implementer/installer ∈ new),
-- ни одна существующая строка не нарушит CHECK. role НЕ участвует в RLS (только ярлык).
-- DEFAULT 'manager' не меняем — manager валиден во всех категориях проектов.
-- Применяется гейтом атомарно (без BEGIN/COMMIT — конвенция apply_migration).

ALTER TABLE public.project_members DROP CONSTRAINT project_members_role_check;

ALTER TABLE public.project_members ADD CONSTRAINT project_members_role_check
  CHECK (role = ANY (ARRAY[
    'pm','manager','analyst','architect','developer',
    'implementer','installer','launch_lead'
  ]::text[]));
