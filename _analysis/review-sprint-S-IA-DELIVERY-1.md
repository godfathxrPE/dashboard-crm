# Ревью: S-IA-DELIVERY-1 — IA карточки delivery (default-таб План, error-copy, edit-модалка)

**Дата:** 2026-07-18  
**Ревьюер:** Grok (верификация по коду `main` @ `7211ce6`; `ProjectDetail.tsx` 914 LOC, `ProjectModal.tsx` 561 LOC, `validators/project.ts`, pages, `use-projects`, schema/architecture/learnings)  
**Объект:** `_analysis/sprint-S-IA-DELIVERY-1.md` — default-таб delivery=План · error-copy по `context` · edit-модалка delivery  
**Контекст:** PM M2 + §3.1 + §3.2; чистый клиент, миграций нет; внизу спринта уже есть «ПОПРАВКИ ПО РЕВЬЮ GROK (8.5/10)» — это **повторное** ревью с учётом патча; W4b split `ProjectDetail` — out of scope

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА в начале | ✅ |
| Line numbers / пути (Detail, Modal, pages) | ✅ live совпадает |
| Задача 1: default tab по type | ✅ HOW + патч W5 (derived) |
| Задача 2: error-copy по `context` | ✅ |
| Задача 3: product-цель (pencil + modal) | ✅ |
| Задача 3: HOW zod + payload | 🟡→❌ **B1** — partial и hidden-carry **не альтернативы** |
| Поле `notes` vs схема | 🟡 в теле задачи 3; ✅ в патче W3 |
| Board label «План» | ✅ уже L770 |
| Миграции / schema.md | ✅ N/A |
| org_id / RLS / DEFINER | ✅ N/A (клиент; RLS projects) |
| crm-architect checklist | ✅ кроме точности HOW submit |

**Оценка: 8.5/10.** Задачи 1–2 и product-scope задачи 3 готовы к CC. Патч-секция закрывает прошлые W1–W8 по UI/полям/git, но **формулировка W2 всё ещё вводит в заблуждение**: partial payload без прохождения `superRefine` **не дойдёт до mutate** — «Сохранить» молча/с zod-ошибками на невидимых полях.  
**Рекомендация:** **запускать в CC** после одной явной правки HOW (B1 ниже) или с жёстким акцентом в промпте: *для delivery-edit нужны И carry `parent_deal_id`/`delivery_kind` в form state (zod), И partial mutate (БД)*.

---

## Статус (что уже в репо)

| Заход | Статус в репо |
|-------|---------------|
| `useState(…'activity')` для всех типов | ✅ L167 — баг M2 жив |
| Label board → «План» для delivery | ✅ L770 — менять не нужно |
| Error «Сделка не найдена» + `/deals` | ✅ L199–209 |
| `backHref`/`backLabel` по `project.type` | ✅ L215–216 |
| Pencil `!isDelivery` + комментарий | ✅ L421–432 |
| `<ProjectModal editProject={project} />` | ✅ L846–850 |
| Pages без `context` | ✅ оба `[id]/page.tsx` |
| Default tab delivery=board | ❌ не сделано |
| Prop `context` | ❌ нет (`ProjectDetailProps` только `projectId`, L133–135) |
| Delivery-safe edit-ветка в ProjectModal | ❌ нет (`isInternal` only, L75) |

---

## Разведка (верификация claims)

