# Спринт S-R2-FIX-1 — Числа компаний и мелкий долг UI

**Вход:** `main` = `6b16158`, миграции 001–091 применены. **Миграций в этом спринте нет** —
только фронтенд и утилиты. Гейт будет лёгкий: дифф + тесты, без `apply_migration` и advisors.

**Ветка:** `fix/r2-ui-debt-1`

**Baseline (не ухудшать):** lint 15 errors / 34 warnings, тестов 576.
«Ни одной новой» проверяется через `git stash` → прогон → `git stash pop`.

---

## Что уже проверено — не переоткрывать

Разведка сделана до написания промпта, факты ниже считать данностью:

1. **Пайплайн компании действительно врёт.** SQL по проду:
   `Ориент продактс` → сумма по всем не-won/lost проектам = **2 200 000 000 коп. (22.0M ₽)**,
   по `type='client'` = **1 100 000 000 коп. (11.0M ₽)**. Лишнее даёт `Пресейл Ориент`
   (`type='internal'`, `status='open'`, budget 11.0M). Это **единственная** компания в проде
   с расхождением.

2. **`splitCompanyProjects` кладёт `internal` в `deliveries` НАМЕРЕННО**
   (`src/lib/utils/company-360.ts:21-27` — комментарий: `projectHref` и IA трактуют
   delivery+internal как одну секцию, фильтр строго по `'delivery'` молча терял бы строку
   с карточки). **Контракт функции не менять.** Врёт не разбиение, а *слово* «внедрение»
   в итоговой строке — чинить надо счётчик и формулировку, см. ЗАДАЧУ 2.

3. **Хвост #5 (колонка «Телефон» читает legacy `phone`) — не воспроизводится, в спринт не входит.**
   `CompanyModal.tsx:89-91` при каждом сохранении зеркалит `phone: primaryPhone(phones)`,
   то есть инвариант `phone = primary(phones)` держится на записи. В проде: 260 компаний,
   с телефоном — 2, обе имеют и массив, и legacy, строк «массив есть, `phone` пуст» — **0**.
   Плюс колонка редактируемая (`EditableCell` пишет обратно в `phone`): читать из `phones[]`,
   а писать в `phone` — значит завести расхождение своими руками. Правка отложена, см.
   «Что НЕ входит».

4. **Хвост #6 («дубль в семи местах») преувеличен.** Одинаковая разметка точки 6px есть ровно
   в **двух** местах: `CompanyPeekContent.tsx:134-142` и `CompanyDetail.tsx:233-241`.
   Остальные потребители `getDealHealth` рендерят по-другому и дублями не являются:
   `TodayView.tsx:313` (`marker` для `QueueRow`), `ProjectsTable.tsx:189` (`marker` с `title`),
   `ProjectCard.tsx:216` (`AttentionLine` с текстом), `DealFocusPanel.tsx:33` (флаг `overdue`).
   **Трогаем только два одинаковых, остальные не переписываем.**

---

## РАЗВЕДКА (выполнить до правок)

```bash
git checkout -b fix/r2-ui-debt-1

# 1. Точка входа пайплайна
sed -n '70,100p' src/components/companies/CompaniesTable.tsx

# 2. Утилита 360 и её потребители
grep -rn "splitCompanyProjects\|countCompany360\|formatCompany360Summary" src/

# 3. Есть ли тесты на company-360 и куда их класть
find src -path "*__tests__*" -name "*.ts*" | head -20
ls src/lib/utils/__tests__/ 2>/dev/null

# 4. Оба одинаковых блока точки здоровья
grep -n "dh !== 'ok'" -A 9 src/components/companies/CompanyPeekContent.tsx \
                          src/components/companies/CompanyDetail.tsx

# 5. Формулировка про открытый пайплайн — где ещё, кроме peek
grep -rn "в открытых сделках\|Без открытых сделок" src/

# 6. Касты цвета статуса лида
grep -rn "as 'blue' | 'green' | 'red' | 'yellow' | 'accent'" src/
```

---

