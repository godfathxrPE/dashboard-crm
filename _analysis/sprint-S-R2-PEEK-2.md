# S-R2-PEEK-2 — Peek для компаний и лидов + два хвоста

**Ветка:** `feat/r2-peek-2` от `main` (`a0eae8b`). **Миграций нет.** Один коммит.

R2-P2 «Team scale», спринт 1 — первый из кластера «дешёвые хвосты». Эпик **F5** из
`improvements/CRM-ROADMAP-2.md` §5 плюс два попутных дефекта, найденных разведкой.
Порядок фазы и обоснование — `claude/review-R2-P2-entry-reconciliation.md`.

**Трудоёмкость: ~4–5 ч. Риск низкий** — новых запросов нет, схема не трогается,
`PeekConfig` не меняется.

**Ревью Грока нет** (лимиты) — секция «Самопроверка» обязательна.

---

## Что разведка изменила против плана эпика

**1. Движок готов целиком, писать нечего — только контент.** `PeekPanel.tsx` (88 строк) и
проп `peek` в `DataTable` работают в проде на projects и contacts: j/k-навигация, Space =
toggle, Escape, «peek следует за фокусом», арбитраж между таблицами через модульную
`activeKbdTable`. Оба целевых компонента уже используют тот же `DataTable`, просто без пропа:
`CompaniesTable.tsx:283`, `LeadsView.tsx:606`.

**2. `PeekConfig` живёт в `DataTable.tsx:31-35`, а не в `PeekPanel`:**

```ts
export interface PeekConfig {
  title: string;
  href: string;      // ← обязателен
  content: React.ReactNode;
}
```

**3. Агрегаты по компании уже посчитаны.** `CompaniesTable.tsx:25-30` строит
`CompanyRow = Company & { contacts_count, projects_count, pipeline_budget, last_touch }` в
`useMemo` (49-96). В peek эти значения приходят готовыми в `item` — считать заново нельзя,
это был бы второй источник истины.

**4. Company 360 уже влит в `main`** (`a0eae8b`). `src/lib/utils/company-360.ts` экспортирует
`splitCompanyProjects`, `countCompany360`, `formatCompany360Summary`, `isTerminalDeal` — и
`CompanyDetail.tsx:91-93` считает сводку **из кеша `useProjects()`, без своих запросов**. Peek
компании должен показывать ту же строку сводки тем же кодом, иначе появится второе,
расходящееся представление «360».

**5. Страницы лида не существует** — роута `leads/[id]` в `src/app` нет, клик по строке
открывает `LeadModal` (`LeadsView.tsx:610` → `handleEdit` 410-413). Обязательный `href` для
лида взять негде. Решение — ниже, это единственная развилка спринта.

---

## Развилка: href для peek лида

Три варианта, взят третий.

| Вариант | Почему нет / да |
|---|---|
| Сделать `href` опциональным в `PeekConfig` | Правка shared-типа с 3 потребителями ради одной сущности; «Открыть полностью» молча исчезает — пользователь не понимает, почему у лида кнопки нет |
| Завести страницу `leads/[id]` | Это не хвост, а новая сущность в навигации: роут, layout, права, хлебные крошки. Вне scope дешёвого спринта |
| **Deep link `/leads?lead=<id>`, открывающий `LeadModal`** ✅ | `PeekConfig` не трогаем; прецедент в проекте есть (`ProjectDetail.tsx:184-196`, `?spawn=1` / `?ai=1`); побочная польза — лид становится адресуемым, ссылку можно переслать |

«Полная карточка» лида — это и есть `LeadModal`; отправлять на неё честнее, чем прятать кнопку.

---

## 1. `CompanyPeekContent` (новый файл)

`src/components/companies/CompanyPeekContent.tsx`. Эталон структуры и классов —
`ContactPeekContent.tsx` (статичная композиция) плюс сводка из `CompanyDetail`.

Сигнатура — принимает готовую строку таблицы, не голую `Company`:

```ts
export function CompanyPeekContent({ company }: { company: CompanyRow })
```

`CompanyRow` сейчас объявлен локально в `CompaniesTable.tsx:25-30`. **Экспортировать его
оттуда** (`export type CompanyRow = …`) и импортировать в peek-контент. Новый тип не заводить
— второе объявление тех же полей разъедется.