| Утверждение спринта | Live |
|---------------------|------|
| `ProjectDetail.tsx` ~914 строк | ✅ 914 |
| tab useState L167 `'activity'` | ✅ union уже `'activity'\|'board'\|'timeline'\|'quotes'` |
| error-state ~199–213 deal-only | ✅ L199–209: «Сделка не найдена», `router.push('/deals')` |
| backHref L215, isDelivery L217 | ✅ |
| pencil `!isDelivery` ~423 | ✅ L421–432 |
| ProjectModal ~846 | ✅ L846–850 |
| deals/projects page → ProjectDetail | ✅ без context; server redirect type-backstop сохранён |
| Call-sites `ProjectDetail` | ✅ только 2 page (deals/projects `[id]`) |
| `?tab=`-паттерн в ProjectsSection | ✅ L117–125 + `projects/page.tsx` Suspense; **семантика иная** (list filter delivery/internal, не detail-табы) — как референс API ок |
| `useUpdateProject` partial `{id, …updates}` | ✅ `use-projects.ts` L199–208, L435+ |
| Modal `onSubmit`: non-internal → full `values` | ✅ L242–251; комментарий «client и delivery» |
| Zod delivery: `parent_deal_id` + `delivery_kind` | ✅ `validators/project.ts` L179–184 |
| Zod client\|delivery: direction/pipeline/stage | ✅ L171–177 |
| `reset(editProject)` без parent/kind | ✅ Modal L106–125 — **нет** `parent_deal_id`/`delivery_kind` |
| UI Direction/Stage при `!isInternal` | ✅ L339+ — delivery → client-like |
| Budget / deadline / next_step | ✅ **всегда** в форме (не за `!isInternal`) |
| Title edit non-internal | ✅ «Редактировать сделку» L267–269 |
| Поле `notes` | ❌ нет; есть `pinned_note` (schema.md `projects`; `PROJECT_COLUMNS`; **нет** в `projectFormSchema`) |
| do_url / deadline инлайн на карточке | ✅ deadline ~L710+; do_url ~L732+ |
| Create delivery из модалки | ✅ type-switch только client/internal (L312–314); delivery — RPC spawn |

---

## С чем согласен полностью

### 1. Задача 1 — default-таб по type (M2)

WHY верен: внедрение = план/фазы/команда; «Активность» вторична.  
`project` async → нельзя зашить type в `useState` init.  
Патч **W5** правильный: `const activeTab = tab ?? (project.type === 'delivery' ? 'board' : 'activity')`; все `tab === …` → `activeTab`; без `useEffect`/race.  
`?tab=` правильно optional (v1 без Suspense на detail-page).  
Ярлык «План» **уже** L770 — только verify.  
Quotes только client (L772–773, L804) — дефолт delivery никогда не quotes.  
client/internal остаются на `activity`.

### 2. Задача 2 — error-copy по роуту (§3.1)

При `error || !project` тип неизвестен; роут — честный сигнал.  
`context: 'deal' | 'project'` с двух page — минимальный контракт.  
Happy-path `backHref`/`backLabel` (L215–216) не трогать.  
Серверные redirect client↔delivery/internal на page — backstop, не ломать.

### 3. Задача 3 — product need + патч UI

Карандаш скрыт осознанно (P1-комментарий); трение по name/company/owner реальное.  
Патч **W1**: явная `isDelivery`, title «Редактировать внедрение», скрыть direction/stage/budget/next_step/type-switch, create delivery не открывать — **обязателен** (без него — sales-UI + «сделка»).  
Патч **W3**: `notes` → `pinned_note` или v1 без заметки — **верно** (колонки `notes` нет).  
Патч **W8**: budget скрыть — иначе accidental write.  
do_url/deadline не дублировать в модалке — согласен.  
Не пилить 914 LOC Detail — согласен.  
Миграций нет — согласен.

### 4. Scope / verification labels

Три точечные клиентские правки; labels WARNING / NOT_APPLICABLE / NOT_VERIFIED адекватны.  
Патч **W6**: не `git add -A` — правильно.

---

## Блокеры (критично — исправить HOW до/вместе с запуском)

### B1. Zod client-validate и partial mutate — **оба** нужны, не «либо-либо»

**Evidence:**

1. `reset` **не** кладёт `parent_deal_id` / `delivery_kind` (Modal L106–125).  
2. `projectFormSchema.superRefine` при `type==='delivery'` требует оба (validators L179–184).  
3. RHF `handleSubmit` + `zodResolver` валидирует **до** `onSubmit`.  
4. Следствие: при `editProject.type === 'delivery'` submit **не вызовет** `onSubmit`, пока form values не проходят superRefine — partial-payload в mutate **недостижим**.  
5. Direction/pipeline/stage при reset **есть** (delivery CHECK держит их NOT NULL) — L171–177 скорее пройдут; падают именно parent/kind.  
6. `onSubmit` non-internal сейчас шлёт **весь** `values` (L242–251) — full payload рискует stage-gate (027), accidental budget/deadline и лишним surface.

