# Ревью: handoff-delivery-p1 (P1 «Проекты» закрыт)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `71c613f`, `origin/main` @ `6d86d37`; crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/handoff-delivery-p1.md` — status handoff: «P1 закрыт + следующие шаги», **не** executable-спринт  
**Контекст:** Handoff датирован **2026-07-11**. С тех пор закрыты P2a/P2b/P3 delivery (036–038), Волна 2 (Gantt, win wizard, legacy-stage DROP 047, deps 048), workflow 050. Актуальная session-точка — `_analysis/handoff-session-2026-07-16.md` (тоже частично устарел post-S-DEPS-1).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Тип документа (status handoff, не CC-спринт) | ✅ |
| Исторические коммиты P1 `4c1f2ad` → `8706399` → `005bf20` | ✅ ancestors of `main` |
| Routing `/deals` ↔ `/projects` + `projectHref` + бэкстопы | ✅ |
| Модель 035: `type=delivery`, `parent_deal_id` RESTRICT, `delivery_kind`, do_*, progress_* | ✅ |
| `phase_group` 4 состояния + `delivery-phases.ts` | ✅ |
| ERP 8 / IIoT 7, все `is_won=false/is_lost=false` | ✅ |
| `useProjects(scope)` + `WonDeals` | ✅ |
| Урок `REVOKE … FROM anon` (035) | ✅ |
| Урок `user_role()` нет | ✅ (схема) |
| `database.ts` рукописный | ✅ (актуально с оговоркой re-export gen) |
| Миграция 035 «применена на прод» | ✅ (+ 036–048 поверх) |
| Ветка `feat/aura-theme` «локальная, не деплоена» | ❌ **устарело** |
| «P1 закрыт, следующий = P2 delivery» | ❌ **P2a/P2b/P3 уже в коде и проде** |
| `progress_done/total` «пока не считаются» | ❌ **считаются** (037 + триггер) |
| `spawn_delivery_project(p_deal_id, p_kind)` как полный контракт | 🟡 **v1**; сейчас +`p_template_id`/`p_owner_id` (036/044) |
| `null_internal_stage` «расширен на delivery» | 🟡 **исторически верно**; **DROP в 047** |
| «роли сейчас: только owner» | 🟡 **данные/момент**, не схема (CHECK: 4 роли) |
| «отложено: синк docs/schema.md» | ❌ **docs/schema обновлён** до 035–048 |
| Пригодность как точка входа «что делать дальше» / промпт в CC | ❌ **не использовать** |

**Оценка: 8.5/10** как **архивный снимок P1 на 2026-07-11**; **2/10** как актуальная точка входа на `main` @ `71c613f` (2026-07-16).  
**Рекомендация:** **не запускать в Claude Code.** Не править спринт «под P2» по этому handoff — P2/P3 уже сделаны. Для новых сессий: git log + `_analysis/handoff-session-2026-07-16.md` / roadmap; для решений P1 — секция «Ключевые решения» ниже остаётся валидной.

---

## Статус

| Заход | Статус в handoff | Статус в репо (факт) |
|-------|------------------|----------------------|
| B0 routing split | ✅ `4c1f2ad` | ✅ `refactor(nav): сделки → /deals…` — ancestor |
| P1 миграция+фича | ✅ `8706399`, 035 applied | ✅ `archive/035_delivery_projects.sql`; baseline+docs |
| P1 UX | ✅ `005bf20` | ✅ ancestor; `WonDeals` в `PipelineBoard`/`StageBoard` |
| Ручной прогон spawn→kanban→complete | ⏳ частично | ⏳ не верифицируется из git; UI-пути на месте |
| **P2 delivery** (фаза-доска, шаблоны, members, progress) | ⏳ «следующий шаг» | ❌ **закрыт:** P2a `079d98a`/`ab3d870` (036), P2b `b04ba3a`/`c4cef1f` (037), P3 `1481ead`/`b830121` (038) |
| Деплой `feat/aura-theme` | ⏳ «чем дольше, тем дороже» | ❌ tip `21e07cc` — **ancestor of `main`**; `main` на **74** коммита впереди; `origin/main` @ `6d86d37` (Gantt VIEW-2) |
| Синк `docs/schema.md` | ⏳ отложено | ❌ `docs/schema.md` знает 035–038 + 042–048 |
| Telegram S30 / Contact AI | ⏳ отложено | ✅ всё ещё backlog (`_analysis/BACKLOG.md`) |

