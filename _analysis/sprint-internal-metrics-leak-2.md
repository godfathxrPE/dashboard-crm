# Claude Code Prompt — Sprint: internal-утечка, добор (остальные 8 мест + мёртвый SmartAlerts)

Контекст: dashboard-crm, ветка `feat/aura-theme`. Первый заход (5 файлов) закрыл часть
утечки internal-проектов в deal-метрики. Полный инвентарь `grep` показал ещё 8 мест того же
класса + один сюрприз: **`SmartAlerts.tsx` мёртвый** (нигде не импортируется), живые алерты —
`lib/hooks/use-alerts.ts` (`Header.tsx`), и там утечка осталась. То есть алерты по факту
ещё не починены.

**Принцип классификации (тот же, что в первом заходе):**
- **Стоимостная/счётная sales-метрика** (pipeline £, won, active-deals count, недельная
  аналитика) → internal исключаем: `type === 'client'` + `status` вместо legacy `stage`.
- **Операционная связь/релевантность** (привязка сущностей, автоподстановка, дедлайн-радар) →
  internal оставляем, меняем только legacy `stage` → `status` (internal-safe).

НЕ трогать: dual-write `mapToLegacyStage`, STAGE_CONFIG-отображение ярлыков стадий,
PCT-1 доску задач, `isProjectActive` в CallModal (переопределяет предикат сам).

---

## РАЗВЕДКА

```bash
# 1. Подтвердить: SmartAlerts мёртв, use-alerts живой
grep -rn "SmartAlerts" src --include="*.tsx" | grep -v "shared/SmartAlerts.tsx:"   # ожидаем пусто
grep -rn "useAlerts" src --include="*.tsx" | grep -v "hooks/use-alerts.ts"          # ожидаем Header.tsx

# 2. Полный список оставшихся legacy-фильтров (после этого захода должен опустеть по метрикам)
grep -rnE "\.stage !== 'won'|\.stage === 'won'|\.stage !== 'lost'|\.stage === 'lost'|\.stage !== 'new_lead'" src --include="*.tsx" --include="*.ts"

# 3. status/type в типе Project
grep -nE "status\??:|type\??:" src/types/database.ts | grep -iE "client|internal|open|won|lost"
```

---

## ЗАДАЧА 1: Живые алерты (use-alerts.ts) + удалить мёртвый SmartAlerts

`src/lib/hooks/use-alerts.ts` (~35 и ~50) — **это настоящий фикс алертов**:
```tsx
// ~35 (noContact):
(p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost' && !p.contact_id,
// ~50 (active):
(p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost' && p.company_id,
```

Удалить мёртвый компонент (подтверждён РАЗВЕДКОЙ №1 — 0 импортов):
```bash
git rm src/components/shared/SmartAlerts.tsx
```
⚠️ Если РАЗВЕДКА №1 внезапно покажет импорт SmartAlerts — НЕ удалять, а применить тот же
фикс, что был в первом заходе (там он уже сделан в файле, но на мёртвом коде).

---

## ЗАДАЧА 2: Метрики-виджеты — исключить internal (type + status)

### `src/components/widgets/StatsWidget.tsx` (~47–48)
```tsx
const activeProjects = (projects ?? []).filter((p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost');
const wonProjects = (projects ?? []).filter((p) => p.type === 'client' && p.status === 'won');
```

### `src/components/widgets/TasksSidebar.tsx` (~190)
```tsx
const active = (projects ?? []).filter((p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost').length;
```
(Классифицировано как дилерский счётчик. Если Олег решит «активная работа вообще» —
убрать `p.type === 'client'`, оставив только `p.status`-миграцию.)

### `src/components/analytics/WeeklyReview.tsx` (~36–37)
```tsx
const projectsMoved = (projects ?? []).filter((p) => p.type === 'client' && inWeek(p.updated_at) && p.stage !== 'new_lead');
const projectsWon = (projects ?? []).filter((p) => p.type === 'client' && p.stage === 'won' && inWeek(p.updated_at));
```
`projectsMoved` оставляет legacy `stage !== 'new_lead'` (это про движение по воронке, только
client) — важно добавить `type === 'client'`, иначе internal (`stage=null`) считается
«сдвинутым». `projectsWon` — `type` для консистентности (internal и так отсечён `===won`).

---

## ЗАДАЧА 3: Связь/релевантность — оставить internal, только stage → status

