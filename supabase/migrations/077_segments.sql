-- 077: segments — серверные Smart Views (R2-P0-B).
-- Именованный предикат над сущностью CRM. Вычисляется КЛИЕНТОМ (src/lib/domain/segment-eval.ts)
-- поверх уже загруженного списка — таблица хранит только определение, не результат.
--
-- Границы v1 (осознанные, см. _analysis/review-CRM-ROADMAP-2-ARCHITECTURE.md):
--   • предикат — только AND (F5), без OR-групп;
--   • таблицы segment_user_state (pin/hide/last_used) нет (F11) — появится по запросу;
--   • импорта localStorage saved-views нет (F10): там {route,query}, здесь predicate AST.
--     `use-saved-views` / `SavedViewChips` продолжают работать параллельно и независимо.
--
-- Отклонения от исходного текста спринта (и почему):
--   1. owner_id: `on delete cascade`, НЕ `set null`. Со `set null` + инвариантом
--      «личный сегмент имеет владельца» удаление профиля роняло бы каскадный UPDATE
--      на CHECK-нарушении (referential action проверяется CHECK'ами). Cascade даёт
--      верную семантику: личные сегменты уходят с автором, общие — остаются.
--   2. Инвариант ужат до «is_shared ⇔ owner_id is null»: общий сегмент — конфиг
--      организации, у него нет персонального владельца (право правки даёт роль
--      owner/admin, а не авторство). Побочно это и есть условие п.1: у общих
--      сегментов нет FK-ссылки на профиль, которую пришлось бы гасить.
--      Следствие для UI: перевод личного сегмента в общий обязан в том же патче
--      обнулить owner_id (иначе WITH CHECK откажет).

create table if not exists public.segments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 80),
  entity      text not null check (entity in ('deals','deliveries','contacts','companies','tasks','leads')),
  -- {"version":1,"and":[{field,op,value?}, …]}. Схема полей/операторов — контракт клиента
  -- (src/types/database.ts + src/lib/constants/segments.ts); в БД держим только форму.
  predicate   jsonb not null default '{"version":1,"and":[]}'::jsonb
                check (jsonb_typeof(predicate -> 'and') = 'array'),
  is_shared   boolean not null default true,
  -- профиль-владелец ЛИЧНОГО сегмента; у общих — null (см. шапку, п.1/п.2)
  owner_id    uuid references public.profiles(id) on delete cascade,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint segments_owner_shape
    check ((is_shared and owner_id is null) or (not is_shared and owner_id is not null))
);

-- Уникальность имени — ДВА partial-индекса, а не один unique (org_id, entity, name):
-- иначе двое пользователей не заведут личный сегмент с одинаковым именем.
create unique index if not exists uq_segments_shared_name
  on public.segments (org_id, entity, name) where is_shared;
create unique index if not exists uq_segments_personal_name
  on public.segments (org_id, entity, owner_id, name) where not is_shared;
create index if not exists idx_segments_org_entity on public.segments (org_id, entity, sort_order);
create index if not exists idx_segments_owner on public.segments (owner_id) where not is_shared;

-- org_id приходит ЯВНО из UI (паттерн stage_requirements / invitations) — set_org_id НЕ вешаем.
-- Заморозка org_id — дословная копия автоцикла 054 (он покрывает только таблицы, что были
-- на момент 054; новые выписываются руками): имя trg_aa_freeze_org_id, узкий BEFORE UPDATE OF.
drop trigger if exists trg_aa_freeze_org_id on public.segments;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.segments
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

drop trigger if exists trg_set_updated_at on public.segments;
create trigger trg_set_updated_at before update on public.segments
  for each row execute function public.update_updated_at();

alter table public.segments enable row level security;

-- ═══ RLS ═══
-- Стиль обязателен: auth.uid() / current_org_*() строго в обёртке ( select … ) —
-- initplan-оптимизация, иначе функция вычисляется на каждую строку (advisor WARN).

