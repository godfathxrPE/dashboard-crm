# Ревью: sprint-delivery-p1-ux-fixes.md

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `0463596`, schema/architecture/learnings crm-architect, git history)  
**Объект:** `_analysis/sprint-delivery-p1-ux-fixes.md` — UI-фиксы delivery P1 (won-список + подсветка spawn CTA / выбора шаблона)  
**Контекст:** после delivery P1 (`8706399`, `4c1f2ad`); файл спринта от 2026-07-11 10:12; коммит-фикс `005bf20` от 2026-07-11 10:22; позже S-WIN-WIZARD-1 (`b8999fa`) заменил инлайн-панель на `SpawnWizard`

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Фикс 1: collapsible WonDeals | ✅ Уже в коде (`WonDeals.tsx`, `005bf20`) |
| Фикс 2: primary CTA spawn | ✅ Уже в коде (`ProjectDetail.tsx:388-393`) |
| Фикс 3: акцентные kind-кнопки | ✅ Было в `005bf20`; UI эволюционировал в `SpawnWizard` |
| Актуальность путей / строк | ❌ Устарели (инлайн `WonDeals`, ~:482, ~:541) |
| РАЗВЕДКА / D1-формат | 🟡 Частично (grep StageBoard есть, полного блока нет) |
| SQL / RLS / типы | ✅ N/A (UI-only, корректно) |
| Безопасность повторного запуска в CC | ❌ Регресс-риск / no-op на устаревшей карте |

**Оценка: 3/10 как исполняемый промпт сегодня.** Как дизайн фиксов на 2026-07-11 — был здоровый и уже применён.  
**Рекомендация:** **не запускать в Claude Code.** Спринт выполнен; повторный прогон по устаревшим якорям опасен (может «чинить» несуществующую панель или дублировать логику поверх Win Wizard).

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| Спринт-файл | Есть, без matching review до этого прогона |
| Коммит `005bf20` | Ancestor `HEAD`; msg = заявленный commit sprint’а |
| `WonDeals` collapsible | ✅ `src/components/projects/WonDeals.tsx` (110 строк) |
| CTA «Создать проект внедрения» | ✅ `bg-accent … text-white` (не outline) |
| Выбор шаблона launch/experiment | ✅ Не инлайн в ProjectDetail; `SpawnWizard` (modal, kind cards + owner) |
| Branch context спринта (`feat/aura-theme`) | Фикс есть и на `main`, и на `feat/aura-theme` |

---

## С чем согласен полностью

### 1. UX-проблема won-плашки была реальной

До `005bf20` `WonDeals` был статичной строкой «Выиграно: N» (инлайн в `PipelineBoard` ~341+). Spawn живёт на карточке won-сделки (`/deals/[id]`), значит без списка до карточки не добраться. Паттерн `LostDeals` — правильный образец.

### 2. Поля данных верны

- `actual_close_date` / `updated_at` — есть в schema (`projects.actual_close_date`) и в `Project` (`use-projects.ts`).
- Join `company:companies(id, name)` уже в select списка — компания в строке списка доступна без нового запроса.
- «Не проверять наличие delivery-проекта без доп. запроса» — осознанный scope cut; `parent_deal_id` / hub — отдельные фичи (S-DEAL-HUB-1).

### 3. Primary CTA vs «Вернуть в работу»

Контраст filled accent vs outline secondary — совпадает с primary «+ Сделка» (`StageBoard` / `ProjectsTable`: `bg-accent text-white hover:opacity-90`). Токен `on-accent` в коде почти не используется (коммент в `globals.css`); `text-white` — принятый паттерн.

### 4. UI-only, без миграций

`Type Safety: WARNING | RLS: N/A | Backward Compat: PASS` — адекватно. Нет SQL, нет client DELETE, нет `flowType`, CSS-переменные/utility-классы темы — ок для crm-architect checklist.

### 5. StageBoard / PipelineBoard — один компонент

Оба уже: `import { WonDeals } from './WonDeals'` и `<WonDeals projects={grouped.won ?? []} />` (`PipelineBoard.tsx:674`, `StageBoard.tsx:495`). Отдельный won-блок в StageBoard **не** нужен — shared file.

---

## Блокеры (критично — исправить до запуска)

### B1. Спринт уже выполнен — повторный запуск запрещён

Коммит **`005bf203`** (2026-07-11 10:22), message:

> `fix(delivery): won-сделки раскрываемым списком в воронке + подсветка spawn CTA и выбора шаблона`

Файлы тогда: `WonDeals.tsx` (новый), `PipelineBoard`, `StageBoard`, `ProjectDetail`.  
Diff CTA/kind в ProjectDetail **байт-в-байт** совпадает с фрагментами спринта (`bg-accent … text-white`, `border-accent/50 bg-accent-l/60`, hint «Полный запуск — … · Эксперимент — пилот»).

Текущий `WonDeals.tsx` реализует **весь** Фикс 1: `useState(isOpen)`, Chevron, Trophy + «Выиграно: N» + сумма, клик имени → `/deals/${id}`, компания/бюджет/дата (`actual_close_date ?? updated_at`), кнопка `<Rocket /> Проект внедрения` → `/deals/...`, green shell + строки `bg-bg border-border/50`. Плюс позже `won_reason` / `won_detail` (S-WON-REASON-1).

**Действие:** пометить спринт `DONE` / архив; в CC не отдавать.

### B2. Карта файлов/строк устарела — CC «починит» несуществующее