**Спринт (секция W2) формулирует:**

> partial … Альтернатива (хуже): reset заполняет hidden parent_deal_id+delivery_kind … но partial безопаснее.

Это **ошибка модели риска**:  
- **hidden/reset carry** parent+kind (+ уже имеющиеся stage-поля) → zod проходит;  
- **partial mutate** → БД-инварианты и progress/type/stage не затираются.

Нужны **оба** (или эквивалент: отдельная schema / edit-resolver без delivery-create superRefine + partial).  
Только partial → кнопка «Сохранить» не работает.  
Только full values после carry → работает, но хуже (stage/budget/gate).

**Обязательный HOW для CC:**

```ts
// reset (edit delivery): ДОПОЛНИТЕЛЬНО
parent_deal_id: editProject.parent_deal_id,
delivery_kind: editProject.delivery_kind,
// direction/pipeline/stage уже есть из editProject

// onSubmit (edit delivery):
await updateProject.mutateAsync({
  id: editProject.id,
  name: values.name,
  company_id: values.company_id,
  contact_id: values.contact_id,
  owner_id: values.owner_id ?? null,
  // pinned_note — только если поле в форме + schema
});
// НЕ слать type / stage_id / pipeline_id / parent_deal_id / delivery_kind / progress_* / budget (если не редактируем)
```

UI-ветка W1 (скрыть sales-поля) остаётся обязательной.

**Без B1-формулировки** агент, буквально следуя «partial безопаснее / без hidden», получит нерабочий delivery-edit.

---

## Предупреждения (желательно)

### W1. Тело задачи 3 vs патч-секция

В HOW задачи 3 всё ещё «**notes**», «открыть карандаш», без явного partial/zod. Патч внизу правит это, но CC может читать сверху вниз и пропустить footer.  
**Желательно:** перенести W1–W3/W8/B1 в тело задачи 3 (или пометить патч как «SOURCE OF TRUTH для задачи 3»).

### W2. Owner-селект и права

Modal всегда рендерит `AssigneeSelect` (L546–557) без гейта.  
`canManageDeliveryProject` (owner/admin ∨ owner_id/created_by) уже в Detail L219.  
Для delivery-edit: prop `canManage` / hide-or-disable owner для viewer — backend RLS backstop, UI не должен обещать writable owner.

### W3. `ProjectUpdate` / `owner_id`

`ProjectInsert` **не** объявляет `owner_id`; `ProjectUpdate = Partial<ProjectInsert> & { id }`. Runtime client-edit уже шлёт owner через spread — ок. При строгих типах partial-delivery payload может споткнуться; при необходимости `owner_id?: string | null` в Insert/Update.

### W4. Deadline / next_step в delivery-ветке

Спринт явно: deadline инлайн, не дублировать. В Modal deadline и next_step **не** за `!isInternal` — в isDelivery-ветке **скрыть** вместе с budget (W8), иначе accidental overwrite инлайна.

### W5. `?tab=` на detail

Референс ProjectsSection — list-фильтр, не detail-табы. Если внедряют deep-link: valid set без `quotes` для delivery/internal; Suspense на page. v1 skip — ок.

### W6. `git add -A`

Патч W6 верен. Явно:  
`ProjectDetail.tsx`, `ProjectModal.tsx`, `deals/[id]/page.tsx`, `projects/[id]/page.tsx`  
(+ `validators/project.ts` только если меняют schema; при carry+partial schema **можно не трогать**).

### W7. Stage gate при full payload

`trg_aa_enforce_stage_gate` (027) + progress-триггеры: partial без `stage_id` снимает риск. Фазы — через board, не эту модалку.

### W8. Смена `projectId` / remount