---

## С чем согласен полностью

### 1. Коммиты и закрытие P1 (на момент handoff)

| Утверждение | Доказательство |
|-------------|----------------|
| `4c1f2ad` B0 routing | `refactor(nav): сделки → /deals, /projects освобождён…` |
| `8706399` P1 feature | `feat(delivery): P1 модуль «Проекты» внедрения…` |
| `005bf20` UX | `fix(delivery): won-сделки раскрываемым списком…` |
| Все три — в истории `main` | `git merge-base --is-ancestor` ✅ |

### 2. Routing-контракт — живой

- `src/lib/utils/project-href.ts`: client → `/deals/[id]`, иначе `/projects/[id]`
- `src/app/(dashboard)/deals/[id]/page.tsx:26`: non-client → redirect `/projects`
- `src/app/(dashboard)/projects/[id]/page.tsx:26`: client → redirect `/deals`
- `architecture.md` L19–24: `/deals` = сделки, `/projects` = delivery+internal

### 3. Модель данных 035

Совпадает с `docs/schema.md` / skill `schema.md` и `archive/035_delivery_projects.sql`:

- `type='delivery'`, `parent_deal_id` **ON DELETE RESTRICT**, `delivery_kind` launch|experiment  
- `do_url` / `do_external_id` / `do_synced_at`, `progress_done` / `progress_total`  
- CHECK `projects_delivery_status_chk` → status только `open`/`completed`  
- Reseed ERP …0004 (8 фаз, Обследование → `execution`) / IIoT …0003 (7, БИТ.MDT)  
- Все delivery-стадии `is_won=false, is_lost=false`  
- RPC `spawn_delivery_project` (org NULL-safe + ownership)

### 4. UI/константы P1

- `src/lib/constants/delivery-phases.ts` — `initiated/planning/execution/completed` + labels  
- Deal-слаги `attraction/working/approval/closing` живут отдельно (`Charts.tsx`, `StackedPipeline.tsx`, `FunnelWidget.tsx`) — не в `delivery-phases`  
- `useProjects('deals'|'projects')` — `use-projects.ts:128–129, 225–244`  
- `WonDeals.tsx` + использование в `PipelineBoard` / `StageBoard`  
- «Завершить проект» — кнопка в `ProjectDetail.tsx` (~359–367), не автопереход  
- `do_url` inline-edit в `ProjectDetail.tsx`

### 5. Уроки (learnings / миграции)

| Урок handoff | Факт |
|--------------|------|
| `REVOKE FROM public` ≠ снятие anon | `035`: комментарий + `REVOKE … FROM anon` (L128 archive) |
| `user_role()` нет; `memberships` + `current_org_id()` | skill schema: `user_role`/profiles.role удалены 024; roles в memberships |
| delivery `is_won/is_lost=false` иначе sync → `won` ломает chk | 035 seed + schema notes |
| `database.ts` рукописный | header: custom поверх re-export `supabase.gen.ts` |

### 6. Ключевые файлы handoff — существуют

`_analysis/architecture-delivery-projects.md`, `delivery-process-DO.md`, `sprint-delivery-projects-p1.md`, `review-sprint-delivery-projects-p1.md`, `sprint-delivery-p1-ux-fixes.md`, `docs/schema.md` — на месте. Плюс уже есть `sprint-delivery-p2a/b/p3` + reviews.

### 7. Прод ref

`uoiavcabxgdjugzryrmj` — совпадает с header skill/docs schema.

---

## Блокеры (критично — до использования как точки входа)

### B1. «Следующий шаг = P2 delivery» — полностью устарел

Handoff приоритет #2 описывает P2 как **будущую** работу:

- фазовая доска / `seed_project_columns` type-aware  
- `delivery_templates` / tasks, ERP+IIoT  
- `project_members` (manager/implementer/installer)  
- progress X/Y из задач  

