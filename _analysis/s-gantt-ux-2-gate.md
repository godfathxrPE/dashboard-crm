# Гейт Cowork — S-GANTT-UX-2 (D волны) · ЗАКРЫТ

**Дата:** 2026-07-18 · **Прод:** `main = a28b2bc` (merge feat/gantt-ux-2) → Vercel auto-deploy. **Клиентский спринт — миграций НЕТ** (RLS/schema не трогали, следующая свободная миграция всё ещё 066).

## Что вошло (2 коммита)
- **b7e0d60** — удаление задачи и фазы в Ганте. `ProjectDetail.tsx` +1 (прокид `canManage`), `GanttTimeline.tsx` +155/−13.
- **21a9524** — drag задачи из «Без дат» на таймлайн. `GanttTimeline.tsx` +156/−18.
- CC: tsc 0 / build 0 / vitest 168/168. Chrome-смок (dev+прод-БД) Олега пройден.

## Гейт Cowork — PASS

### 1. RLS-смок симуляцией JWT рядового участника (закрывает W4)
Субъект: Иван Петров `b6e694a9` (org-роль **manager**, `project_members.role=manager` в проекте «Аграрная группа» `7ef8ede9`), чужая задача `605dccda` (creator/assignee = owner `6516dd41`), фаза «Обследование» `0abf3d75` (8 задач). Все проверки в `begin…rollback` — на проде ничего не менялось.

| Проверка | Ожидание | Факт |
|---|---|---|
| `tasks_update` (чужая задача) | 0 строк | **0** ✅ |
| `tasks_delete` (чужая задача) | 0 строк | **0** ✅ |
| `delete_project_column(...)` | `42501` | **42501 forbidden** (RAISE line 16) ✅ |
| контроль: owner `tasks_update` своей | 1 строка | **1** ✅ |

Политики (факт из `pg_policies`):
- `tasks_update` = `org_id=current_org_id() AND (current_org_role() IN (owner,admin) OR assigned_to=auth.uid() OR created_by=auth.uid())`
- `tasks_delete` = то же без `assigned_to`.

**Вывод:** `canManage` — UI-гейт, но RLS блокирует write рядового участника **независимо** от UI (в т.ч. мимо клиента, прямым API). Контроль под owner (1 строка) доказывает, что 0 у Ивана = настоящий deny, а не артефакт видимости.

### 2. Верификация коммитов (git show — заявленное = код)
Все правки ревью Grok подтверждены в дифе:
- **W1** `canManage={canManage}` из `ProjectDetail`, не `page.tsx`.
- **B2** фаза = `useDeleteColumn(projectId)` + модалка-пикер target («В фазе есть задачи. Куда их перенести?» / «Фаза пуста»); `window.confirm` — только задача/ребро.
- **W5** Trash фазы за `canManage && phaseMode && realPhaseIds.has(sl.id)` (исключены `__none__`/`__flat__`).
- **W2** CSS `text-red` / `text-text-mute` (не `--danger`/`--text-muted`).
- **W3** hover-`Trash2` (`-right-4`, вне resize-зоны бара) + `isSummary`-guard в тексте confirm.
- **B1** даты через `useUpdateTaskDates()` (без args) + `patchTaskCaches`.
- **W6** `CLICK_PX`-порог различает клик(edit)/drag на chip.
- **B3** fallback-ось `today = mskDateKey(new Date())` (±14) при only-undated.
- **W4** `draggable = !linkMode && !isSummary && canManage`; `toast.error` на всех write-путях (задача/фаза/даты).

### 3. Advisors / миграции
N/A — клиентский спринт, DDL нет.

## Находка рантайм-смока (learning для скилла)
**Pointer-burst до re-render → истина в `useRef`.** Быстрый свайп: pointer-события приходят пачкой ДО ре-рендера, поэтому guard по state-замыканию терял все `pointermove` → drag не стартовал, короткий свайп открывал edit-модалку вместо дропа. Фикс: источник правды drag → `useRef` (`undatedDragRef`), `state` только для рендера призрака; дедуп `setState` сохранён (measurement-loop в консоли нет). **Класс — тот же, что stale-closure в useEffect-хендлерах** (learnings): в высокочастотных pointer-хендлерах не читать состояние из замыкания.

## Known-issue (fast-follow, не блокер)
- **Full-width bar → hover-Trash клипается overflow-контейнером.** При баре во всю ширину оси кнопка удаления уезжает за `overflow` (тот же класс, что тултип в `overflow-x-auto`). Fallback: удаление такой задачи доступно с доски «План». Чинить — если пожалуются (варианты: Trash внутри бара при большой ширине / портал).

## Открытое решение (ждёт Олега) — W4 асимметрия
Гант v1 гейтит весь write по `canManage` («Гант = PM-инструмент»). Доска «План» пускает assignee двигать **свои** задачи (`canEdit` = не-viewer + RLS `assigned_to`). Значит assignee НЕ подвинет свои даты в Ганте, хотя на доске может. Дефолт оставлен `canManage` (проще, чётче) + toast. Если нужен паритет — переключить drag/resize в Ганте на `canEdit`+RLS (удаление в любом случае остаётся на `canManage`).

## Скилл-долги (crm-architect на маке — правит CC/Олег, мосту недоступен)
- `references/learnings.md` += pointer-burst→useRef (класс stale-closure); += known-issue full-width-bar Trash-clip.
- `references/architecture.md` ~158 — снять пометку «PM-Гант **read-only**» (после VIEW-2/UX-2 Гант write: drag дат, удаление задач/фаз).
- (Ранее висящие) `supabase.gen.ts` full-regen; docs/schema.md +062–065.

## Следующий шаг волны
**E — S-PLAN-IMPORT-1** (п.12 фидбека): импорт плана из Excel (этапы+даты+фазы+вехи) → задачи. Паттерн ExcelImport есть (Companies/Contacts), xlsx lazy. Далее F1 (чат) → F2 (видео-embed). Fast-follow к visibility: S-TEAM-VISIBILITY-2 (storage download) + W2 (canManage vs projects_update).
