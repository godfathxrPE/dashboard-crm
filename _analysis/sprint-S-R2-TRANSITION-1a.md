# S-R2-TRANSITION-1a — фундамент переходов стадии: гейт видит патч + история стадий + единый вход

**Ветка:** `feat/r2-transition-core` от `main` (после мержа `feat/r2-segments`).
Миграция **078**. Один коммит.

**UI не меняется вообще.** Это подготовка: чинится блокер в БД, заводится история
переходов, все write-path'ы стадии сводятся к одному сервису. Модалка — следующий спринт
(`S-R2-TRANSITION-1b`).

**Трудоёмкость: ~8–11 ч. Риск средний** (правится DEFINER-функция гейта и добавляется
триггер на `projects` — то есть горячий путь всех сделок).

Разделено на 1a/1b по той же логике, что `S-GANTT-DEPTYPES` выделяли из `POLISH`: миграция
гейта + история + обход шести write-path'ов + TS-зеркало условий по трудоёмкости равны
модалке целиком, и мешать их в один диф — гарантированные конфликты и нереверсируемый спринт.

---

## Два факта из ревью, из которых растёт весь спринт

**F1. Гейт стадии читает pre-update строку.** `aa_enforce_stage_gate` — BEFORE UPDATE на
`projects`; внутри `check_stage_requirements(p_project_id, p_target_stage_id)` делает
`SELECT * INTO v_project FROM public.projects WHERE id = p_project_id`, то есть **старые**
значения. Следствие: `update({ stage_id: B, budget: 100 })` одним запросом упадёт, если гейт
стадии B требует `budget`, — хотя патч его закрывает. Без этого фикса модалка с During-полями
физически не работает.

**F2. История смен стадий не пишется с 047.** ✅ **Подтверждено по живой БД 2026-07-26**
(Грок ставил «plausible» — вопрос закрыт). Полный список триггеров на `projects` в проде:
`set_updated_at`, `trg_aa_enforce_stage_gate`, `trg_aa_freeze_org_id`, `trg_log_delete_projects`,
`trg_notify_deal_won`, `trg_notify_project_assigned`, `trg_set_org_id`,
`trg_sync_deal_stage_fields`, `trg_sync_project_stage`, `trg_zz_delivery_completion_gate`,
`trg_zz_run_automations`, `trg_zz_seed_columns`. **Ни один не пишет историю стадий.**
`on_stage_change` / `log_stage_change` живут только в `baseline.sql` — 047 снял их вместе с
legacy `projects.stage`, и в проде их нет.

`stage_entered_at` хранит только текущее значение (его выставляет `sync_project_stage`).
Значит аналитика воронки — конверсия стадий, median dwell — задним числом не считается
вообще: данные надо начинать копить сейчас, а не в P2.

---

## РАЗВЕДКА — выполнить целиком до первой правки

```bash
git branch --show-current                       # feat/r2-transition-core
git status --short && ls supabase/migrations/ | tail -3    # ожидание: последняя 077 → берём 078

# гейт: как есть в ЖИВОЙ БД, не в baseline-файле
# (MCP: execute_sql → select pg_get_functiondef('public.check_stage_requirements'::regproc))
grep -n "check_stage_requirements" supabase/migrations/20260712230000_baseline.sql | head
grep -n "aa_enforce_stage_gate" supabase/migrations/20260712230000_baseline.sql | head

# есть ли ЛЮБОЙ триггер на projects.stage_id в живой БД
# MCP: select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.projects'::regclass and not tgisinternal;

# все write-path'ы стадии
grep -rn "moveToStageId" src/ | grep -v "use-projects.ts"
grep -rn "stage_id:" src/components src/lib/hooks --include=*.tsx --include=*.ts | grep -v "eq(\|find(\|filter\|=== \|?\." 
grep -n "useMoveProject" src/lib/hooks/use-projects.ts
grep -n "onStageClick" src/components/projects/*.tsx
sed -n '440,460p;540,565p' src/components/projects/ProjectDetail.tsx     # «Вернуть в работу» + lost-кнопки

# условия автоматизаций: SQL-эталон для TS-зеркала
sed -n '40,70p' supabase/migrations/050_workflow_engine.sql
ls tests/unit/ | head
npx tsc --noEmit && echo TSC_OK
```

