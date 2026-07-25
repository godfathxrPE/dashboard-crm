# Claude Code Prompt — Sprint W4: Скорость и порядок (bundle, шрифты, prefetch, распил ProjectDetail, user-scope localStorage, фокус-трап, разгребание «Сегодня»)

Контекст: по ревью 2026-07-18, §P2. Полностью клиентский спринт, миграций нет. Параллелится с W3, но НЕ мержить одновременно с ним в одних файлах (пересечения: TodayView, layout). Задачи независимы — можно резать на 2 PR: (A) перфоманс = задачи 1–3, (B) UX/порядок = задачи 4–7.

## РАЗВЕДКА

```bash
grep -rn "dynamic(" src | head                        # ожидаем: ни одного
grep -n "import.*xlsx" src/components/companies/ExcelImport.tsx
grep -n "GanttTimeline" src/components/projects/ProjectDetail.tsx
grep -n "import" src/app/\(dashboard\)/layout.tsx | head -20   # статические модалки в shell
grep -n "Geist\|Manrope\|IBM_Plex\|Onest\|Unbounded" src/app/layout.tsx
grep -rn "var(--font-" src/app/globals.css | sort -u   # какие семейства реально едят темы
wc -l src/components/projects/ProjectDetail.tsx        # ~912
grep -n "useState" src/components/projects/ProjectDetail.tsx | wc -l   # ~16
grep -rn "localStorage" src/lib/hooks/use-saved-views.ts src/components/today/TodayFocus.tsx src/components/widgets/TasksSidebar.tsx src/lib/stores/*.ts | grep -v getItem- | head
grep -n "role=\"dialog\"\|aria-modal\|focus" src/components/shared/Modal.tsx
grep -n "На завтра" src/components/today/QueueRow.tsx src/components/today/TodayView.tsx
grep -n "RECONNECT_THRESHOLD" src/lib/constants/reconnect.ts src/lib/hooks/use-last-touch.ts
```

## ЗАДАЧА 1: Dynamic imports — самый дешёвый выигрыш спринта

1. **xlsx** (~250КБ gzip уезжает из чанка /companies): в `ExcelImport.tsx` убрать топ-импорт, внутри обработчика файла: `const XLSX = await import('xlsx');`. Экспорт-утилиты (если тоже тянут xlsx) — тем же способом.
2. **GanttTimeline** (849 строк, грузится даже без открытия вкладки): в `ProjectDetail.tsx` → `const GanttTimeline = dynamic(() => import('@/components/tasks/GanttTimeline').then(m => m.GanttTimeline), { ssr: false, loading: () => <спиннер вкладки> })`.
3. **Модалки shell**: в `(dashboard)/layout.tsx` — `GlobalModals` и `QuickActionModals` через `next/dynamic({ ssr:false })` (открываются по хоткею — первому чанку не нужны). `CommandPalette` оставить статически (⌘K должен открываться мгновенно; его данные уже ленивые после W3).
4. **Recharts**: `DashboardHome` — чарты уже выделены в подкомпоненты; вынести чарт-блоки в `next/dynamic({ ssr:false })` (KPI-карточки остаются статикой). `/analytics` — аналогично для `Charts.tsx`/`CallsChart.tsx`.

## ЗАДАЧА 2: Шрифты — оставить то, что реально используют темы

По разведке `var(--font-*)` в globals.css составить фактическую карту тема→семейство. Ожидание (сверить!): Manrope (дефолт `--font-app`), Onest (t-aura), IBM Plex Sans (t-fuji); Geist Sans/Mono и Unbounded — проверить, есть ли живые потребители. В `src/app/layout.tsx`: убрать неиспользуемые семейства целиком, у оставшихся срезать веса до фактически используемых (grep font-weight/font-bold по темам). Каждое убранное семейство — минус несколько woff2 на первом входе.

## ЗАДАЧА 3: Prefetch на 3 тяжёлых экрана

Тайм-бокс (grok-ревью: самая трудоёмкая задача PR-а): **первым заходом — только `/` (Сегодня)**; `/overview` и `/deals` — вторым коммитом внутри W4a, если первый лёг чисто. В серверном `page.tsx` — `prefetchQuery` ключевых данных + `<HydrationBoundary state={dehydrate(qc)}>`. Серверный Supabase-клиент уже есть (`lib/supabase/server.ts`); префетчить РОВНО те queryKey/queryFn, что у клиентских хуков (вынести queryFn в шареные функции, принимающие клиент параметром — иначе ключи разойдутся и префетч бесполезен). Не переписываем на RSC — только гидрация первого экрана. Метрика: первый контент без спиннера.

## ЗАДАЧА 4: Распил ProjectDetail (912 строк, 16 useState)

