# Гейт Cowork — S-PLAN-IMPORT-1 (E волны) · ЗАКРЫТ

**Дата:** 2026-07-18 · **Прод:** `main = bb2f0b7` (merge feat/plan-import) → Vercel auto-deploy. **Клиентский спринт — миграций НЕТ.**

## Что вошло (2 коммита)
- **f00696b** — `plan-import-helpers.ts` (116) + `plan-import-helpers.test.ts` (140, **19 тестов**).
- **d59a7cc** — `PlanImport.tsx` (354) + `ProjectDetail.tsx` (+7, монтаж).
- CC: tsc 0 / vitest **187/187** (19 новых) / build 0. Миграций нет.

## Гейт Cowork — PASS

### 1. RLS-смок INSERT симуляцией JWT (симуляция Иван `b6e694a9`, org-**manager**, не владелец проекта «Аграрная группа» `7ef8ede9`; всё в `begin…rollback`)
| INSERT | Иван (org-manager, не владелец) | владелец (контроль) |
|---|---|---|
| `project_columns` (фаза) | **42501** «violates RLS» ✅ | success ✅ |
| `tasks` | **success (1)** — org-manager пускается | — |

**Вывод (граница, важно):** гейт `canManage` бэкапится RLS **асимметрично**:
- **Фазы** — `project_columns_insert` = owner/admin ∨ владелец проекта → org-manager-не-владелец **42501**. UI-гейт согласован с RLS.
- **Задачи** — `tasks_insert` = org + role ∈ owner/admin/**manager** (org-wide, намеренно широкий). org-manager создаёт задачу в любом проекте своей org. Для создания задач `canManage` — **только UI-гейт**, RLS не сужает до владельца/участника.

Не дыра в скоупе E (кнопка импорта скрыта UI-гейтом; org-manager — PM-уровень, создание задач ему штатно доступно). **Отличие от D:** там `tasks_update/delete` реально блокировали manager (RLS строже-или-равно UI); здесь `tasks_insert` шире UI. Если бизнес захочет «задачи в проект создаёт только владелец/участник» — это отдельное сужение `tasks_insert` (fast-follow, вне E).

### 2. Верификация коммитов (git show — заявленное = код)
- **B1** `lane: 'next'` (`PlanImport.tsx:198`) — план заливается со статусом «Не начата», не «В работе». ✅ (критичный фикс ревью)
- **W1** exact-токены: `h === 'с'`→start, `h === 'по'`→end, `h === '№'||'код'`→wbs (не `includes`). ✅
- **W2** хуки top-level (`useCreateTask`/`useCreateColumn`/`useProjectColumns` до `if(!canImport) return null`). ✅
- **W5** `parsePlanDate` → `localDateKey(cell)` для Date (reuse, без `toISOString`). ✅
- **W6** `invalidateQueries({ queryKey: […] })` object-form (RQ v5). ✅
- **W8** монтаж `{isDelivery && <PlanImportButton canImport={canManage}/>}` над ProjectBoard (board не тронут). ✅
- `cellDates:true`; дедуп фаз по `lower(name)`; `column_id = phaseMap ?? null` (W4); skip-and-continue + отчёт. ✅

### 3. Advisors / миграции
N/A — DDL нет.

## За гейтом остаётся — UI-смок (Олег, вручную)
Импорт создаёт **реальные** задачи → на проде автоматически не гоняю. Чеклист (из промпта):
- .xlsx (Фаза/Задача/Дата начала/Дата окончания/Веха) → автодетект («Окончание» не ловится как start) → preview (фазы «(есть)/(создать)», warning про добавление) → импорт → задачи в фазах-свимлейнах статус **«Не начата»** (lane='next'), даты в Ганте, веха-ромб;
- повтор файла НЕ дублирует фазы; `end<start`/битые даты — в отчёте, остальное залилось;
- фаза не создалась → задачи видны в Ганте (swimlane «Без фазы»), на доске — после назначения колонки (W4);
- без `canManage` кнопки нет.

## Скилл-долг (crm-architect, мосту недоступен — CC/Олег)
- `references/schema.md` — в тело `tasks` добавить `is_milestone`/`wbs_code`/`start_date`/`end_date`/`parent_task_id` (в БД/gen types есть, в доке нет).
- (ранее) `supabase.gen.ts` full-regen; docs/schema.md +062–065; learnings +pointer-burst→useRef +Trash-clip; architecture Гант read-only→write.

## Следующий шаг волны
Волна: A✅ B✅ C✅ VISIBILITY✅ D✅ **E✅** → **F1 (S-CHAT-1)** → F2 (видео-embed). F1 = отдельный чат-модуль (эпик, **миграция** — таблица сообщений + RLS по project_members; фундамент 065 готов). ⚠️ риск дубля с Активностью — UAT. Альтернатива по объёму: F2 (embed YouTube/VK/Rutube) короче и без миграции — можно вперёд F1, если хочется быстрый прод-эффект. Fast-follow: VISIBILITY-2 (storage) · W2 (canManage vs projects_update) · Gantt Trash-clip · (опц.) сужение tasks_insert до membership.