| Утверждение спринта | Факт в `main` |
|---------------------|---------------|
| `PipelineBoard.tsx:342-356`, ф-я `WonDeals` | Инлайн-функции нет; shared `WonDeals.tsx` |
| `ProjectDetail.tsx ~:482` outline CTA | CTA ~**388–393**, уже primary |
| `ProjectDetail.tsx ~:541-549` kind-кнопки gray | Инлайн-панели нет; spawn → `setSpawning(true)` → **`SpawnWizard`** (~866–877) |
| Контекст «после 4c1f2ad + 8706399» | Верно исторически; с тех пор Win Wizard, Deal Hub, won_reason, Gantt… |

Если CC применит Фикс 3 «как написано», он будет искать gray `border-border text-text-dim` кнопки в `ProjectDetail` — **grep не найдёт**. Риск: правка не тех кнопок, дублирование UI, ломка `SpawnWizard`.

### B3. Фикс 3 семантически закрыт другим UI

`SpawnWizard.tsx` уже:

- акцентный primary «Создать внедрение»;
- kind-карточки с `border-accent bg-accent-l/50` при active;
- описания «Полный запуск — весь цикл…» / «Пилот / эксперимент…»;
- ERP-only `launch` (D1-ловушка пустого experiment);
- owner / RPC `spawn_delivery_project` с `p_owner_id`.

Переписывать kind-кнопки «по спринту» = откат к более бедному инлайн-UX.

---

## Предупреждения (желательно учесть)

### W1. Слабая РАЗВЕДКА

Есть только `grep -n "Выиграно" …StageBoard.tsx`. Нет гейта «если collapsible уже есть — STOP», нет проверки ProjectDetail/SpawnWizard. Для UI-фикса допустимо, но именно это сделало промпт уязвимым к stale state.

### W2. Branch label

Спринт: `feat/aura-theme`. Ревью на `main`. Фикс ancestor обоих — путаница веток не блокер, но в хедере спринта лучше `main` / commit-range.

### W3. Мелкий residual UX (не этот спринт)

В `WonDeals` кнопка «Проект внедрения» остаётся **outline** (`border-accent/40 text-accent`), не filled. Спринт так и задавал «компактную» кнопку. Если после ручного прогона всё ещё «незаметно» — отдельный микро-фикс стиля, не re-run этого файла.

### W4. Commit scope

`git add src/components/projects/` шире, чем нужно (весь каталог). Для уже сделанного коммита неактуально; в новых спринтах — явный file list.

### W5. `index.ts` не экспортирует `WonDeals`

`LostDeals` экспортируется, `WonDeals` — нет. Работает через прямые import’ы. Не блокер.

---

## Пропущенные места

| Файл | Строки / факт | Действие для *нового* прогона |
|------|----------------|-------------------------------|
| `src/components/projects/WonDeals.tsx` | 1–110, collapsible полный | **Не трогать** — DONE |
| `PipelineBoard.tsx` | 46, 674 | Только consumer shared component |
| `StageBoard.tsx` | 43, 495 | То же |
| `ProjectDetail.tsx` | 387–393 CTA; 866–877 SpawnWizard | Фикс 2 DONE; фикс 3 не здесь |
| `SpawnWizard.tsx` | 160–191 kind UI | Акценты уже есть; не применять snippet спринта |
| `DealDeliveryHub.tsx` | primary CTA ~95 | Уже `bg-accent text-white` — не в scope спринта |

Новых missed call-sites для «статичной плашки Выиграно» **нет** (кроме analytics `WeeklyReview` / `FunnelWidget` — другие UI, не воронка).

---

## Предлагаемые правки в спринт

1. **Не править для CC** — закрыть как **DONE (`005bf20`)**.
2. Если нужен follow-up после ручного прогона Олега — новый короткий handoff только на **residual** (например outline Rocket в `WonDeals`, auto-expand при `?won=1`, hide spawn при N delivery через hub query).
3. В архивной шапке: «Implemented 2026-07-11 · superseded spawn UI: S-WIN-WIZARD-1 / `SpawnWizard`».
4. Чеклист crm-architect: для будущих UX-спринтов — обязательный STOP-grep: `isOpen` в `WonDeals`, `SpawnWizard` в `ProjectDetail`.

---

## Чеклист crm-architect (condensed)

- [x] UI-only, без SQL / apply migration  
- [x] Реальные колонки (`actual_close_date`, company join) — schema ok  
- [x] Реальные пути (после сверки: `WonDeals.tsx`, не инлайн)  
- [x] CSS: theme utilities / accent tokens, без hardcoded hex  
- [x] Нет `flowType`, client DELETE, SECURITY DEFINER  
- [ ] Полная РАЗВЕДКА + gейт «уже сделано» — **нет** (W1/B1)  
- [ ] Актуальные line anchors — **нет** (B2)  

---

## Чеклист перед CC

- [x] Сверить `git log --grep='won-сделки раскрываемым'` → `005bf20`  
- [x] Прочитать `WonDeals.tsx` — collapsible уже есть  
- [x] Прочитать CTA в `ProjectDetail` — primary уже есть  
- [x] Убедиться, что kind UI = `SpawnWizard`, не ProjectDetail :541  
- [ ] **Не запускать** этот sprint-файл в Claude Code  
- [ ] При новых UX-жалобах — отдельный handoff с актуальной разведкой  

---

**Итог:** дизайн трёх фиксов был верным и **уже влит** (`005bf20` + последующий Win Wizard). Промпт сегодня — **stale handoff**, не рабочий sprint. В CC не отдавать.