Цель: `ProjectDetail.tsx` ≤ 250 строк-оркестратор. Вынести в `src/components/projects/detail/`:
- `DealHeader.tsx` — шапка (название, health, Выиграна/Проиграна, edit/delete);
- `StagePanel.tsx` — StackedPipeline/DealProgressBar + гейт-баннер + StageReadiness;
- `DealInfoGrid.tsx` — карточки Компания/Контакт/Бюджет/Дедлайн;
- вкладки уже есть компонентами (EntityTimeline, доска, Gantt, QuotesTab) — оркестратор только переключает.
Состояние вкладки — в URL `?tab=` по образцу `ProjectsSection.tsx` (`router.replace`, `useSearchParams` + `<Suspense>` в page.tsx — проверить, есть ли уже). Модалки/локальные useState — спустить в те подкомпоненты, где используются. Поведение 1:1, никакой новой логики; после каждого выноса — `npx tsc --noEmit`.

## ЗАДАЧА 5: localStorage — user-scope + один «фокус дня»

1. Хелпер `src/lib/utils/user-storage.ts`: `userKey(base: string, userId: string)` → `${base}:${userId}`; чтение с миграцией (нет scoped-ключа, есть legacy → перенести и удалить legacy).
2. Перевести: `saved-views` (`use-saved-views.ts:16`), фокус дня, `dashboard-ui` (ui-store persist). `dashboard-theme` оставить глобальным (тема — свойство браузера, ок).
3. Слить две независимые фичи «фокус дня»: `TodayFocus` (`focus-<date>`) и `TasksSidebar` (`focus-day-<date>`) → один ключ `focus:<userId>:<dateKey>`, единый мини-хук `useDayFocus(dateKey)`; при записи чистить ключи старше 30 дней (сейчас копятся вечно).
4. userId брать из `useAuth()` (см. `lib/hooks/use-auth.ts`); до загрузки auth — не читать storage (иначе мигрируем в ключ undefined).

## ЗАДАЧА 6: Modal — фокус-трап

`src/components/shared/Modal.tsx` (кастомный шелл, НЕ Radix): при открытии — фокус на первый фокусируемый элемент (или контейнер с `tabIndex={-1}`); Tab/Shift+Tab циклится внутри (мини-трап руками, без либы — списком фокусируемых по селектору); при закрытии — фокус возвращается на элемент-триггер (сохранить `document.activeElement` при open); `aria-labelledby` на заголовок (сейчас только `aria-label` крестика). Esc/scroll-lock/isDirty-guard уже есть — не трогать. Проверить на вложенных модалках (AiWorkspaceModal поверх деталки): трап держит верхнюю.

## ЗАДАЧА 7: «Сегодня» перестаёт быть свалкой + порог «Остывают»

Скриншот-факты ревью: задачи «в работе» с дедлайнами 5 апреля висят 3 месяца, в «Следующие» 141 штука; «Остывают 84 из 87» — сигнал мёртв после импорта базы без истории касаний.

1. **Snooze-меню вместо одного «На завтра»** в `QueueRow` (звонки/задачи): «Завтра · Понедельник · +неделя» (дропдаун на существующей secondary-кнопке; мутации — существующие optimistic-хуки, меняется только вычисление даты; date-математика через date-helpers, не руками).
2. **Bulk-разгребание**: в секции «Задачи в работе» при наличии просроченных — строка-действие «Просроченные (N): перенести все на завтра · в Следующие» (одна мутация циклом по существующему useUpdateTask — или `useReorderTasks`-паттерн, если удобнее батчем).
3. **Порог входа в «Остывают»**: контакт попадает в секцию/фильтр «остывают» только если у него было ≥1 касание (`last_touch_kind` есть, но старше порога). Контакты без единого касания — отдельное состояние «не в работе», в TodayView НЕ показываются (в ContactsTable — отдельный чип-фильтр «Без касаний»). Логика — в `touchLevel()` (`use-last-touch.ts`), потребители не меняются. ЖЁСТКАЯ зависимость: только ПОСЛЕ мержа W3 (там `use-last-touch` переезжает на view `contact_last_touch` — семантику меняем один раз, поверх view, а не дважды).
4. Счётчик секции «Остывают N» → ссылка «все N» на `/contacts?f=cooling` (чип-фильтр уже URL-backed через use-chip-filter — проверить ключ фильтра).

## ЗАДАЧА 8 (гигиена, 30 минут): мёртвый код + линт в CI