Состав панели, сверху вниз:

1. **Строка сводки 360** — тем же кодом, что карточка компании:
   ```ts
   const { data: allProjects } = useProjects();          // тот же кеш, что у таблицы
   const linked = (allProjects ?? []).filter((p) => p.company_id === company.id);
   const split = splitCompanyProjects(linked);
   const counts = countCompany360(split, company.contacts_count);
   // → formatCompany360Summary(counts): «2 сделки (1 открыта) · 1 внедрение · 8 контактов»
   ```
   Класс как в `CompanyDetail.tsx:169`: `text-sm text-text-dim tabular-nums`.
   ⚠️ `contacts_count` берём из `company` (готовое значение таблицы), **не** пересчитываем
   через `useContacts()` — иначе два разных числа контактов в таблице и в панели.

2. **Пайплайн-бюджет** — `formatBudget(company.pipeline_budget)`, `tabular-nums`; при нуле
   писать «без открытых сделок», а не «0 ₽».

3. **Реквизиты**: ИНН (если есть), отрасль, телефон через `formatPhone` как `<a href="tel:">`,
   email как `<a href="mailto:">`, сайт как внешняя ссылка (`target="_blank" rel="noreferrer"`).
   Пустой блок целиком — фолбэк «Нет контактных данных» (как `ContactPeekContent:51`).

4. **Касание** — три ветки ровно как `ContactPeekContent.tsx:55-67`: нет касаний / `ok` — дата
   `d MMM` / иначе `{days} дн. без касания` с `cold → text-red`, иначе `text-yellow`. Порог —
   `useReconnectDays()`, `daysSince`/`touchLevel` из `use-last-touch`.

5. **До трёх открытых сделок компании** — `split.deals.filter((d) => !isTerminalDeal(d.status))`,
   каждая ссылкой на сделку (`projectHref`), рядом `getDealHealth` точкой, как в
   `CompanyDetail.tsx:226`. Больше трёх — строка «ещё N» без ссылки.

Подключение — `CompaniesTable.tsx`, рядом с существующим `onRowClick` (287):

```tsx
peek={(c) => ({
  title: c.name,
  href: `/companies/${c.id}`,
  content: <CompanyPeekContent company={c} />,
})}
```

---

## 2. `LeadPeekContent` (новый файл) + deep link

### 2.1 Контент

`src/components/leads/LeadPeekContent.tsx`, `{ lead }: { lead: Lead }` (тип из
`src/types/database.ts:443-463`). Новых запросов нет — все поля в строке.

1. **Статус и источник** — `Badge` через существующие `LEAD_STATUS_CONFIG` /
   `LEAD_SOURCE_CONFIG` (те же, что `LeadCard` и колонки таблицы). Свои цвета не изобретать.
2. **Направление** — `Badge` ERP/IIoT, как `LeadCard:119-126`.
3. **Сырые поля**: `company_name_raw`, `contact_name_raw`, `phone` через `formatPhone`
   (`<a href="tel:">`), `email` (`<a href="mailto:">`). Пусто — «Данные не заполнены».
4. **Возраст** — `leadStaleness(lead)` из того же модуля, что использует `LeadCard:150-173`,
   с тем же `title`-объяснением («Дней без первого касания» / «Дней без движения») и той же
   ○/● семантикой. Второй расчёт возраста не писать.
5. **Причина дисквалификации** — если `disqualify_reason` заполнен, рендерить через
   `DISQUALIFY_REASON_CONFIG` (`LeadCard:175-196`).
6. **`notes`** — если есть, последним блоком, `line-clamp-3`.

Подключение — `LeadsView.tsx` рядом с `onRowClick={handleEdit}` (610):

```tsx
peek={(l) => ({
  title: l.title,
  href: `/leads?lead=${l.id}`,
  content: <LeadPeekContent lead={l} />,
})}
```

### 2.2 Deep link `?lead=<id>`

В `LeadsView` (образец — `ProjectDetail.tsx:184-196`):

- `const searchParams = useSearchParams();`
- начальное состояние: если `searchParams.get('lead')` совпал с лидом из списка — открыть
  `LeadModal` на редактирование этого лида;
