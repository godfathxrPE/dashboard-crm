-- ═══════════════════════════════════════════════════════
-- 130 — pipeline_expected_roles: ОЖИДАЕМЫЕ роли контура сделки по воронке
-- (S-DEAL-ROLES-1, виджет W10 спеки deal-v2).
--
-- Сегодня карта стейкхолдеров — плоский список: кого добавили, тех и видно. Список
-- отвечает на вопрос «кто есть», а работа пресейла — это «кого НЕ хватает»: сделка
-- с одним контактом рушится, когда контакт уходит в отпуск. Отсюда слоты: пустой
-- слот ЛПР сам является сообщением.
--
-- ⚠️ Это НЕ словарь ролей. Словарь — CHECK `deal_stakeholders_role_chk` (092), семь
-- значений после блока ниже. Здесь описывается ОЖИДАНИЕ ролей в конкретной воронке —
-- другая сущность с похожим именем. Совпадение «оба про роли» не повод их слить:
-- одна таблица отвечает «кто есть», другая — «кого ждём».
--
-- ⚠️ Таблица, а не колонка в `pipelines`. `pipelines`/`pipeline_stages` — ГЛОБАЛЬНЫЕ
-- словари, не org-scoped (см. docs/schema.md); org-специфичный атрибут заводится
-- отдельной таблицей `(org_id, …)` — ровно как `stage_requirements` (027).
--
-- ⚠️ «Основной контакт» из спеки сюда НЕ кладётся. Primary — это `projects.contact_id`,
-- он вычисляется (092), и строка `role = 'primary'` здесь была бы вторым источником
-- истины поверх него. Урок `companies.phone` ↔ `phones[]`: инвариант, который держит
-- только клиент, не держится. В UI primary — виртуальный слот, всегда первый.
--
-- ⚠️ Воронка без строк = ПРЕЖНЕЕ поведение (плоский список, сигнал `single_threaded`
-- по количеству). Это не заглушка, а требование обратной совместимости: delivery-
-- воронки и любые новые не должны молча получить пустые слоты и красный сигнал.
--
-- FK на `pipelines` ОСТАВЛЕН (в отличие от 078, где FK у `stage_transitions` на
-- `pipeline_stages` сняли): там запись ИСТОРИЧЕСКАЯ, и CASCADE при пересборке
-- словаря вынес бы историю переходов по всем org. Здесь запись КОНФИГУРАЦИОННАЯ —
-- потеря настройки при пересборке воронки меньшее зло, чем висячая ссылка.
--
-- Realtime НЕ включаем: настройка организации меняется раз в месяцы, у хука
-- staleTime 5 минут. Публикация добавила бы трафик и ноль сведений.
--
-- Бэкфилла нет: до этой миграции ожидаемых ролей не существовало. Сид ниже — не
-- бэкфилл, а стартовый состав контура для дефолтной org.
--
-- ⚠️ Эта же миграция РАСШИРЯЕТ СЛОВАРЬ РОЛЕЙ седьмым значением `influencer` (ЛВР) —
-- см. блок «Словарь ролей» ниже. Отдельной миграции нет намеренно: 130 ещё не
-- применена, и разносить по двум файлам изменение, которое иначе на гейте пришлось
-- бы применять строго по порядку, значит завести порядок там, где его можно не
-- заводить.
--
-- ⚠️ НЕ применена — применяет гейт (apply → gen-types → advisors → ролевые смоки).
--
-- Откат:
--   drop table public.pipeline_expected_roles cascade;
--   -- и возврат обоих CHECK к шести значениям — но только если строк с
--   -- `influencer` ещё нет: иначе `add constraint` упадёт на валидации.
-- ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- Словарь ролей: седьмое значение `influencer` — ЛВР, лицо, влияющее на решение
--
-- Причина доменная, не «для полноты»: в пресейле общение чаще идёт с ЛВР, и через
-- него выходят на ЛПР. `champion` для этого не годится — он про АКТИВНУЮ поддержку
-- внутри («продаёт за нас»), а ЛВР влияет ПО ДОЛЖНОСТИ и может быть нейтрален.
-- Записывать такого человека чемпионом значит завышать оценку сделки: карта
-- показывала бы союзника там, где его нет.
--
-- ⚠️ Точек синхронизации словаря ТРИ CHECK'а и один набор констант:
--   1. `deal_stakeholders_role_chk`      (092) — роль участника сделки;
--   2. `leads_decision_role_check`       (123) — роль контакта лида; дословное
--      зеркало первого, потому что `convert_lead` переносит значение в
--      `deal_stakeholders`, и расхождение уронило бы КОНВЕРСИЮ ошибкой 23514;
--   3. `pipeline_expected_roles_role_chk` (130, ниже) — ожидаемая роль контура;
--   4. код: `STAKEHOLDER_ROLES` (`src/types/database.ts`), `STAKEHOLDER_ROLE_ORDER` /
--      `STAKEHOLDER_ROLE_CONFIG` (`src/lib/constants/stakeholders.ts`),
--      `src/lib/validators/stakeholder.ts`.
-- Все четыре меняются ОДНИМ заходом. Пункт 2 — не теория: селект «Роль контакта» в
-- `LeadModal` строится из `STAKEHOLDER_ROLE_ORDER`, так что новое значение становится
-- выбираемым у лида в тот же момент, что и у сделки.
--
-- Данные не трогаются: набор только РАСШИРЯЕТСЯ, все прежние значения остаются
-- валидными, существующие строки перевалидируются без изменений. `NOT VALID` не
-- нужен — расширяющий CHECK проходит по любой строке, которая проходила прежний.
-- ═══════════════════════════════════════════════════════