-- SELECT: org-граница первым конъюнктом; личные сегменты видит только их владелец.
-- Owner/admin в чужие ЛИЧНЫЕ сегменты тоже не заглядывают — это персональные фильтры,
-- а не конфиг организации. Понадобится админский обзор — отдельным решением.
create policy segments_select on public.segments
  for select to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( is_shared or owner_id = ( select auth.uid() ) )
  );

-- INSERT: общий заводит owner/admin; личный — любой член org, но только на себя.
create policy segments_insert on public.segments
  for insert to authenticated
  with check (
    org_id = ( select public.current_org_id() )
    and (
      ( is_shared and ( select public.current_org_role() ) in ('owner','admin') )
      or ( not is_shared and owner_id = ( select auth.uid() ) )
    )
  );

-- UPDATE: один и тот же предикат в USING (старая строка) и WITH CHECK (новая) — паттерн 059.
-- Без WITH CHECK manager перекинул бы свой личный сегмент в общие.
create policy segments_update on public.segments
  for update to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and (
      ( is_shared and ( select public.current_org_role() ) in ('owner','admin') )
      or ( not is_shared and owner_id = ( select auth.uid() ) )
    )
  )
  with check (
    org_id = ( select public.current_org_id() )
    and (
      ( is_shared and ( select public.current_org_role() ) in ('owner','admin') )
      or ( not is_shared and owner_id = ( select auth.uid() ) )
    )
  );

create policy segments_delete on public.segments
  for delete to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and (
      ( is_shared and ( select public.current_org_role() ) in ('owner','admin') )
      or ( not is_shared and owner_id = ( select auth.uid() ) )
    )
  );

-- Урок 075: дефолтные привилегии Supabase уже дают authenticated ВСЁ на новую таблицу
-- в public — `grant` ничего не сужает, сужает только `revoke`. TRUNCATE/REFERENCES/TRIGGER
-- под RLS не ходят, поэтому снимаем их явно.
revoke all on public.segments from anon;
revoke truncate, references, trigger on public.segments from authenticated;
grant select, insert, update, delete on public.segments to authenticated;  -- поверх RLS

-- ═══ Сид: базовые общие сегменты сделок по всем существующим org ═══
-- Идемпотентно: конфликт по uq_segments_shared_name → do nothing (повторный apply безопасен).
-- Сегмент «Тихо >N дней» НЕ сидируем: last_touch считается на клиенте (useLastTouchMap),
-- в строке contacts его нет — это P1 (`contact_last_touch`).
insert into public.segments (org_id, name, entity, predicate, is_shared, sort_order)
select o.id, v.name, 'deals', v.predicate, true, v.sort_order
from public.organizations o
cross join (values
  ('Без next_step',
   '{"version":1,"and":[{"field":"status","op":"eq","value":"open"},{"field":"next_step","op":"is_null"}]}'::jsonb, 10),
  ('Без даты действия',
   '{"version":1,"and":[{"field":"status","op":"eq","value":"open"},{"field":"next_action_date","op":"is_null"}]}'::jsonb, 20),
  ('Просрочен next action',
   '{"version":1,"and":[{"field":"status","op":"eq","value":"open"},{"field":"next_action_date","op":"days_since_gt","value":0}]}'::jsonb, 30),
  ('ERP в работе',
   '{"version":1,"and":[{"field":"status","op":"eq","value":"open"},{"field":"direction","op":"eq","value":"erp"}]}'::jsonb, 40)
) as v(name, predicate, sort_order)
on conflict do nothing;

comment on table public.segments is
  'Smart Views: именованный AND-предикат над сущностью CRM (R2-P0-B). Вычисляется на клиенте '
  '(src/lib/domain/segment-eval.ts). is_shared=true — конфиг org (owner_id null, правит owner/admin); '
  'is_shared=false — личный фильтр автора (виден только ему).';