**STOP-условия:**

1. В живой БД **уже есть** триггер на `stage_id`, пишущий историю → F2 неверна, доложить.
2. `check_stage_requirements` в живой БД отличается от baseline (кто-то правил через MCP) →
   взять живую версию за основу и сказать об этом в отчёте **до** правок.
3. Найден write-path стадии, которого нет в списке ниже → дописать в список и доложить,
   не «починить молча».
4. Последняя миграция не 077 / `tsc` красный.

---

## Миграция `078_stage_transition_core.sql`

### 1. Гейт: версия, принимающая строку-кандидата

**Не** добавлять третий параметр с DEFAULT к существующей функции: вызов с двумя
аргументами станет неоднозначным между 2-арной и 3-арной версиями → `function is not
unique`. **Не** дропать 2-арную: у неё именные гранты (`authenticated`, `service_role`) и её
зовёт клиент через RPC (`use-stage-gate.ts`) — drop потребует переGRANTа и ломает
обратную совместимость на время apply.

Правильно — **новая функция + существующая как тонкий делегат**:

```sql
create or replace function public.check_stage_requirements_row(
  p_project_id uuid, p_target_stage_id uuid, p_row jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$ ... $$;

create or replace function public.check_stage_requirements(
  p_project_id uuid, p_target_stage_id uuid
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$ select public.check_stage_requirements_row($1, $2, null::jsonb) $$;
```

Тело `_row`: **байт-в-байт логика существующей функции**, кроме field-проверок:

- `p_row is null` → читать из БД, как сейчас (полная обратная совместимость: RPC-превью и
  любой сторонний вызов ведут себя как раньше).
- `p_row is not null` → field-проверки идут по нему, с сохранением ровно той же семантики:
  `budget` / `company_id` / `contact_id` / `deadline` / `probability` / `direction` /
  `next_action_date` → `p_row->>'col' is not null`; `next_step` → дополнительно
  `btrim(coalesce(p_row->>'next_step','')) <> ''`.
- **Список поддерживаемых колонок и ветка «неподдерживаемая колонка» (`v_ok IS NULL` →
  unmet с суффиксом в hint) сохраняются полностью.** Разъезд списков между двумя ветками —
  главный риск этой миграции; в теле держать один `CASE`, а не два.
- `file`-требования в обеих ветках читают `project_files` из БД: файлы в том же UPDATE не
  приходят, это корректно.
- Гард `auth.uid() IS NOT NULL AND NOT is_org_member(...)` → **42501** сохраняется.

ACL: `_row` — триггерная, не RPC → `revoke all from public, anon, authenticated`,
`grant execute to service_role` (паттерн 056b). 2-арная сохраняет свои гранты.

**Имя нового триггера — `trg_zy_log_stage_transition`** (проверено: порядок триггеров
алфавитный, `zy` < `zz_run_automations` → история пишется до автоматизаций, после
BEFORE-гейта `trg_aa_*`).

`aa_enforce_stage_gate` — `create or replace`, единственное изменение:
`v_unmet := public.check_stage_requirements_row(NEW.id, NEW.stage_id, to_jsonb(NEW));`

### 2. `stage_transitions` + триггер

```sql
create table if not exists public.stage_transitions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages(id) on delete set null,
  to_stage_id   uuid not null references public.pipeline_stages(id) on delete set null,
  changed_by    uuid references public.profiles(id) on delete set null,
  changed_at    timestamptz not null default now()
);
create index if not exists idx_stage_tr_project_at on public.stage_transitions (project_id, changed_at desc);
create index if not exists idx_stage_tr_org_at     on public.stage_transitions (org_id, changed_at desc);
create index if not exists idx_stage_tr_to_stage   on public.stage_transitions (org_id, to_stage_id, changed_at desc);
```

Триггер — **`AFTER UPDATE OF stage_id ON projects`**, DEFINER,
`set search_path = public, pg_temp`, `WHEN (new.stage_id is distinct from old.stage_id)`.
Пишет `org_id = new.org_id`, `changed_by = auth.uid()` (в cron/service-контексте NULL —
это норма, колонка nullable). Имя триггера — с префиксом, который **не** попадёт между
`trg_aa_*` (BEFORE-гейт) и `trg_zz_run_automations` (AFTER-автоматизации): назвать
`trg_zy_log_stage_transition`, чтобы порядок был предсказуем и история писалась до
автоматизаций.