Здесь `type`-фильтр НЕ добавляем — internal-проекты легитимны в этих контекстах.

### `src/components/meetings/MeetingModal.tsx` (~41)
```tsx
() => (projects ?? []).filter((p) => p.status !== 'won' && p.status !== 'lost').map((p) => ({ value: p.id, label: p.name })),
```

### `src/lib/forms/derive-links.ts` (~53)
```tsx
const isActive =
  deps.isActiveProject ?? ((p: P) => p.status !== 'won' && p.status !== 'lost');
```
(Автоподстановка проекта из контакта — internal-проект контакта валиден как цель.)

### `src/components/widgets/DeadlineRadar.tsx` (~41)
```tsx
if (p.deadline && p.status !== 'won' && p.status !== 'lost') {
```

### `src/components/dashboard/DashboardHome.tsx` (~634)
```tsx
.filter((p) => p.deadline && p.status !== 'won' && p.status !== 'lost')
```
⚠️ DeadlineRadar + DashboardHome:634 — по решению «дедлайн-радар операционный, internal
показываем». Если Олег скажет «дашборд чисто дилерский» — добавить `p.type === 'client' &&`.

---

## ЗАДАЧА 4 (опционально, behavior-neutral): FunnelWidget на status

`src/components/widgets/FunnelWidget.tsx` уже НЕ течёт (internal отсечён через `p.stage &&`
на строке 12 и `=== 'won'` на 22-23). Миграция на status — только для единообразия, поведение
не меняется. Если делаешь:
```tsx
// 12:
const active = projects.filter((p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost');
// getPhaseForStage(p.stage) внутри map — оставить (client имеет legacy stage-зеркало)
// 22–23:
const wonCount = (projects ?? []).filter((p) => p.type === 'client' && p.status === 'won').length;
const wonBudget = (projects ?? []).filter((p) => p.type === 'client' && p.status === 'won').reduce((s, p) => s + (p.budget ?? 0), 0);
```
Если не делаешь — оставь как есть, это не баг.

---

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
rm -rf .next && npm run build 2>&1 | tail -8
# После захода метрик-утечек по .stage быть не должно (кроме FunnelWidget, если пропустил,
# и legacy stage !== 'new_lead' в WeeklyReview — там это ок под type-гейтом):
grep -rnE "\.stage !== 'won'|\.stage === 'won'|\.stage === 'lost'" src --include="*.tsx" --include="*.ts"
```

Ручные сценарии:
1. Колокол алертов в шапке (Header → use-alerts) не показывает «Пресейл Ориентир» (internal).
2. Виджеты дашборда (Stats/Funnel): «активные»/pipeline/won без internal.
3. Дедлайн-радар: дедлайн internal-проекта (20 июля) ВИДЕН (оставили сознательно).
4. Открыть встречу с карточки контакта, у которого один internal-проект → он автоподставился
   в связь (derive-links оставил internal).
5. Клиентские метрики без изменений (регресс не сломан).

## КОММИТ

```bash
git add src/lib/hooks/use-alerts.ts src/components/widgets/StatsWidget.tsx \
  src/components/widgets/TasksSidebar.tsx src/components/analytics/WeeklyReview.tsx \
  src/components/meetings/MeetingModal.tsx src/lib/forms/derive-links.ts \
  src/components/widgets/DeadlineRadar.tsx src/components/dashboard/DashboardHome.tsx
git rm src/components/shared/SmartAlerts.tsx
# (+ FunnelWidget.tsx если делал задачу 4)
git commit -m "fix(pct-1): добор internal-утечки в deal-метрики (use-alerts живой vs мёртвый SmartAlerts, виджеты, weekly); связи/дедлайны на status с сохранением internal"
```

---

## VERIFICATION

```
Type Safety:            WARNING (прогнать tsc)
RLS Coverage:           NOT_APPLICABLE
Backward Compatibility: WARNING (client-метрики без изменений; меняется учёт internal — цель;
                         удаление SmartAlerts безопасно — 0 импортов, подтвердить РАЗВЕДКОЙ №1)
Runtime Tested:         NOT_VERIFIED (5 сценариев)
Regional Availability:  NOT_APPLICABLE
```

Трудоёмкость: ~1 ч, риск низкий. После этого захода класс «internal течёт в deal-метрику»
закрыт полностью (инвентарь пуст). Остаётся только косметика STAGE_CONFIG-ярлыков —
отдельная необязательная миграция, internal-safe.