- реакция на смену параметра (навигация назад/вперёд) — эффект по значению параметра, как
  `spawnParam` / `aiParam` в эталоне;
- при закрытии модалки, если параметр стоит, снять его: `router.replace('/leads', { scroll: false })`.

**Edge cases, каждый обязателен:**

| Случай | Поведение |
|---|---|
| `?lead=<id>` конвертированного лида | `useLeads()` фильтрует `status='converted'` (`use-leads.ts:13-23`) → лида в списке нет. Модалку не открывать, параметр снять молча. Не падать и не показывать пустую модалку |
| `?lead=<мусор>` / несуществующий id | То же: тихо снять параметр |
| Данные ещё грузятся (`isLoading`) | Дождаться списка, только потом решать. Не снимать параметр раньше загрузки — иначе ссылка «не работает при холодном заходе» |
| `view === 'kanban'` (дефолт) | Модалка открывается независимо от вида — вид не переключать |

⚠️ **`useSearchParams` в Next 15 App Router требует Suspense-границы** при статическом
рендере. Проверить `src/app/(dashboard)/leads/page.tsx`: если билд выдаст
`useSearchParams() should be wrapped in a suspense boundary` — обернуть `<LeadsView />` в
`<Suspense>`. Ловится только `npm run build`, не `tsc`.

---

## 3. Хвост: подсказка порога в `RuleEditorModal`

Пункт 6 из `claude/backlog-r2-p1-tails.md`: подсказка `min_days` не видна, потому что поле
всегда предзаполнено, а `placeholder` рендерится только на пустом.

Факт из разведки — расхождение реальное:
`RuleEditorModal.tsx:215` `dwellHint = dwellThresholds.default ?? AUTOMATION_DWELL_MIN_DAYS`
уходит в `placeholder` (438), а предзаполняется **жёсткая 14**: `:156` (`emptyDefaults`) и
`:71` (fallback при редактировании).

**Что делать:** перенести норматив из `placeholder` в видимую строку под полем — рядом с
существующим пояснением (444-449):

> Норматив организации — N дн.

Рендерить только когда `dwellThresholds.default` задан и **не равен** текущему значению поля
(иначе строка — шум). `placeholder` оставить как есть.

**Чего НЕ делать:** не подставлять `dwellThresholds.default` в `emptyDefaults` вместо 14.
Комментарий `:212-214` фиксирует осознанное решение — «СВЯЗКИ НЕТ: норматив бейджа и порог
правила независимы». Предзаполнение нормативом эту связку и создаёт: правило начнёт молча
ездить за настройкой org. Показать норматив ≠ применить его.

---

## 4. Хвост: `any` и сырой `event_type` в `ActivityDrawer`

`src/components/layout/ActivityDrawer.tsx:261` рендерит:

```tsx
(entry as any).project?.name ?? entry.event_type
```

Два дефекта: запрещённый контрактом `any` и сырой `event_type` в UI («ai_summary_generated»
пользователю). Причём `useRecentActivity` (`use-activity-log.ts:38-56`) уже возвращает
типизированное `ActivityLog & { project?: { id: string; name: string } | null }`, а
`describeEvent` (`activity-events.ts`) уже умеет все 13 живых типов.

**Правка:** снять `as any` (тип уже есть), текст события брать из `describeEvent(entry)`, имя
проекта оставить второй строкой/меткой, если оно есть. `describeEvent` не менять.

---

## Тесты

Тестов на peek в проекте **ноль** (`grep -rin peek tests/` пуст). Прецедент компонентных
тестов есть: `tests/unit/modal-guard.test.tsx`, `spawn-wizard.test.tsx`,
`notification-deal-won.test.tsx`.

1. `tests/unit/company-peek.test.tsx` — рендер `CompanyPeekContent`: (а) компания со сделками
   и внедрениями → строка сводки совпадает с `formatCompany360Summary` на тех же counts;
   (б) `contacts_count` в панели равен переданному в `company`, а не длине списка контактов;
   (в) `pipeline_budget = 0` → «без открытых сделок», не «0 ₽»; (г) пустые реквизиты →
   единый фолбэк.