Next detail route обычно remount → `tab` state сбрасывается. Derived default при первом `project` ок; отдельный reset optional.

---

## Пропущенные места (gaps для CC)

| Файл | Строки / зона | Действие |
|------|---------------|----------|
| `src/lib/validators/project.ts` | L171–184 | Не ломать create-инварианты; для edit-delivery — carry parent/kind **или** edit-schema |
| `src/components/projects/ProjectModal.tsx` | L75–76, L106–125, L229–251, L267+, L339+, budget/deadline/next, L546+ | `isDelivery`; reset carry; title; hide sales; **partial** onSubmit; owner gate |
| `src/components/projects/ProjectDetail.tsx` | L133–137, L167, L199–209, L421–432, tab render L768–809 | `context`; `activeTab`; error-copy; снять `!isDelivery` |
| `deals/[id]/page.tsx`, `projects/[id]/page.tsx` | return JSX | `context="deal"` / `context="project"` |
| `src/lib/hooks/use-projects.ts` | `ProjectInsert`/`ProjectUpdate` | optional: `owner_id?` если TS ругается |
| `DealFocusPanel` / `pinned_note` | — | v1 без notes предпочтительно; не invent `notes` |

Других mount-точек `ProjectDetail` нет.

---

## Предлагаемые правки в спринт

1. **Задача 3 / W2:** заменить «partial vs hidden» на **«carry для zod + partial для mutate»** (B1).  
2. **Задача 3 тело:** `notes` → `pinned_note` или out of scope; не оставлять противоречие с footer.  
3. **Задача 1:** в HOW primary = derived `activeTab` (как W5); effect-path secondary. Label «План» — already done.  
4. **Задача 2:** без изменений.  
5. **КОММИТ:** явный список файлов (W6).  
6. **Смок:**  
   - `/projects/{delivery}` → таб «План» (board / ProjectBoard);  
   - `/projects/bad-id` → «Проект не найден» + `/projects`;  
   - `/deals/bad-id` → «Сделка не найдена» + `/deals`;  
   - delivery pencil → Save name → refetch: `type=delivery`, `parent_deal_id` / `delivery_kind` / `progress_*` / `stage_id` на месте;  
   - client/internal edit без регресса title/fields/submit.

---

## Чеклист crm-architect

- [x] РАЗВЕДКА в спринте  
- [x] Реальные пути (architecture: ProjectDetail, ProjectModal, deals/projects pages)  
- [x] Имена полей в патче (`pinned_note`); [ ] тело задачи 3 ещё пишет `notes`  
- [x] learnings: противоречий нет; delivery CHECK (parent/kind/pipeline) учтён  
- [x] SQL/миграции: нет; CC не apply  
- [x] org / RLS: существующие policies projects; UI owner-gate желателен  
- [x] SECURITY DEFINER: N/A  
- [x] no `flowType: 'implicit'`  
- [x] DELETE/CASCADE: не трогаем  
- [x] CSS theme vars: N/A  
- [x] schema.md update: N/A  

---

## Чеклист перед CC

- [ ] HOW задачи 3: **zod-carry parent_deal_id+delivery_kind + partial mutate** (B1), не «только partial»  
- [ ] UI-ветка `isDelivery`: title «внедрение», скрыть direction/stage/budget/deadline/next_step/type  
- [ ] «notes» → `pinned_note` или v1 без заметки  
- [ ] Задачи 1–2: `activeTab` derived; `context` на обоих page  
- [ ] Не трогать: split ProjectDetail, миграции, spawn RPC, phase board, inline do_url/deadline  
- [ ] `git add` явным списком  
- [ ] Смоки: default tab, error-copy, delivery-edit invariants, client/internal regress  

**Итог:** спринт **можно отдавать в Claude Code** после фикса формулировки B1 (одна фраза в HOW). Задачи 1–2 as-is. Задача 3 без B1 + W1-патча даст либо мёртвый Save (zod), либо sales-регресс (UI). Патч-секция внизу — почти complete; единственный критичный пробел — «partial XOR carry» → **AND**.