## ЗАДАЧА 1 — Пайплайн компании считает только сделки

### Почему

`pipelineByCompany` (`src/components/companies/CompaniesTable.tsx:73-79`) суммирует `budget`
по **всем** проектам компании со `status not in ('won','lost')`. В «пайплайн» попадают
`internal` и `delivery`. `pipeline_budget` из строки таблицы читает и peek-панель
(`CompanyPeekContent:60-67`), поэтому число врёт в двух местах сразу.

### Шаги

**1.1.** В `src/components/companies/CompaniesTable.tsx` добавить импорт:

```ts
import { splitCompanyProjects, isTerminalDeal } from '@/lib/utils/company-360';
```

**1.2.** Заменить блок (строки ~74-79):

```ts
    const pipelineByCompany: Record<string, number> = {};
    (allProjects ?? []).forEach((p) => {
      if (p.company_id && p.status !== 'won' && p.status !== 'lost') {
        pipelineByCompany[p.company_id] = (pipelineByCompany[p.company_id] ?? 0) + (p.budget ?? 0);
      }
    });
```

на:

```ts
    // Пайплайн — только продажи (`type='client'`). Внедрения и внутренние проекты
    // имеют бюджет, но он не «в открытых сделках»: до правки «Ориент продактс»
    // показывала 22.0M вместо 11.0M за счёт `Пресейл Ориент` (type='internal').
    // Критерий один и тот же с карточкой 360 — `splitCompanyProjects`, не своя проверка.
    const pipelineByCompany: Record<string, number> = {};
    splitCompanyProjects(allProjects ?? []).deals.forEach((p) => {
      if (p.company_id && !isTerminalDeal(p.status)) {
        pipelineByCompany[p.company_id] = (pipelineByCompany[p.company_id] ?? 0) + (p.budget ?? 0);
      }
    });
```

**1.3.** Формулировка пустого пайплайна (`CompanyPeekContent.tsx:66`): строка
`Без открытых сделок` стоит сразу под сводкой вида `1 сделка · 1 внедрение · 0 контактов`
и читается как отрицание строки выше. Блок про деньги — должен говорить про деньги:

```tsx
          <span className="text-text-mute">0 ₽ в открытых сделках</span>
```

Если шаг 5 разведки найдёт такой же текст в `CompanyDetail.tsx` — поправить одинаково.
Если нет — не заводить.

### Проверка

```bash
npx tsc --noEmit
grep -n "splitCompanyProjects" src/components/companies/CompaniesTable.tsx
```

Визуально (на гейте / у пользователя): компания «Ориент продактс» в колонке «Пайплайн» и в
peek-панели — **11.0M ₽**, не 22.0M. У остальных компаний число не меняется (проверено SQL:
расхождение ровно одно).

---

## ЗАДАЧА 2 — `internal` перестаёт называться «внедрением» в сводке 360

### Почему

`formatCompany360Summary` печатает `1 внедрение` для проекта `Пресейл Ориент`, который
`type='internal'`. Разбиение при этом корректно (см. «Что уже проверено», п.2) — врёт
подпись. Нужен третий счётчик при сохранении двухчастного разбиения для списков.

### Шаги

**2.1.** `src/lib/utils/company-360.ts` — расширить `Company360Counts`:

```ts
export interface Company360Counts {
  deals: number;
  /** Сколько из `deals` не закрыты (не won/lost). */
  dealsOpen: number;
  /** Только `type='delivery'` — то, что действительно внедрение. */
  deliveries: number;
  /** `type='internal'` — пресейлы и внутренние проекты. Живут в `split.deliveries`
   *  (список на карточке их показывает), но «внедрением» не называются. */
  internal: number;
  contacts: number;
}
```

**2.2.** `countCompany360` — считать оба:

```ts
export function countCompany360<T extends ProjectLike>(
  split: CompanyProjectSplit<T>,
  contactsCount: number,
): Company360Counts {
  const internal = split.deliveries.filter((p) => p.type === 'internal').length;
  return {
    deals: split.deals.length,
    dealsOpen: split.deals.filter((d) => !isTerminalDeal(d.status)).length,
    deliveries: split.deliveries.length - internal,
    internal,
    contacts: contactsCount,
  };
}
```