-- Порядок и форма — из 092: `role is null` первым дизъюнктом (NULL = «роль ещё не
-- понята», легальное состояние, а не пропуск).
alter table public.deal_stakeholders
  drop constraint if exists deal_stakeholders_role_chk;

alter table public.deal_stakeholders
  add constraint deal_stakeholders_role_chk check (
    role is null or role in
      ('decision_maker','influencer','economic_buyer','champion','expert','end_user','blocker')
  );

-- Форма — из 123 (`= any (array[…])`, а не `in`): сохранена дословно, чтобы диффом
-- было видно ровно добавленное значение, а не переписанное ограничение.
alter table public.leads
  drop constraint if exists leads_decision_role_check;

alter table public.leads
  add constraint leads_decision_role_check check (
    decision_role is null or decision_role = any (array[
      'decision_maker','influencer','economic_buyer','champion','expert','end_user','blocker'
    ])
  );

create table if not exists public.pipeline_expected_roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  -- Роль из ТОГО ЖЕ набора, что `deal_stakeholders.role`.
  role        text not null,
  -- Пустой слот ОБЯЗАТЕЛЬНОЙ роли поднимает сигнал `single_threaded`; необязательной —
  -- просто рисуется пунктиром в виджете.
  is_required boolean not null default false,
  -- Пояснение под названием слота («кто подтвердит интеграцию») — подпись В ВИДЖЕТЕ.
  -- В сигнал здоровья НЕ уходит: текст сигнала строится из словаря ролей
  -- (STAKEHOLDER_ROLE_CONFIG), иначе формулировка риска менялась бы из настроек org.
  -- Формулировать всё равно от лица риска, не от лица поля.
  hint        text,
  -- Порядок слотов в виджете. smallint: слотов в воронке единицы, не тысячи.
  sort_order  smallint not null default 0,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- ⚠️ ЗЕРКАЛО `deal_stakeholders_role_chk` (092) и `leads_decision_role_check` (123).
  -- Сослаться на чужой CHECK нельзя, а расхождение даст 23514 уже на сиде. Точек
  -- синхронизации ТРИ (эти два CHECK'а и вот этот) плюс константы в коде:
  -- `STAKEHOLDER_ROLES` / `STAKEHOLDER_ROLE_ORDER` / `STAKEHOLDER_ROLE_CONFIG`
  -- и `src/lib/validators/stakeholder.ts`. Все меняются ОДНИМ заходом —
  -- см. блок «Словарь ролей» в шапке файла.
  constraint pipeline_expected_roles_role_chk
    check (role in
      ('decision_maker','influencer','economic_buyer','champion','expert','end_user','blocker')),
  -- Одна и та же роль не ожидается дважды: два слота «ЛПР» в виджете — не
  -- «два ЛПР», а сломанный счётчик «N из M».
  constraint pipeline_expected_roles_uniq unique (org_id, pipeline_id, role)
);