⚠️ **Триггер не должен ронять UPDATE.** Обернуть тело в `exception when others then return
new;` — по образцу I5 (automation никогда не блокирует UPDATE). Гейт блокирует, аудит — нет.

RLS и гранты (урок 075 — дефолтные привилегии дают `authenticated` всё):

```sql
alter table public.stage_transitions enable row level security;
create policy stage_tr_select on public.stage_transitions
  for select using (org_id = ( select public.current_org_id() ));
-- INSERT/UPDATE/DELETE-политик НЕТ: пишет только триггер под DEFINER
revoke all on public.stage_transitions from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.stage_transitions from authenticated;
grant select on public.stage_transitions to authenticated;
```

**Бэкфилл невозможен** — истории нет ни в одном источнике. Записать это в шапку миграции:
данные копятся с даты apply, аналитика P2 считается только по периоду после неё.

### 3. Что в миграцию НЕ входит

Никаких `stage_playbooks`, `stage_dwell_overrides`, RPC `transition_project_stage` (это P4),
поля `source` в истории (см. ниже про метрику).

---

## Клиентская часть

### 1. Единый домен-сервис

`src/lib/domain/stage-transition.ts`:

```ts
export type TransitionInput = {
  projectId: string;
  fromStageId: string | null;
  toStageId: string;
  fieldPatches?: Partial<Pick<Project,
    'budget' | 'company_id' | 'contact_id' | 'next_step' | 'next_action_date' | 'deadline'
    | 'probability' | 'direction' | 'pinned_note'
    | 'won_reason' | 'won_detail' | 'loss_reason' | 'loss_detail'>>;
  comment?: string;
};
```

`commitTransition(input)` — **один** `projects.update({ stage_id, ...fieldPatches })`
(атомарность: гейт теперь видит патч, двухшаговая запись запрещена) + опциональная запись
комментария в `activity_log` через существующий `logActivity`.

В 1a сервис **не меняет поведение**: все текущие вызовы переводятся на него с пустым
`fieldPatches`. Разбор ошибки гейта остаётся существующим `parseStageGateError`.

### 2. Перевести на сервис все write-path'ы (полный список из разведки)

| Путь | Файл | Замечание |
|------|------|-----------|
| Kanban drag на чип стадии | `PipelineBoard.tsx` (~479) | через `moveToStageId` |
| Drop на фазовую колонку | `PipelineBoard.tsx` (~521) | там же |
| «Следующая стадия» | `PipelineBoard.tsx` (~543) | там же |
| Возврат на первую стадию | `PipelineBoard.tsx` (~552) | там же |
| `onStageClick` (полоса/чеврон) | `StackedPipeline.tsx` / `DealProgressBar.tsx` → родитель | стадия пишется в родителе |
| «Вернуть в работу» | `ProjectDetail.tsx` (~448) | + сброс `loss_*`/`won_*` — это patch, не только стадия |
| Пометить проигранной | `ProjectDetail.tsx` (~555) | `stage_id` + `loss_reason` одним mutate |
| Пометить выигранной | `ProjectDetail.tsx` (~494 `wonReasons`) | тот же паттерн |
| `ProjectModal` (правка сделки) | `ProjectModal.tsx` | **решение:** для `type=client` поле стадии в форме сделать read-only с подсказкой «стадия меняется на воронке»; менять её из общей формы — путь, который потом обойдёт модалку |
| Delivery/internal доски | `StageBoard.tsx`, `DeliveryPipelineBoard.tsx` | **тоже зовут `moveToStageId`** (W1 ревью). Сервис под хуком их покрывает автоматически; модалка (1b) на них **не** распространяется — это фазы, не воронка |

⚠️ **Acceptance-grep не должен считать delivery-пути нарушением** (W1 ревью): в 1a они
легально ходят через тот же сервис. Критерий формулировать как «прямых
`.update({stage_id})` вне сервиса нет», а не «строки `stage_id:` отсутствуют в компонентах».

