# Claude Code Prompt — Sprint: internal-проекты не должны течь в deal-метрики

Контекст: dashboard-crm, ветка `feat/aura-theme`. После PCT-1 у внутренних проектов
`type='internal'`, `stage=NULL`, `stage_id=NULL`, но `status='open'`. Часть виджетов
считает «активные сделки» через legacy-фильтр `p.stage !== 'won'/'lost'`. Для internal
это `null !== 'won'` → **true**, поэтому внутренние проекты протекают в KPI дашборда,
алерты и ленту контакта как сделки. Плюс на шапке карточки internal рисуется
«здоровье сделки» (HealthDot → «Внимание»), хотя это не сделка.

**Design-решение (принято):** метрики pipeline/won/lost/активные-сделки и deal-health —
это **sales-метрики**, внутренние проекты в них не входят. Фильтруем по
`type === 'client'`. Если позже понадобится отдельный виджет внутренних проектов — это
отдельная задача, не здесь.

Заодно снимаем legacy-зависимость от `projects.stage` в этих местах (переходим на `status`),
что закрывает часть handoff-задачи «legacy-читатели stage → stage_id». Отображение стадии
(STAGE_CONFIG-ярлыки в Card/Table/Detail) НЕ трогаем — оно internal-safe и вне скоупа.

НЕ трогать: dual-write `mapToLegacyStage(...)` (запись зеркала при смене stage_id),
STAGE_CONFIG-отображение стадий, PCT-1 доску задач.

---

## РАЗВЕДКА (выполни первой)

```bash
# 1. Все legacy-фильтры статуса по .stage (это цели правок)
grep -rnE "\.stage !== 'won'|\.stage !== 'lost'|\.stage === 'won'|\.stage === 'lost'|\.stage !== 'lost'" src --include="*.tsx"

# 2. HealthDot и direction-Badge в шапке ProjectDetail — проверить гейтинг по type
sed -n '325,335p' src/components/projects/ProjectDetail.tsx

# 3. Подтвердить, что p.status и p.type есть в типе Project
grep -nE "status\??:|type\??:" src/types/database.ts | grep -iE "client|internal|open|won|lost" | head

# 4. PipelineBoard KPI (уже на status — добавим type)
sed -n '130,135p' src/components/projects/PipelineBoard.tsx
```

---

## ЗАДАЧА 1: DashboardHome — deal-метрики только по client + status

`src/components/dashboard/DashboardHome.tsx`.

KPI-блок (~строка 194):
```tsx
// Было:
const active = (projects ?? []).filter((p) => p.stage !== 'won' && p.stage !== 'lost');
const won = (projects ?? []).filter((p) => p.stage === 'won');
const lost = (projects ?? []).filter((p) => p.stage === 'lost');
// Стало:
const active = (projects ?? []).filter((p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost');
const won = (projects ?? []).filter((p) => p.type === 'client' && p.status === 'won');
const lost = (projects ?? []).filter((p) => p.type === 'client' && p.status === 'lost');
```

Chart-блок (~строка 435):
```tsx
// Было:
const active = projects.filter((p) => p.stage !== 'won' && p.stage !== 'lost');
// Стало:
const active = projects.filter((p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost');
```
Строку `active.filter((p) => p.stage === stage)` (распределение по стадиям) НЕ менять —
`active` теперь только client, а у client legacy `stage` заполнен зеркалом. Корректно.

⚠️ `pipeline = active.reduce(...budget)` — теперь не включает бюджет internal-проектов
в sales-pipeline. Это и есть цель.

---

## ЗАДАЧА 2: SmartAlerts — алерты только по клиентским сделкам

`src/components/shared/SmartAlerts.tsx` (~строки 45 и 58):
```tsx
// noContact (~45):
const noContact = (projects ?? []).filter(
  (p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost' && !p.contact_id,
);
// active (~58):
const active = (projects ?? []).filter(
  (p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost' && p.company_id,
);
```

---

## ЗАДАЧА 3: ContactDetailHub — связанные проекты по status, не legacy stage

