# Claude Code Prompt — Sprint S31: Cmd+K полиш (ранжирование, scroll, покрытие, читаемые подписи)

Контекст: dashboard-crm, ветка `feat/aura-theme`. `CommandPalette.tsx` уже зрелый
(Cmd+K/Ctrl+K + ESC + фокус + route-reset, поиск по 6 сущностям, действия, saved views,
навигация). Разведка выявила 4 реальных пробела — это полиш «до готовности», без новой
инфраструктуры. Единственный основной файл — `src/components/shared/CommandPalette.tsx`.

Паттерн-референс: Linear/Raycast ⌘K — релевантность важнее порядка вставки, выделение
всегда в видимой области, покрытие всех сущностей.

НЕ трогать: глобальный хоткей-листенер (Cmd+K/ESC на ~77-88), фокус-эффект (~90),
route-reset (~62), ui-store, модалки, PCT-1. Только `CommandPalette.tsx` (+ импорт useLeads).

Recents (недавно открытые на пустом query) — СОЗНАТЕЛЬНО вне скоупа (нужен storage,
отдельный заход).

---

## РАЗВЕДКА

```bash
# 1. Текущая сборка items, фильтр, подписи (sub)
sed -n '99,235p' src/components/shared/CommandPalette.tsx

# 2. Есть ли готовые человекочитаемые label-мапы (чтобы не плодить дубли)
grep -rnE "TASK_LANE|LANE_LABEL|lane.*[Лл]абел|'Сейчас'|'Далее'|STAGE_CONFIG|CALL_STATUS|status.*[Лл]абел" \
  src/lib/validators src/lib/constants src/types --include="*.ts" 2>/dev/null | head
grep -n "shortLabel" src/lib/validators/project.ts | head -3

# 3. useLeads: сигнатура (что возвращает лид — title/company_name_raw/status)
sed -n '1,40p' src/lib/hooks/use-leads.ts
grep -nE "title|company_name_raw|contact_name_raw|status|id" src/types/database.ts | grep -iA0 lead | head

# 4. Иконки Lucide, уже импортированные в палитре (для Leads/Calendar не дублировать импорт)
grep -n "from 'lucide-react'" src/components/shared/CommandPalette.tsx
```

---

## ЗАДАЧА 1: Релевантное ранжирование поиска (ядро)

Проблема: при непустом query результаты фильтруются `.includes()` и режутся `.slice(0,15)`
в порядке вставки секций — совпавшая сущность из поздней секции выпадает из топа.

В `CommandPalette.tsx`, блок `filtered` (~231):

```tsx
// Скоринг: точное > префикс > начало слова > подстрока в label > sub > секция.
// -1 = нет совпадения. Возвращаем топ-N по убыванию score; при равенстве —
// стабильно сохраняем исходный порядок (секционный приоритет действий/навигации).
function scoreItem(item: CmdItem, q: string): number {
  const label = item.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (label.includes(q)) return 40;
  if (item.sub?.toLowerCase().includes(q)) return 20;
  if (item.section.toLowerCase().includes(q)) return 10;
  return -1;
}

const filtered = useMemo(() => {
  if (!query.trim()) {
    const base = actionsOnly ? allItems.filter((i) => i.section === 'Действия') : allItems;
    return base.slice(0, 15);
  }
  const q = query.toLowerCase();
  return allItems
    .map((item, idx) => ({ item, idx, score: scoreItem(item, q) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx) // score ↓, затем стабильно
    .slice(0, 15)
    .map((x) => x.item);
}, [allItems, query, actionsOnly]);
```

⚠️ Секционная группировка при рендере (`currentSection`) остаётся как есть — но учти:
теперь порядок внутри `filtered` по score, поэтому одна секция может встретиться не одним
блоком. Это ок для поиска (релевантность > группировка). На ПУСТОМ query группировка
по-прежнему аккуратная (порядок вставки сохранён). Проверь визуально, что заголовки секций
не дублируются некрасиво при поиске — если мешает, при непустом query заголовки секций
можно не показывать (`showSection` только когда `!query`).

---

## ЗАДАЧА 2: scrollIntoView выделенного пункта

Выделение стрелками должно оставаться в видимой области (`max-h-72` скроллится).