⚠️ **Засада на смене стадии — два пересекающихся триггера.** `trg_sync_deal_stage_fields`
(BEFORE UPDATE OF stage_id) перезаписывает `probability` значением из стадии и ставит
`status`/`actual_close_date`; `trg_sync_project_stage` (BEFORE INSERT OR UPDATE) ставит
`stage_entered_at`, `status` и **безусловно обнуляет `actual_close_date`** для не-won/lost
стадий. Порядок алфавитный → `sync_project_stage` выигрывает конфликты. Отсюда правило для
сервиса и модалки: **`status`, `probability`, `actual_close_date` в патч перехода не
включать никогда** — их выставляет БД, и любой клиентский дубль либо будет затёрт, либо
затрёт логику стадии. Само расхождение двух триггеров — отдельный хвост на потом, в этом
спринте его не чиним.

`useMoveProject().moveToStageId` остаётся, но внутри зовёт сервис — так все четыре точки
`PipelineBoard` покрываются одной правкой.

**Существующее поведение сохраняется дословно:** промпт «запланируй следующий шаг» после
драга, тосты, optimistic-rollback, `parseStageGateError` в обоих местах. Спринт обязан быть
незаметен пользователю.

### 3. TS-зеркало условий автоматизаций

`src/lib/domain/wf-conditions.ts` — порт `wf_eval_conditions` (050, L42–70) на TS:
AND-предикаты против снапшота строки. Нужен для preview в 1b, но пишется здесь, вместе с
**golden-тестами**: `tests/unit/wf-conditions.test.ts` — одни и те же фикстуры
(предикат + строка + ожидание), которые в отчёте прогоняются и через SQL
(`select public.wf_eval_conditions('...'::jsonb, '...'::jsonb)`). Разъезд двух реализаций —
зафиксированный риск (§13 архдока); фикстуры — единственная защита.

Порт обязан повторить и **защитное поведение SQL-версии**: `exception when others then` →
в TS `try/catch` с возвратом `false`, а не throw.

### 4. Метрика «% переходов через модалку» — как считаем

Поля `source` в истории **нет** осознанно: клиент не может атомарно проставить его через
`supabase-js` (`set_config` отдельным round-trip'ом не атомарен, а RPC — это P4).
Контракт измерения: модалка (спринт 1b) пишет `activity_log`-событие на каждый переход;
доля = события / строки `stage_transitions` за период (сопоставление по `project_id` +
`changed_at` в пределах 5 с). Метрика приблизительная — так и записать в отчёт, не выдавать
за точную.

---

## VERIFY / коммит

```bash
npx tsc --noEmit                                     # 0
npx eslint src/lib src/components/projects           # 0 (scoped)
npx vitest run tests/unit/wf-conditions              # зелёный
npm test
grep -rn ": any" src/lib/domain                      # пусто
# ни один компонент не пишет stage_id напрямую, кроме сервиса:
grep -rn "stage_id:" src/components --include=*.tsx | grep -v "StageTransition\|read-only"
git --no-pager diff --stat
```

Миграцию **не применять.** Смоук на гейте Cowork — обязательно матрицей, это горячий путь:

1. Гейт с требованием `budget`: `update({stage_id, budget})` одним запросом **проходит**
   (было бы отклонено до фикса); `update({stage_id})` без бюджета — **отклоняется**
   с тем же unmet-списком, что раньше.
2. RPC-превью `check_stage_requirements(project, stage)` из клиента возвращает то же, что
   до миграции (2-арная версия не изменила контракт).
3. `file`-требование по-прежнему работает.
4. Переход стадии → появилась строка в `stage_transitions` с верным `changed_by`; автоматизация
   `stage_entered` при этом **сработала** (порядок триггеров не сломан).
5. Ролевые смоки: viewer/manager видят только свою org в `stage_transitions`, вставить руками
   не могут (нет политики) — `insert` → отказ.
6. `advisors` без новых WARN; повторный `apply` идемпотентен.

Коммит один:

```
feat(r2): гейт видит патч перехода, история стадий, единый вход смены стадии (R2-P0-A/1a)
```

**Не пушить.** В отчёте: живая версия `check_stage_requirements` до правки (отличалась ли от
baseline), полный список переведённых write-path'ов, результат каждого из 6 пунктов смоука,
и совпали ли golden-фикстуры TS против SQL.
