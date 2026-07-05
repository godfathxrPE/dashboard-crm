# Claude Code Prompt — Sprint: Fix P0 (date off-by-one + tsc build)

Контекст: dashboard-crm (Next.js 15 + TS + Supabase). Аудит 2026-06-14 нашёл 2 блокера.
Источник истины — код и `database.ts`, НЕ reference-файлы crm-architect (устарели).
Тема Aura уже починена (контраст), не трогай globals.css.

---

## РАЗВЕДКА (выполни первой, ничего не меняя)

```bash
# 1. Подтверди масштаб date-бага
grep -rn "toISOString().slice(0, 10)\|toISOString().slice(0,10)" src --include="*.ts" --include="*.tsx"

# 2. Подтверди ошибки tsc
npx tsc --noEmit 2>&1 | head -20

# 3. Что реально в типе Meeting и Zod-схеме встречи
grep -n "company_id\|contact_id\|project_id" src/types/database.ts | grep -i meeting
sed -n '1,60p' src/lib/validators/meeting.ts
sed -n '30,60p' src/components/meetings/MeetingModal.tsx

# 4. Есть ли date-helpers и что в нём
cat src/lib/utils/date-helpers.ts 2>/dev/null | head -40

# 5. ПРОВЕРЬ фактическую схему meetings в БД перед решением по задаче 2
#    (через Supabase MCP list_tables, schema=public, table meetings — есть ли company_id/contact_id)
```

Прими решение по ЗАДАЧЕ 2 на основе п.3 и п.5:
- если колонки `company_id`/`contact_id` ЕСТЬ в БД, но нет в `database.ts` → регенерируй типы + расширь Zod-схему;
- если колонок НЕТ в БД → убери обращения к ним из MeetingModal (или добавь колонки миграцией, если они нужны по логике).

---

## ЗАДАЧА 1: Локальная дата вместо UTC (P0, off-by-one)

`new Date().toISOString().slice(0,10)` возвращает UTC-дату → для MSK ночью показывает вчера. 10 вхождений.

### Шаг 1.1 — добавь хелпер в `src/lib/utils/date-helpers.ts`
```ts
/** Локальный YYYY-MM-DD (НЕ UTC). Заменяет toISOString().slice(0,10),
 *  который для UTC+ часовых поясов даёт вчерашнюю дату ночью/утром. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

### Шаг 1.2 — замени все вхождения «today/ключ даты»
Импортируй `localDateKey` и замени `new Date().toISOString().slice(0, 10)` → `localDateKey()` в:
- `src/components/calendar/CalendarView.tsx:42`
- `src/components/calls/CallTracker.tsx:18`
- `src/components/layout/EventReminder.tsx:69`
- `src/components/layout/ActivityDrawer.tsx:120,125,188,278`
- `src/components/shared/SmartAlerts.tsx:29`
- `src/components/dashboard/DashboardHome.tsx:199`

(`ContactsTable.tsx:199` — имя CSV-файла; тоже переведи на `localDateKey()` для единообразия.)

ВАЖНО: меняй ТОЛЬКО конструкции вида `new Date().toISOString().slice(0,10)` для дат-ключей «сегодня». НЕ трогай `toISOString()` там, где дата уходит в Supabase как timestamp (там UTC корректен).

### Шаг 1.3 — проверка
```bash
grep -rn "toISOString().slice(0, 10)\|toISOString().slice(0,10)" src --include="*.ts" --include="*.tsx"
# Должны остаться только осознанные timestamp-кейсы (если есть). Date-ключи — через localDateKey.
```

---

## ЗАДАЧА 2: Почини tsc (MeetingModal, 6 ошибок) — P0 блокер билда

По итогам РАЗВЕДКИ п.3/п.5 приведи в соответствие тип/схему/модалку (см. развилку выше).
Если колонки нужны и их нет в БД — отдельной миграцией `supabase/migrations/0XX_meetings_company_contact.sql`:
```sql
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
```
(миграция применяется ВРУЧНУЮ в Supabase SQL Editor — не `db push`). После — регенерируй `database.ts`, расширь `src/lib/validators/meeting.ts`.

### Проверка
```bash
npx tsc --noEmit    # 0 ошибок
```

---

## ЗАДАЧА 3: График «Проекты по фазам» рисует бары (P1)

Файл `src/components/analytics/Charts.tsx`, компонент `PipelineChart` (стр. ~156-217).
Данные корректны (проверено: negotiate=2, close=1), но бары не рендерятся в Aura.
Причина — `isAnimationActive={isAura}` (стр. 201) схлопывает бары в 0 при vertical layout + async data.

Фикс: `isAnimationActive={false}` на `<Bar>` (стр. 201). То же в `src/components/analytics/CallsChart.tsx` (тот же паттерн).
Если хочешь сохранить анимацию — добавь `key={chartData.length}` на `<BarChart>`, чтобы ремаунтить после прихода данных.

### Проверка
```bash
npm run dev
# открой /analytics в Aura-теме: «Проекты по фазам» должен показать 2 бара (Согл.встреча) + 1 (Закрытие)
```

---

## ЗАДАЧА 4: Хардкод цветов в календаре (P1, тёмные темы)

Замени в `src/components/calendar/CalendarView.tsx` (стр. 144,145,154) и
`src/components/layout/ActivityDrawer.tsx` (стр. 225,226,234):
- `#1a1a1a` → `var(--accent)` (для выбранного дня) или `var(--text)`
- `#fff` → `var(--surface)`

---

## КОММИТ

```bash
npx tsc --noEmit && npm run build   # оба должны пройти
git add .
git commit -m "fix: локальная дата вместо UTC (off-by-one), tsc MeetingModal, бары аналитики, хардкод цветов календаря"
```

Покажи diff кратко перед коммитом.