`src/components/contacts/ContactDetailHub.tsx` (~строка 168):
```tsx
// Было:
() => (allProjects ?? []).filter((p) => p.contact_id === contactId && p.stage !== 'lost'),
// Стало:
() => (allProjects ?? []).filter((p) => p.contact_id === contactId && p.status !== 'lost'),
```
Здесь `type`-фильтр НЕ добавляем: internal-проект контакта — легитимная связь, его
показываем. Меняем только legacy `stage` → `status` (internal-safe: у internal
`status='open'` → показывается).

---

## ЗАДАЧА 4: PipelineBoard — KPI «Активные» исключает internal

`src/components/projects/PipelineBoard.tsx` (~строка 133):
```tsx
// Было:
const active = projects.filter((p) => p.status !== 'won' && p.status !== 'lost');
// Стало:
const active = projects.filter((p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost');
```
Воронка — по определению про клиентские сделки; internal не должен инфлейтить счётчик
«Активные» и взвешенный pipeline.

---

## ЗАДАЧА 5: ProjectDetail — deal-health не показывать на internal

`src/components/projects/ProjectDetail.tsx` (~строка 333):
```tsx
// Было:
<HealthDot level={calculateDealHealth(project).level} score={calculateDealHealth(project).total} size="md" showLabel />
// Стало:
{project.type === 'client' && (
  <HealthDot level={calculateDealHealth(project).level} score={calculateDealHealth(project).total} size="md" showLabel />
)}
```
Это убирает «● Внимание» с шапки внутреннего проекта.

⚠️ Из РАЗВЕДКИ №2: проверь строку ~330 — Badge направления
`{project.direction === 'iiot' ? 'IIoT' : 'ERP'}`. Если он рендерится для internal
(direction=null → покажет «ERP»), тоже загейти условием `project.direction && (...)`
или `project.type === 'client' && (...)`. Если уже под гейтом — не трогать.

---

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
# чистый билд (тёплый .next прячет CSS/минификацию):
rm -rf .next && npm run build 2>&1 | tail -8
# не осталось legacy status-фильтров по .stage:
grep -rnE "\.stage !== 'won'|\.stage === 'won'|\.stage === 'lost'" src --include="*.tsx"
```

Ручные сценарии (локалка на боевом Supabase):
1. Дашборд: KPI «Активные»/pipeline НЕ учитывают «Пресейл Ориентир» (internal, 200K).
2. Открыть карточку internal-проекта → в шапке НЕТ «● Внимание» (и нет «ERP»-бейджа).
3. Клиентская сделка: health-dot и метрики на месте, как раньше (регресс не сломан).
4. Карточка контакта Дмитрий Лапин: внутренний проект «Пресейл Ориентир» в связанных
   виден (status-фильтр не выкинул internal).

## КОММИТ

```bash
git add src/components/dashboard/DashboardHome.tsx src/components/shared/SmartAlerts.tsx \
  src/components/contacts/ContactDetailHub.tsx src/components/projects/PipelineBoard.tsx \
  src/components/projects/ProjectDetail.tsx
git commit -m "fix(pct-1): internal-проекты вне deal-метрик (status/type вместо legacy stage), deal-health скрыт на internal"
```

---

## VERIFICATION

```
Type Safety:            WARNING (правки типобезопасны, tsc прогнать)
RLS Coverage:           NOT_APPLICABLE (только клиентские фильтры, БД не трогаем)
Backward Compatibility: WARNING (client-метрики без изменений; меняется только учёт internal — это цель)
Runtime Tested:         NOT_VERIFIED (прогнать 4 сценария)
Regional Availability:  NOT_APPLICABLE
```

Трудоёмкость: ~1–1.5 ч, риск низкий (точечные фильтры, аддитивная логика).
Скоуп сознательно узкий: чиним утечку метрик + health-dot. Косметическую миграцию
STAGE_CONFIG-отображения (ProjectDetail/ContactDetail/CommandPalette/LostDeals) —
отдельным заходом, она internal-safe и не срочна.