**2.3.** `formatCompany360Summary` — добавить часть про внутренние проекты **только когда
их > 0** (иначе строка растёт у всех ради редкого случая):

```ts
export function formatCompany360Summary(c: Company360Counts): string {
  const dealsPart = `${c.deals} ${ruPlural(c.deals, ['сделка', 'сделки', 'сделок'])}`;
  const openPart =
    c.dealsOpen > 0 && c.dealsOpen < c.deals
      ? ` (${c.dealsOpen} ${ruPlural(c.dealsOpen, ['открыта', 'открыты', 'открыто'])})`
      : '';
  const deliveriesPart = `${c.deliveries} ${ruPlural(c.deliveries, ['внедрение', 'внедрения', 'внедрений'])}`;
  const internalPart =
    c.internal > 0
      ? ` · ${c.internal} ${ruPlural(c.internal, ['внутренний проект', 'внутренних проекта', 'внутренних проектов'])}`
      : '';
  const contactsPart = `${c.contacts} ${ruPlural(c.contacts, ['контакт', 'контакта', 'контактов'])}`;
  return `${dealsPart}${openPart} · ${deliveriesPart}${internalPart} · ${contactsPart}`;
}
```

**2.4.** Тесты (файл найти шагом 3 разведки; если тестов на `company-360` нет — завести
`src/lib/utils/__tests__/company-360.test.ts` рядом с существующей конвенцией):

- `countCompany360`: набор `[client/open, client/won, delivery/open, internal/open]` →
  `{deals: 2, dealsOpen: 1, deliveries: 1, internal: 1}`.
- `formatCompany360Summary` при `internal: 0` → строка **без** части «внутренний проект»
  (защита от роста строки у 259 компаний из 260).
- `formatCompany360Summary` при `internal: 1, deliveries: 0` →
  `1 сделка · 0 внедрений · 1 внутренний проект · 0 контактов`.
- Склонение: `ruPlural(2, [...])` и `ruPlural(5, [...])` на новых формах.

**2.5.** `splitCompanyProjects` **не трогать**. Если tsc покажет других потребителей
`Company360Counts` — дополнить их, не переписывая разбиение.

### Проверка

```bash
npx tsc --noEmit
npm test -- company-360
```

---

## ЗАДАЧА 3 — `<DealHealthDot />` вместо двух одинаковых блоков

### Почему

Один и тот же inline-стиль точки скопирован в `CompanyPeekContent.tsx:134-142` и
`CompanyDetail.tsx:233-241`. Аналог для внедрений уже вынесен —
`src/components/shared/DeliveryHealthDot.tsx`, кладём рядом и по тому же образцу.

**Важно:** статус кодируется не только цветом (заливка vs обводка) — при дейтеранопии
red↔yellow неразличимы. Сохранить `filled`/`outline` как есть, не унифицировать в «просто цвет».

### Шаги

**3.1.** Создать `src/components/shared/DealHealthDot.tsx`:

```tsx
'use client';

import type { DealHealth } from '@/lib/utils/deal-health';

// ═══════════════════════════════════════════════════════
// Точка здоровья сделки — общая разметка для списков сделок на карточке компании
// и в peek-панели. Парная к `DeliveryHealthDot` (внедрения).
// Статус кодируется заливкой/обводкой, а не только цветом: при дейтеранопии
// red↔yellow неразличимы.
//   ● заливка red  — шаг просрочен
//   ○ обводка yellow — нет следующего шага
//   'ok' — не рендерится вовсе
// ═══════════════════════════════════════════════════════

export function DealHealthDot({ health }: { health: DealHealth }) {
  if (health === 'ok') return null;
  const overdue = health === 'overdue-action';
  const title = overdue ? 'Шаг просрочен' : 'Нет следующего шага';

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
      style={overdue
        ? { backgroundColor: 'var(--red-text, var(--red))' }
        : { border: '1px solid var(--yellow-text, var(--yellow))' }}
    />
  );
}
```