-- Рабочий запрос ровно один — «ожидания этой воронки» (org сужает RLS).
create index if not exists pipeline_expected_roles_org_pipeline_idx
  on public.pipeline_expected_roles (org_id, pipeline_id);

-- ═══ Триггеры ═══
-- `trg_set_org_id` НЕ вешается — паттерн `stage_requirements` (027): org_id приходит
-- ЯВНО из UI настроек организации.
-- Заморозка org_id — руками: автоцикл 054 покрыл только таблицы, существовавшие на
-- его момент. Префикс `aa_` не косметика — порядок триггеров алфавитный.
drop trigger if exists trg_aa_freeze_org_id on public.pipeline_expected_roles;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.pipeline_expected_roles
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

-- Имя функции именно `update_updated_at` (`set_updated_at` в схеме НЕТ).
drop trigger if exists trg_set_updated_at on public.pipeline_expected_roles;
create trigger trg_set_updated_at
  before update on public.pipeline_expected_roles
  for each row execute function public.update_updated_at();

-- ═══ RLS ═══
-- SELECT — все члены org: слоты видит каждый, кто видит сделку, иначе виджет
-- у manager/viewer рисовал бы пустоту вместо контура.
-- CUD — только owner/admin. Уже, чем у `deal_stakeholders` (092), где пишет и
-- manager, НАМЕРЕННО: там manager правит УЧАСТНИКОВ своей сделки, здесь —
-- НАСТРОЙКУ воронки, общую для всей организации.
-- current_org_*() строго в обёртке ( select … ) — initplan, иначе функция считается
-- построчно (advisor WARN). Раздельные политики на операцию, не FOR ALL (урок 036b).
alter table public.pipeline_expected_roles enable row level security;

drop policy if exists pipeline_expected_roles_select on public.pipeline_expected_roles;
create policy pipeline_expected_roles_select on public.pipeline_expected_roles
  for select to authenticated
  using ( org_id = ( select public.current_org_id() ) );

drop policy if exists pipeline_expected_roles_insert on public.pipeline_expected_roles;
create policy pipeline_expected_roles_insert on public.pipeline_expected_roles
  for insert to authenticated
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  );

-- WITH CHECK повторяет USING — урок 054: без него строку можно перенести в чужую org
-- (org_id прикрыт ещё и trg_aa_freeze_org_id).
drop policy if exists pipeline_expected_roles_update on public.pipeline_expected_roles;
create policy pipeline_expected_roles_update on public.pipeline_expected_roles
  for update to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  )
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  );

drop policy if exists pipeline_expected_roles_delete on public.pipeline_expected_roles;
create policy pipeline_expected_roles_delete on public.pipeline_expected_roles
  for delete to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  );

-- ═══ Гранты ═══
-- `revoke truncate, references, trigger` НЕ пишем: 082 сузил дефолтные привилегии
-- postgres в public в корне. `revoke … from anon` остаётся: default ACL роли
-- supabase_admin всё ещё раздаёт anon полный набор.
revoke all on public.pipeline_expected_roles from anon;

grant select, insert, update, delete on public.pipeline_expected_roles to authenticated;  -- поверх RLS