**Факт в репо:**

| Элемент | Где |
|---------|-----|
| 036 phase board + templates | `archive/036_delivery_phase_board_templates.sql`, commits `079d98a`/`ab3d870` |
| 037 members + progress + `apply_delivery_template` | `archive/037_…`, `b04ba3a`/`c4cef1f` |
| 038 completion gate + milestones | `archive/038_…`, `1481ead`/`b830121` |
| `seed_project_columns` skip delivery | baseline: `IF NEW.type = 'delivery' THEN RETURN NEW` |
| `project_members` roles | 037 CHECK manager/implementer/installer; `use-project-members.ts` |
| progress recalculation | `recalc_delivery_progress` / `trg_zz_delivery_progress` в schema/gen types |
| UI phase board | `isPhaseBoard` в `delivery-phases.ts`, `ProjectBoard.tsx` |

**Запуск CC «сделай P2» по этому handoff = дублирование уже принятого scope.**

### B2. Ветка / деплой-контекст неверен для 2026-07-16

| Handoff | Факт |
|---------|------|
| Рабочая ветка `feat/aura-theme`, не на Netlify | Текущий checkout: **`main`** @ `71c613f` |
| | `feat/aura-theme` tip `21e07cc` ⊂ `main` (0 unique commits on aura) |
| | `main` **+74** commits vs aura |
| | `origin/main` @ `6d86d37` (Gantt drag) — прод уже далеко за delivery P1 |

Новая сессия, стартующая с «продолжи с feat/aura-theme / P2», уйдёт в неверный git-контекст.

### B3. Нельзя использовать как executable-промпт в CC

Документ:

- без блока **РАЗВЕДКА** / задач с путями  
- без «ЖЁСТКО НЕ ТРОГАТЬ»  
- без миграционных файлов «написать, не применять»  

Это **status handoff**. Оценка по crm-architect sprint-checklist: **не применим as-is** (и не должен).

---

## Предупреждения (желательно учесть)

### W1. Сигнатура `spawn_delivery_project` эволюционировала

Handoff: `spawn_delivery_project(p_deal_id, p_kind)`.

**Сейчас** (`supabase.gen.ts` + `044_spawn_delivery_owner.sql`):

- `p_template_id?`, `p_owner_id?`  
- Win Wizard / `SpawnWizard.tsx` зовут расширенный RPC  

Ownership-гард из handoff остаётся по смыслу; контракт вызова — нет.

### W2. `progress_done/total` больше не «всегда 0»

Handoff: «пока не считаются».  
P2b: триггер + `recalc_delivery_progress`; UI `hasTaskProgress` / карточки N/M.  
Поле появилось в 035 — **семантика** сменилась.

### W3. `null_internal_stage` — исторический урок, мёртвый объект

Handoff верен для пост-035: триггер нулил legacy `stage` для internal **и** delivery.  
**047 (2026-07-16):** DROP `projects.stage`, `deal_stage`, `trg_ab_null_internal_stage` / `null_internal_stage`.  
Не копировать в новые спринты как «обязательный паттерн» — колонки нет.

### W4. «Роли сейчас: только owner»

CHECK `memberships.role IN ('owner','admin','manager','viewer')` (021).  
«Только owner» могло быть про **живые данные** single-tenant; как архитектурное утверждение — вводит в заблуждение (RLS/ownership-гарды уже знают owner/admin).

### W5. «Отложено: синк docs/schema.md»

На момент handoff (P1, «17 tenant-таблиц») — ок.  
Сейчас `docs/schema.md` / skill schema отражают 035–038, project_columns, project_members, templates, Gantt, 047–048. Хвост docs — **другие** дельты (049 pending, body drift), не «синк 035».

### W6. Ручной прогон P1

UI-пути (spawn, 4 phase_group, do_url, complete, WonDeals) в коде есть; handoff честно помечает spawn E2E «не до конца». Не блокер кода, но **не считать P1 «смок-закрыт Олегом»** без отдельной отметки.

### W7. Архитектурные решения P1 — **не пересматривать** (секция валидна)

Даже при stale next-steps, **«Ключевые решения»** остаются каноном:

- dual route deals/projects  
- delivery = type + parent_deal RESTRICT  
- state = pipeline `phase_group`, не отдельный enum  
- CRM зеркалит 1С:ДО  
- status open/completed only  
- complete = кнопка  

P2/P3/Gantt **надстроились** на это, не отменили.

---

## Пропущенные места

Handoff не задаёт inventory-задач; gaps — **относительно актуальной карты delivery**:

| Область | Факт (не в handoff) | Действие |
|---------|---------------------|----------|
| P2a/P2b/P3 | 036–038 + UI + reviews | Считать **закрытыми** |
| Win Wizard / spawn owner | 044, `SpawnWizard`, `p_owner_id` | Не упрощать RPC до 2 args |
| Deal Delivery Hub | `DealDeliveryHub.tsx`, S-DEAL-HUB | Уже на won-сделке |
| Delivery health | S-DLV-HEALTH | Есть в git history |
| Completion gate | 038, `DeliveryCompletionModal` | «Завершить» + milestone-gate |
| Gantt / deps | 046–048, VIEW-2, S-DEPS-1 | Другой трек, не P1 |
| DROP legacy stage | 047 | Устаревает урок `null_internal_stage` |
| Актуальный handoff | `handoff-session-2026-07-16.md` | Предпочтительнее для «что дальше» |

---

## Предлагаемые правки в handoff (если обновлять документ)

1. **Banner в шапке:**  
   `> ARCHIVAL (2026-07-11). P1 snapshot only. Do NOT use for next steps. Post-P1: P2a/b/P3 done (036–038). Current entry: handoff-session-2026-07-16 + git log main.`
2. Секцию **«Следующие шаги»** заменить таблицей **«Статус post-P1»** (P2/P3 ✅, deploy aura superseded by main, schema sync ✅/partial).
3. `spawn_delivery_project` — отметить v1 vs v2/044 (`p_template_id`, `p_owner_id`).
4. `progress_*` — «считается с 037», не «пока 0».
5. `null_internal_stage` — «снят в 047 вместе с `projects.stage`».
6. Ветка: `main` / `origin/main`, не `feat/aura-theme` as primary.
7. Ссылки: `architecture-delivery-p2.md`, `sprint-delivery-p2a|p2b|p3.md`, reviews.

*(По user mode: файл **не** правился.)*

---

## Чеклист перед CC

- [ ] **Не** открывать этот handoff как спринт/промпт в Claude Code  
- [ ] **Не** планировать «delivery P2» заново без сверки 036–038  
- [ ] Для P1-решений — секция «Ключевые решения» + `architecture-delivery-projects.md`  
- [ ] Для «что дальше» — `git log main`, `handoff-session-2026-07-16`, roadmap / backlog  
- [ ] Перед любым delivery-RPC — сигнатура из `supabase.gen.ts` / живой БД, не v1-only из handoff  
- [ ] Учитывать DROP 047: нет `projects.stage` / `null_internal_stage`  
- [ ] Миграции по-прежнему: CC пишет файл → Cowork apply MCP (не `db push`)  

---

## crm-architect checklist (адаптация для status handoff)

| Критерий | Оценка |
|----------|--------|
| РАЗВЕДКА (для sprint) | N/A — не спринт |
| Реальные table/column | ✅ в «решениях» / 🟡 spawn args incomplete |
| Реальные paths | ✅ |
| learnings gotchas | ✅ REVOKE anon / no user_role |
| SQL as files, not apply from CC | ✅ (история P1) |
| org_id / RLS | ✅ spawn guards (на момент 035) |
| SECURITY DEFINER + ACL | ✅ spawn + later REVOKE anon |
| No flowType implicit | N/A (не трогает client) |
| DELETE CASCADE | parent_deal **RESTRICT** — осознанно ✅ |
| schema.md after migration | handoff «отложено» — **сейчас синк есть** 🟡→✅ post-factum |

---

## Итог одной строкой

**Архивный P1-handoff: решения и коммиты 2026-07-11 верны; next-steps (P2, aura-branch, schema sync) на 2026-07-16 полностью устарели — в CC не запускать.**