Точное имя типа взять из `src/lib/utils/deal-health.ts` (`grep -n "export type\|export function getDealHealth" src/lib/utils/deal-health.ts`) — если тип не экспортирован, экспортировать его, а не дублировать union строкой.

**3.2.** В `CompanyPeekContent.tsx` заменить блок `{dh !== 'ok' && (<span … />)}` на
`<DealHealthDot health={dh} />`, импорт добавить. Условие `dh !== 'ok'` снимается — его
держит сам компонент.

**3.3.** То же в `CompanyDetail.tsx`.

**3.4.** `TodayView`, `ProjectsTable`, `ProjectCard`, `DealFocusPanel` — **не трогать**.
Там другая разметка (marker-объект / AttentionLine / булев флаг), это не дубли.

### Проверка

```bash
npx tsc --noEmit
grep -rn "dh !== 'ok'" src/     # должно остаться 0 совпадений
grep -rn "DealHealthDot" src/   # 3 файла: компонент + 2 потребителя
npm run lint
```

---

## ЗАДАЧА 4 — Снять касты цвета статуса лида

### Почему

`LEAD_STATUS_CONFIG` (`src/lib/validators/lead.ts:10`) типизирован как
`Record<string, { label: string; color: string }>`, из-за чего каждое место рендера кастует:
`cfg?.color as 'blue' | 'green' | 'red' | 'yellow' | 'accent'` — `LeadsView.tsx:495` и
`LeadPeekContent.tsx`. Каст обходит проверку: опечатка в палитре пройдёт компиляцию и
свалится в `colorStyles[color]` как `undefined`.

### Шаги

**4.1.** `src/components/ui/Badge.tsx:4` — экспортировать тип:

```ts
export type BadgeColor = 'green' | 'red' | 'blue' | 'yellow' | 'purple' | 'accent';
```

**4.2.** `src/lib/validators/lead.ts` — импорт **только типа** (runtime-связи lib → components
не возникает, `import type` стирается при компиляции):

```ts
import type { BadgeColor } from '@/components/ui/Badge';

export const LEAD_STATUS_CONFIG: Record<string, { label: string; color: BadgeColor }> = {
```

Ключ оставить `string`, не сужать до `LeadStatus`: `lead.status` приходит из БД как `string`,
сужение сломает индексацию у всех потребителей.

**4.3.** Снять оба каста:

```tsx
// LeadsView.tsx:495
return <Badge color={cfg?.color} size="sm">{cfg?.label ?? l.status}</Badge>;
```

`color` у `Badge` опционален с дефолтом `'blue'`, поэтому `undefined` при неизвестном статусе
отрабатывает корректно. То же в `LeadPeekContent.tsx`.

**4.4.** Если `import type` из `components/` в `validators/` конфликтует с правилом ESLint на
границы слоёв — вынести `BadgeColor` в `src/lib/types/badge.ts` и импортировать оттуда в оба
места. Проверить: `npm run lint` не должен дать новых ошибок.

### Проверка

```bash
npx tsc --noEmit
grep -rn "as 'blue' | 'green'" src/   # 0 совпадений
npm run lint
```

---

## ЗАДАЧА 5 — Peek не остаётся открытым под модалкой лида

### Почему

«Открыть полностью» из peek лида ведёт на `/leads?lead=<id>`, что открывает `LeadModal`.
`PeekPanel` — `z-40`, без оверлея, на смену URL не реагирует: закрыв модалку, пользователь
видит под ней панель. `peekId` — внутреннее состояние `DataTable` (`DataTable.tsx:75`),
снаружи его закрыть нечем.

### Шаги

**5.1.** `src/components/shared/DataTable.tsx` — добавить необязательный проп:

```ts
  /** Принудительно закрыть peek (модалка поверх страницы: панель под ней не нужна). */
  peekSuppressed?: boolean;
```

и эффект рядом с объявлением `peekId`:

```ts
  useEffect(() => {
    if (peekSuppressed) setPeekId(null);
  }, [peekSuppressed]);
```

**5.2.** `src/components/leads/LeadsView.tsx` — передать в `DataTable`:

```tsx
peekSuppressed={modalOpen || convertLead !== null}
```

(имена состояний сверить: `modalOpen`, `convertLead` — из того же файла.)

**5.3.** Остальные потребители `DataTable` (`ProjectsTable`, `ContactsTable`, `CompaniesTable`)
проп не передают — поведение не меняется. Проверить, что дефолт `undefined` не гасит peek.

**5.4. (опционально, 🟢)** `clearLeadParam` (`LeadsView.tsx:427-429`) и второй
`router.replace('/leads', …)` в эффекте (~строка 450) делают RSC round-trip: `/leads` —
dynamic-страница, App Router сходит за payload **прежде** чем поменять URL. Для правки query
без навигации Next 15 официально поддерживает `window.history.replaceState`, и
`useSearchParams` на него реагирует:

```ts
const clearLeadParam = useCallback(() => {
  if (leadParam) window.history.replaceState(null, '', '/leads');
}, [leadParam]);
```

**Это единственный шаг спринта, который обязателен к браузерной проверке**: если
`useSearchParams` не обновится, `leadParam` останется непустым и `handledLeadParam` заблокирует
повторное открытие по той же ссылке. Проверить сценарий: открыть `/leads?lead=<id>` → закрыть
модалку → URL стал `/leads` → перейти по той же ссылке снова → модалка открылась.
**Если не сработало — откатить 5.4, оставить `router.replace`** (5.1–5.3 от этого не зависят).

### Проверка

```bash
npx tsc --noEmit
grep -n "peekSuppressed" src/components/shared/DataTable.tsx src/components/leads/LeadsView.tsx
npm test
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint            # сравнить с baseline 15 errors / 34 warnings
npm test                # baseline 576 + новые из ЗАДАЧИ 2
# dev-сервер остановить, build — последним
npm run build
```

В отчёт вынести отдельно:

- новые/изменённые тесты и их количество;
- дельту lint к baseline (если 0 новых — так и написать);
- какие шаги **не** выполнены и почему (особенно 5.4, если откатили);
- результат браузерной проверки 5.4 — либо «проверено, работает», либо «не проверял».

---

## КОММИТ

```bash
git add .
git commit -m "fix(companies): пайплайн только по сделкам, internal не «внедрение», DealHealthDot

- pipelineByCompany считает splitCompanyProjects().deals — Ориент продактс 22.0M → 11.0M
- Company360Counts: отдельный счётчик internal, сводка не зовёт пресейл внедрением
- DealHealthDot вынесен из CompanyPeekContent и CompanyDetail
- LEAD_STATUS_CONFIG.color: BadgeColor вместо string, сняты два каста
- DataTable.peekSuppressed: peek закрывается под модалкой лида"
```

**Не мержить.** Ветку оставить, отчёт принести на гейт.

---

## Что НЕ входит в спринт (и почему)

| Хвост | Решение |
|---|---|
| **#5 колонка «Телефон» через `phones[]`** | Не воспроизводится: `CompanyModal:89-91` зеркалит primary в `phone` на каждой записи, в проде 0 строк «массив без legacy». Колонка редактируемая и пишет в `phone` — чтение из массива при записи в колонку завело бы расхождение. Возвращаться, только если появится путь записи мимо модалки (импорт, вебхук, прямой SQL); правильный фикс тогда — триггер БД, а не правка рендера. |
| **#1 калибровка порогов dwell** | Ждёт статистики в `stage_transitions` (5 строк с 27.07). |
| **#3 удаление `suggest_spawn`** | Ждёт первой живой победы с кликом/некликом по уведомлению. |
| Прочие 4 потребителя `getDealHealth` | Разные представления, а не дубли — см. «Что уже проверено», п.4. |
| Серверная пагинация `useWebhookDeliveries` | Порог пересмотра ~500 строк на endpoint, сейчас 1. |