1. Удалить (перед удалением подтвердить ноль импортов grep'ом): `src/app/(dashboard)/dashboard-content.tsx`, `src/hooks/useWatermark.ts` (+ папка `src/hooks/`, если пуста), `src/lib/hooks/use-watermark-hover.ts`.
2. `package.json`: в `"build"` добавить `next lint &&` ИЛИ отдельный CI-шаг; `next.config.ts` `eslint.ignoreDuringBuilds` → `false` (после того как `npm run lint` чистый). Стоп-правило: если разгрести lint-долг — больше ~часа работы, НЕ чинить в этом спринте — оставить `ignoreDuringBuilds: true`, вынести lint отдельным необязательным CI-джобом и завести задачу; расширять скоуп W4b из-за линта нельзя.

## ПРОВЕРКА

```bash
npx tsc --noEmit && npx vitest run && npm run lint
npx next build 2>&1 | tail -30   # сравнить размеры чанков /companies, /overview, деталки проекта до/после — зафиксировать в PR
grep -rn "dashboard-content\|useWatermark" src | wc -l   # 0
```

Ручной смоук: ⌘K открывается мгновенно; вкладка «Гант» показывает лоадер и грузится; импорт Excel работает (ленивый xlsx); переключение аккаунта в одном браузере не показывает чужие saved views/фокус; Tab в модалке не уходит под оверлей; в «Сегодня» у просроченных работают snooze и bulk; «Остывают» показывает только реально остывших.

## КОММИТ

Двумя PR (перф отдельно от UX — проще откатывать):

```bash
git commit -m "Sprint W4a: перфоманс — dynamic import (xlsx/Gantt/модалки/charts), шрифты по темам, prefetch+Hydration на /, /overview, /deals"
git commit -m "Sprint W4b: порядок — распил ProjectDetail, user-scope localStorage + единый фокус дня, фокус-трап Modal, snooze/bulk на Сегодня, порог Остывают, мёртвый код, lint в билд"
```

---

## ПОПРАВКИ ПО РЕВЬЮ GROK 7.5/10 + РЕШЕНИЯ COWORK (2026-07-18, сверено с main f9a9bbb)

### СОСТАВ ЗАПУСКА: W4a = ТОЛЬКО задачи 1–2. Задача 3 (prefetch) ИСКЛЮЧЕНА из W4a.
Prefetch до W3-scale = префетч org-fetch ключей, которые W3 поменяет (Grok W3: «ключи разъедутся»). W3 отложен до сигнала команды → prefetch уезжает в пакет W3, не делать сейчас. W4b (задачи 4–7) — строго ПОСЛЕ W3 + фикса B1 (см. ревью: фильтры «Остывают» продублированы в TodayView:119 и ContactsTable:29, «потребители не меняются» — ошибка промпта).

### Дрейф чисел с момента написания (ревью было @ b483b79):
- DashboardHome: 853 → **802 LOC** (похудел в W2), recharts по-прежнему top-level (import до :29, чарты inline).
- ProjectDetail: 912 → **932 LOC** (вырос в S-IA-DELIVERY-1: +context-проп, +derived activeTab, +delivery-модалка). Цифры распила W4b пересчитать на заходе W4b.
- `dynamic(` — по-прежнему 0. `ignoreDuringBuilds: true` — не трогать (lint Errors > 0, stop-rule).
- **Деплой теперь Vercel** (`dashboard-crm-ten.vercel.app`, auto из main) — смок после пуша там; в W4a ничего платформо-специфичного (dynamic/next-font агностичны).

### Обязательные HOW для задач 1–2 (из ревью):
1. **W1 — DashboardHome чарты НЕ выделены** (промпт ошибался «уже в подкомпонентах»): сначала extract двух chart-блоков → `OverviewCharts.tsx` (или Funnel+Volume отдельно), потом `dynamic(..., { ssr:false })`. Аналогично Analytics: `Charts.tsx`/`CallsChart.tsx` уже отдельные файлы — dynamic на странице.
2. **W8 — QuickActionModals сейчас inline в `(dashboard)/layout.tsx` L22–44** (не экспортирован): сначала extract → `components/shared/QuickActionModals.tsx`, затем dynamic. `GlobalModals` — dynamic сразу. `CommandPalette` — оставить static (lazy data — это W3).
3. **W2 — шрифты:** Unbounded НЕ удалять (живые потребители: `.t-aura h1`/`.aura-page-title` globals.css ~L964–968 + Charts.tsx L123) — можно срезать weights до 400(+700). Geist: tailwind `fontFamily.sans/mono` → geist vars + `font-mono` на kbd (CommandPalette/ContentHeader/Hotkeys/Settings) — либо оставить Geist Mono, либо переназначить `fontFamily.mono` на `ui-monospace` С правкой tailwind.config.ts + globals.css L6–7. Не «убрать семейство целиком» без этих правок.
4. **xlsx** (~250КБ): убрать топ-импорт ExcelImport.tsx:6 → `const XLSX = await import('xlsx')` в обработчике. **GanttTimeline** (849): dynamic в ProjectDetail с loading-спиннером вкладки. NB: после S-IA-DELIVERY-1 рендер табов идёт по `activeTab` — dynamic-обёртку ставить на сам импорт компонента, логику activeTab не трогать.
5. **Коммит:** явный список файлов (не add -A). PR-описание: chunk sizes before/after (`next build` tail).
6. **Смоук после деплоя на Vercel:** ⌘K открывается мгновенно; вкладка «Гант» показывает loader и грузится; импорт Excel работает; чарты «Обзора» рендерятся (dynamic); aura-тема H1 не потеряла Unbounded; kbd-моно не сломан.