2. `tests/unit/lead-peek.test.tsx` — рендер `LeadPeekContent`: (а) лид без телефона/почты →
   фолбэк; (б) `disqualify_reason` рендерится человеческой формулировкой; (в) возраст берётся
   из `leadStaleness` (мокнуть дату — `Date` в тестах фиксируется, см. существующие тесты
   с датами, напр. `stage-aging.test.ts`).
3. Deep link: чистую функцию решения не выносить ради теста, если её нет. Достаточно проверить
   руками (пункт 3 смоука ниже).

---

## Смоук (клики делает Олег, результат читает Cowork)

Браузерные клики через CDP этот UI не принимает (`<button type="button">` с React-обработчиком
не реагирует) — смоук ручной.

1. `/companies`, фокус на строке, **Space** → панель справа; в ней сводка совпадает с тем, что
   показывает `/companies/<id>`. **j/k** внутри открытой панели листает содержимое по строкам.
2. Компания без сделок и без контактов — панель открывается, фолбэки на месте, «0 ₽» нигде нет.
3. `/leads`, Space на строке → панель; «Открыть полностью» → URL `?lead=<id>`, открылась
   модалка того же лида. Закрыть → параметр из URL ушёл.
4. Открыть `/leads?lead=<id конвертированного лида>` прямой ссылкой → страница грузится,
   модалка не открывается, ничего не падает, параметр снят.
5. Настройки → автоматизации → правило с триггером «Дней на стадии»: строка «Норматив
   организации — N дн.» видна при значении, отличном от норматива, и отсутствует при равном.
   (`organizations.settings` сейчас `{}` → норматив = дефолт; чтобы проверить обе ветки,
   выставить `stage_dwell_defaults` в настройках org.)
6. Панель активности (ActivityDrawer) — вместо `ai_summary_generated` человеческий текст.
7. Escape в панели закрывает её; Escape в поле ввода внутри панели — **не** закрывает
   (`PeekPanel.tsx:35-42`, регресс-проверка).

---

## Самопроверка (обязательна, ревью Грока нет)

Пройти по каждому пункту и ответить в отчёте:

1. **Второй источник истины.** Не пересчитывается ли в peek то, что уже посчитано в
   `CompaniesTable` (`contacts_count`, `projects_count`, `pipeline_budget`, `last_touch`)?
   Любой самостоятельный `useContacts().filter(...)` в контенте — ошибка.
2. **Новые запросы.** `useProjects()` в `CompanyPeekContent` берёт тот же ключ кеша, что
   таблица? В Network при открытии панели новых запросов быть не должно.
3. **`PeekConfig` не тронут.** Тип в `DataTable.tsx:31-35` совпадает с `main` дословно.
4. **Deep link не ломает kanban.** Дефолтный вид `/leads` — kanban; параметр вида не меняет.
5. **Suspense.** `npm run build` прошёл без предупреждения про `useSearchParams`.
6. **`any`.** `grep -rn "as any" src/components/layout/ActivityDrawer.tsx` пуст.
7. **Предзаполнение `min_days` не изменено** — `:156` по-прежнему `14`, тронута только
   отображаемая подсказка.
8. **Не «доводить до конвенции».** `LEAD_STATUS_CONFIG`, `DISQUALIFY_REASON_CONFIG`,
   `leadStaleness`, `touchLevel`, `describeEvent` переиспользуются как есть, не
   переписываются под peek.

---

## VERIFY / коммит

```bash
npx tsc --noEmit
npm test
npm run lint
npm run build      # последним, при остановленном next dev
```

Коммит: `feat(peek): предпросмотр компаний и лидов + подсказка порога и типизация ленты`

Ветка `feat/r2-peek-2`. Мерж и пуш — Олег. Миграций нет, гейт только по дифу.

```
Type Safety:            [заполнить]
RLS Coverage:           NOT_APPLICABLE (схема и политики не трогаются)
Backward Compatibility: [заполнить — peek на projects/contacts, клик по строке лида, таблица компаний]
Runtime Tested:         [заполнить — пункты 1–7 смоука]
Regional Availability:  NOT_APPLICABLE
```

## Что НЕ делает Claude Code

- Не пишет миграций.
- Не правит `supabase.gen.ts` / `database.ts` руками.
- Не читает `.env`.
- Не заводит роут `leads/[id]` — это отдельное решение вне scope.
- Отчёт — отчётом о сделанном, не планом с распределением ответственности.