```tsx
// рядом с inputRef:
const listRef = useRef<HTMLDivElement>(null);

// после объявления filtered/selectedIdx:
useEffect(() => {
  const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-idx="${selectedIdx}"]`);
  el?.scrollIntoView({ block: 'nearest' });
}, [selectedIdx]);
```
Повесить `ref={listRef}` на скролл-контейнер результатов (`<div ... max-h-72 overflow-y-auto>`)
и `data-cmd-idx={i}` на `<button>` каждого пункта.

---

## ЗАДАЧА 3: Покрытие — Лиды и Календарь

### Навигация (блок nav-items ~124):
```tsx
{ id: 'nav-leads', label: 'Лиды', icon: /* UserPlus или Inbox из lucide */, href: '/leads', section: 'Навигация' },
{ id: 'nav-calendar', label: 'Календарь', icon: CalendarDays, href: '/calendar', section: 'Навигация' },
```
Добавить в `ROUTE_LABELS`: `'/leads': 'Лиды'`, `'/calendar': 'Календарь'`.

### Поиск по лидам:
```tsx
import { useLeads } from '@/lib/hooks/use-leads';
// в компоненте:
const { data: leads } = useLeads();
// в allItems, после meetings:
for (const l of leads ?? []) {
  items.push({
    id: `lead-${l.id}`,
    label: l.title,
    sub: l.company_name_raw ?? undefined,   // сверь имя поля РАЗВЕДКОЙ №3
    icon: /* UserPlus */,
    href: '/leads',
    section: 'Лиды',
  });
}
// не забыть leads в deps useMemo для allItems
```
⚠️ RLS: `leads` персональные (`user_id`), useLeads уже под этим — палитра ничего лишнего
не покажет. Сверь фактические поля лида (title/company_name_raw/status) РАЗВЕДКОЙ №3.

---

## ЗАДАЧА 4: Человекочитаемые подписи (sub)

Сырые enum'ы → русские ярлыки. Если в РАЗВЕДКЕ №2 нашлись готовые мапы — переиспользовать,
не дублировать.

- **Задачи** (`sub: t.lane` ~143):
  ```tsx
  const LANE_LABEL: Record<string, string> = { now: 'Сейчас', next: 'Далее', wait: 'Ожидание', done: 'Готово' };
  // sub: LANE_LABEL[t.lane] ?? t.lane
  ```
- **Проекты** (`sub: p.stage ?? undefined` ~155) — internal-safe + читаемо:
  ```tsx
  sub: p.type === 'internal'
    ? 'Внутренний'
    : (p.stage ? STAGE_CONFIG[p.stage]?.shortLabel ?? undefined : undefined),
  ```
  (`STAGE_CONFIG` уже импортируется на :155-соседних? если нет — из `@/lib/validators/project`.)
- **Звонки** (`sub: c.status` ~192):
  ```tsx
  const CALL_STATUS_LABEL: Record<string, string> = { done: 'Завершён', pending: 'Ожидает', cancelled: 'Отменён' };
  // sub: CALL_STATUS_LABEL[c.status] ?? c.status
  ```
Мапы объявить модульно (вне компонента), рядом с `ROUTE_LABELS`.

---

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
rm -rf .next && npm run build 2>&1 | tail -8
```

Ручные сценарии:
1. Cmd+K → ввести имя контакта/компании из «дальней» секции → он в топе (ранжирование).
2. Стрелкой вниз пройти весь список → выделение всегда видно, не уезжает под кромку.
3. Пусто → ввести «лид» → пункт «Лиды» (навигация) + лиды в поиске; «календарь» → Календарь.
4. Задача показывает «Сейчас/Далее/…», не «now»; звонок «Завершён»; клиентская сделка —
   короткий ярлык стадии; внутренний проект — «Внутренний» (не пусто, не enum).
5. Регресс: действия (T/C/P/M), навигация, ESC, saved views, route-reset — как раньше.

## КОММИТ

```bash
git add src/components/shared/CommandPalette.tsx
git commit -m "feat(cmdk): S31 полиш — релевантное ранжирование, scrollIntoView, Лиды/Календарь, читаемые подписи (lane/stage/status, internal → Внутренний)"
```

---

## VERIFICATION

```
Type Safety:            WARNING (прогнать tsc; useLeads/поля лида сверить РАЗВЕДКОЙ)
RLS Coverage:           NOT_APPLICABLE (клиентские хуки, leads уже под user_id-RLS)
Backward Compatibility: WARNING (поиск меняет ПОРЯДОК выдачи — это цель; действия/навигация/ESC без изменений)
Runtime Tested:         NOT_VERIFIED (5 сценариев)
Regional Availability:  NOT_APPLICABLE
```

Трудоёмкость: ~1–1.5 ч, риск низкий (один файл, аддитивно). Скоуп сознательно «до
готовности». Deferred (следующий заход, если захочется): recents на пустом query
(недавно открытые сущности — нужен storage: zustand-persist или таблица), подсветка
совпавшей подстроки, focus-trap Tab.
