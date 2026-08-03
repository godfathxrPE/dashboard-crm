-- ═══════════════════════════════════════════════════════
-- 102 — S-INN-1: юридические реквизиты компании + уникальность ИНН в организации.
--
-- ЗАЧЕМ. ИНН в карточке компании уже есть (224 из 260 записей заполнены), но он
-- лежит как строка без последствий: КПП, ОГРН, юрадрес и юрназвание менеджер
-- переносит из ЕГРЮЛ руками в заметки — и они расходятся с реальностью в тот же
-- день. Плюс ничто не мешает завести вторую карточку той же компании с тем же ИНН.
-- Здесь — схема под автозаполнение из ЕГРЮЛ (Edge Function `company-lookup` → DaData)
-- и запрет на дубль по ИНН внутри организации.
--
-- ЧТО ЗДЕСЬ. Шесть колонок на `companies` и один partial unique index.
--
-- ⚠️ `legal_name` — ОТДЕЛЬНАЯ КОЛОНКА, А НЕ ПЕРЕЗАПИСЬ `name`. ИНВАРИАНТ ВСЕЙ ФИЧИ.
--    `name` — рабочее имя, которым компанию зовут в переписке и в воронке («Ориент»);
--    `legal_name` — то, что выдаёт ЕГРЮЛ («ООО "ОРИЕНТ-ПРО"»). Данные из ЕГРЮЛ не
--    имеют права затирать `name`: списки, поиск и вся память менеджера держатся на
--    рабочем имени. По той же причине юрадрес идёт в `legal_address`, а фактический
--    `address` остаётся нетронутым — это разные адреса, а не две версии одного.
--
-- ⚠️ ФОРМАТ ИНН БАЗА НАМЕРЕННО НЕ ПРОВЕРЯЕТ — НИ CHECK, НИ ТРИГГЕРА.
--    В проде живут 4 записи с ИНН не по формату `\d{10}|\d{12}`:
--      «Контрагент» (inn = 'ИНН'), ООО "АЛТ МАСТЕР" ('ELEC206'), СМЕГ РУССИЯ
--      ('ELEC204'), ООО АФ Транс Бел ('192944106' — 9 цифр, белорусский УНП).
--    CHECK на формат сделал бы эти карточки нередактируемыми целиком: менеджер не смог
--    бы поправить телефон, пока не разберётся с чужим ИНН. Формат добивает валидатор на
--    клиенте (`src/lib/validators/company.ts`) — он не пускает НОВЫЙ мусор, но не
--    блокирует UPDATE несвязанных полей у legacy-строк. Чистка этих четырёх — решение
--    человека, не миграции.
--
-- ⚠️ PARTIAL UNIQUE `uq_companies_org_inn` — предикат обязателен.
--    `where inn is not null and inn <> ''` покрывает ОБА варианта «ИНН не указан»:
--    в проде встречаются и NULL, и пустая строка, а пустая строка от NULL для unique
--    отличается — без предиката второй же компанией с `inn = ''` был бы конфликт.
--    Полагаться на NULLS DISTINCT (дефолт PG 17) как на единственную защиту нельзя:
--    у `NULLS NOT DISTINCT` поведение ровно обратное — грабля 085.
--    Дублей `(org_id, inn)` в проде 0 (сверено на живой БД) — индекс ложится чисто.
--    Уникальность именно `(org_id, inn)`, а не глобальная: одна и та же компания
--    может вести дела с двумя организациями CRM, и это не дубль.
--
-- ⚠️ `inn_status` — TEXT БЕЗ ENUM. Значения приходят от внешнего реестра
--    (ACTIVE | LIQUIDATING | LIQUIDATED | REORGANIZING | BANKRUPT), их словарь
--    принадлежит не нам: новое значение от провайдера не должно ронять сохранение
--    формы 22P02-ошибкой. Смысл поля читает UI (не-ACTIVE → жёлтый бейдж).
--
-- RLS не трогаем: колонки в уже защищённой таблице, новых политик не нужно.
-- Гранты не трогаем: `authenticated` уже имеет arwd на `companies`, привилегии в
-- Postgres выдаются на таблицу, а не на колонку.
--
-- Применяет гейт (apply → gen-types → advisors → ролевые смоки).
--
-- Откат:
--   drop index if exists public.uq_companies_org_inn;
--   alter table public.companies
--     drop column if exists kpp,
--     drop column if exists ogrn,
--     drop column if exists legal_name,
--     drop column if exists legal_address,
--     drop column if exists inn_status,
--     drop column if exists inn_verified_at;
-- ═══════════════════════════════════════════════════════

alter table public.companies
  add column if not exists kpp             text,
  add column if not exists ogrn            text,
  add column if not exists legal_name      text,
  add column if not exists legal_address   text,
  add column if not exists inn_status      text,
  add column if not exists inn_verified_at timestamptz;

comment on column public.companies.kpp is
  'S-INN-1 (102): КПП из ЕГРЮЛ. Заполняется автозаполнением по ИНН или руками.';
comment on column public.companies.ogrn is
  'S-INN-1 (102): ОГРН/ОГРНИП из ЕГРЮЛ.';
comment on column public.companies.legal_name is
  'S-INN-1 (102): полное юридическое название с ОПФ («ООО "ОРИЕНТ-ПРО"»). НЕ затирает companies.name — рабочее имя компании живёт отдельно, это инвариант фичи.';
comment on column public.companies.legal_address is
  'S-INN-1 (102): юридический адрес из ЕГРЮЛ. Отдельно от companies.address — фактический адрес не перезаписывается данными реестра.';
comment on column public.companies.inn_status is
  'S-INN-1 (102): статус юрлица из ЕГРЮЛ (ACTIVE | LIQUIDATING | LIQUIDATED | REORGANIZING | BANKRUPT). TEXT без enum: словарь принадлежит внешнему реестру. Не-ACTIVE — риск-сигнал для пресейла, UI показывает жёлтым.';
comment on column public.companies.inn_verified_at is
  'S-INN-1 (102): когда реквизиты в последний раз подтянуты из ЕГРЮЛ. UI показывает «сверено с ЕГРЮЛ <дата>». NULL — данные введены руками и не сверялись.';

-- Один ИНН — одна карточка компании в организации.
create unique index if not exists uq_companies_org_inn
  on public.companies (org_id, inn)
  where inn is not null and inn <> '';
