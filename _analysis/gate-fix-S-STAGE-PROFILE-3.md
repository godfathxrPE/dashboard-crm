# Гейт fix-S-STAGE-PROFILE-3 (P-6) — PR #127 (`421efbf`)

**26.09.2026.** Работа `1b946b4`, squash → `421efbf`. Прод-деплой
`dpl_GNhiSh2a1Yq3uSWc4u5Rym1uuGLD` (READY), откат — `dpl_FjgWt98rmXtEpoeG5ZU4yQLYqwjB`.
Фикс-файл — `_analysis/fix-S-STAGE-PROFILE-3.md` (лёг в `main` #126 до запуска). Миграций и
новых запросов нет.

## Что сделано

- `useStageNormInputs()` в `use-org-settings.ts` — единая точка норм стадии для отображения:
  `null` до ответа настроек организации, при ошибке — дефолты. Три хука до раннего выхода,
  результат в `useMemo`.
- Через неё: `useStageTimeGauge` (кольцо в `ProjectCard`, `ProjectPeekContent`),
  `useStageNormDateKey` (пунктир нормы в `DealDeadlineTrack`), `ProjectsTable.rowGauge`,
  `useDealSignals`. Старые ридеры остались только в `ProjectStageCockpit` (своя заглушка, #123)
  и `RuleEditorModal` (настройки).
- `useDealSignals` → `DealSignalsView = DealSignalsResult & { pending }`; доменный тип и
  `getDealSignals` не тронуты. При `pending` вердикт не выносится нигде: класс зоны «Риски»
  (`ProjectDetail:291`), чип в `DealHealthRing` (вердикт не передаётся, проп необязательный),
  чип свёрнутой панели `DealSignals`.
- Сверх файла: колонка «Стадия» в `ProjectsTable` — `width: 12.5rem`, иначе таблица прыгала на
  ширину кольца (155→136 px) при его появлении.

## Проверка

**Дифф прочитан целиком** (6 файлов, +126/−56). Тестов нет с причиной в фикс-файле: обёртка над
состоянием React Query, домен не менялся; vitest 2067/2067.

| Где | Итог |
|---|---|
| localhost:3001 на ветке, живая загрузка без подмены | заглушка кокпита 13.0→20.1 с; всё это время чип вердикта, класс зоны и сигнал «при норме» отсутствуют; на 20.1 с «Киснет», `h-rotting` и сигнал появляются одновременно с уходом заглушки — один гейт |
| прод после мержа (`dpl_GNhi…`) | то же: заглушка 12.7→17.8 с, без вердикта и цвета зоны; затем «Киснет», `h-rotting`, «при норме» |
| исполнитель: подмена `fetch` 8 с | список сделок 0/16 колец → 16/16, ширина колонок неизменна; peek «Нытва» — кольцо и чип после ответа |

Пунктир нормы вживую не проверить: у открытых сделок норма истекла за пределами двухнедельного
окна таймлайна. Хук отдаёт `null` — по коду.

Линзы: базовая ✓ · design ✓ (новых цветов нет, резерв ширины) · a11y ✓ (вердикт снят и из
aria-label кольца) · supabase-patterns ✓ (запросов не добавилось) · security/api — n/a.

## Находки

- 🟡 **P-7 — тот же класс, другие ключи.** `useCompletenessRules` и `useReconnectDays` до ответа
  отдают дефолты, а у организации оба ключа переопределены. Полнота: `DealSummaryCard`,
  `CompletenessBadge`, `ProjectsView`, `PipelineBoard`, `StageBoard`, `ProjectsTable`. Порог
  «пора связаться»: `TodayView`, `ContactDetailHub`, `ContactPeekContent`, `ContactsTable`,
  `CompanyPeekContent`, `CompaniesTable`. Лечение — тот же приём (точка на ключ, `null` до
  ответа). Полнота нужна S-DEAL-SUMMARY-1 — чинить до или вместе с ним.
- 🟢 Счётчик помех в кольце здоровья до ответа не включает норму стадии («ЭЙЧ ЭНД ЭН» 2 → 3);
  если это единственная помеха, aria кольца прочитает «все N сигналов в норме». Принято:
  каждый сигнал честен, сводный вердикт скрыт.
- 🟢 Ширина 12.5rem посчитана по самому длинному имени стадии сегодня.

## Процесс

Гейт через мост оставил у владельца `.git/index.lock` — `git status` из VM пытался обновить
индекс, а удалять VM не может. Лок перенесён в `_to_delete/`; дальше в репо владельца — только
`git --no-optional-locks`.

## Verification

```
Type Safety:            PASS (tsc у исполнителя и в CI; дифф прочитан)
RLS Coverage:           NOT_APPLICABLE (запросы и схема не менялись)
Backward Compatibility: PASS (после ответа поведение как на main — проверено на проде)
Runtime Tested:         PASS (localhost на ветке и прод после мержа, живая загрузка)
Regional Availability:  NOT_APPLICABLE
```