-- ═══ Сид (идемпотентный, best-effort — паттерн 027) ═══
-- ⚠️ Воронки матчатся по `entity_type = 'deal'` + `direction`, НЕ по имени. Имена
-- воронок правятся из UI, а delivery-воронки уже пересобирались в 035 («ERP
-- Внедрение» / «IIoT Внедрение») — якорь на имя разъехался бы молча и посадил бы
-- слоты на воронку внедрения. Воронка не нашлась — пропуск, не ошибка.
--
-- Ожидаемые имена на момент 130: «IIoT Продажи» / «ERP Продажи» — только как
-- ориентир для чтения, в условии их нет.
--
-- Состав IIoT — из спеки W10 (ЛПР + технический эксперт).
--
-- Состав ERP — ПРЕДПОЛОЖЕНИЕ (спека описывает только IIoT), подтверждается владельцем:
-- ЛПР + ЛВР. `economic_buyer` в сид НЕ кладётся намеренно — держатель бюджета в
-- ERP-сделках это тендерная комиссия или ГД, до которых доходят редко, и слот стоял бы
-- вечно пустым. Вечно пустой слот перестают читать, а вместе с ним перестают читать
-- и соседние: пустота обязана означать «здесь дыра», а не «так всегда».
--
-- created_by останется NULL: миграция идёт не от лица пользователя, auth.uid() пуст.
do $seed$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then
    return;
  end if;

  insert into public.pipeline_expected_roles (org_id, pipeline_id, role, is_required, hint, sort_order)
  select v_org, p.id, s.role, s.is_required, s.hint, s.sort_order
  from public.pipelines p
  join (values
    -- direction, role, is_required, hint, sort_order
    ('iiot', 'decision_maker', true,  'ЛПР не в контуре — ключевой риск стадии', 1::smallint),
    ('iiot', 'expert',         false, 'кто подтвердит интеграцию',               2::smallint),
    ('erp',  'decision_maker', true,  'ЛПР не в контуре — ключевой риск стадии', 1::smallint),
    ('erp',  'influencer',     false, 'с кем идёт работа сейчас',                2::smallint)
  ) as s(direction, role, is_required, hint, sort_order)
    on s.direction = p.direction::text
  where p.entity_type = 'deal'
  on conflict (org_id, pipeline_id, role) do nothing;
end;
$seed$;

comment on table public.pipeline_expected_roles is
  'S-DEAL-ROLES-1 (130): ожидаемые роли контура сделки по воронке. Одна строка = '
  '«в этой воронке ждём человека с такой ролью». Не словарь ролей (он — CHECK '
  'deal_stakeholders_role_chk, 092) и не список участников (deal_stakeholders): '
  'здесь ОЖИДАНИЕ, пустой слот которого сам является сообщением. Основной контакт '
  'сюда не кладётся — он вычисляется из projects.contact_id (виртуальный слот в UI). '
  'Воронка без строк = прежнее поведение (плоский список, сигнал по количеству).';

comment on column public.pipeline_expected_roles.role is
  'Зеркало набора deal_stakeholders_role_chk (092). Меняется ВМЕСТЕ с ним и с '
  'зеркалами в src/lib/constants/stakeholders.ts и src/lib/validators/stakeholder.ts.';

comment on column public.pipeline_expected_roles.is_required is
  'Пустой слот обязательной роли поднимает сигнал single_threaded (warn) — '
  'необязательной не поднимает ничего, только рисуется пунктиром.';

comment on column public.pipeline_expected_roles.hint is
  'Пояснение под названием слота — подпись В ВИДЖЕТЕ. В сигнал здоровья НЕ уходит: '
  'текст single_threaded строится из словаря ролей (STAKEHOLDER_ROLE_CONFIG), иначе '
  'формулировка риска менялась бы из настроек организации. Формулировать всё равно '
  'от лица риска («ЛПР не в контуре — ключевой риск стадии»), не от лица поля.';
