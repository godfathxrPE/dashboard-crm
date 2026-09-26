# Fix S-STAGE-PROFILE-3 — нормы стадий не рисуются до загрузки настроек (долг P-6)

**Вход:** `main` после мержа #125 (миграция 133). **Ветка:** `fix/stage-profile-3`.
**Миграций НЕТ. Новых запросов НЕТ.** Продолжение P-4 (#123): там заглушка встала только в
`ProjectStageCockpit`.

---

## Зачем

Пока `organizations.settings` не ответил, `useStageTargetDays()` отдаёт `undefined`, а
`useDwellThresholds()` — дефолты групп (14/21/30). `resolveStageNorm` падает на порог группы,
и норма «Подготовки КП» 5 дней превращается в 14: просроченная стадия выглядит «в норме».
На проде настройки приходят через **6–8 с** (замер гейта #123) — это не мгновение, а заметное
окно неправды. Кокпит закрыт в #123; ту же неправду рисуют ещё четыре места:

| Потребитель | Что врёт до загрузки |
|---|---|
| `useStageTimeGauge` → `ProjectCard`, `ProjectPeekContent` | кольцо времени стадии |
| `ProjectsTable` (`rowGauge`) | кольцо в строке таблицы сделок |
| `useStageNormDateKey` → `DealDeadlineTrack` | пунктир «норма стадии» на таймлайне |
| `useDealSignals` → вердикт сделки | сигнал «В стадии N дн. при норме M» и вердикт `ok` вместо `rotting` |

Последнее хуже всех: зелёный чип «В норме» и нейтральный фон шапки у сделки, которая «киснет»
только по норме стадии, — ровно ложное «в норме», которое P-4 запретил.

Правило то же, что в #123: **не показать хуже, чем показать неправду.**

## Решение — одна точка готовности, а не четыре проверки

Заводится один хук-источник норм. Потребитель, который берёт нормы через него, не может
забыть проверку готовности — её не нужно помнить:

```ts
/** Входы нормы стадии; `null` — настройки организации ещё не ответили. */
export function useStageNormInputs(): { targetDays: StageTargetDays | undefined; dwell: DwellThresholds } | null
```

(типы — те, что сейчас возвращают `useStageTargetDays`/`useDwellThresholds`; взять из
`use-org-settings.ts`, не выдумывать). Внутри: `useOrgSettingsReady()`, `useStageTargetDays()`,
`useDwellThresholds()` — все три ДО раннего выхода; результат в `useMemo` по `[ready, targetDays,
dwell]`, чтобы ссылка была стабильной (грабля `useDwellThresholds` — см. комментарий в
`org-settings.ts:412`).

`useStageTargetDays`/`useDwellThresholds` **не удаляются**: ими пользуются `ProjectStageCockpit`
(у него своя заглушка) и `RuleEditorModal` (настройки, не отображение нормы).

## РАЗВЕДКА

```bash
git --no-pager log --oneline -1
grep -rn "useStageTargetDays\|useDwellThresholds\|useStageTimeGauge\|useStageNormDateKey\|useDealSignals(" src --include=*.ts --include=*.tsx
grep -rn "verdict\|DealVerdictChip" src/components --include=*.tsx | grep -v "^src/components/projects/DealSignals.tsx"
grep -n "export function useDwellThresholds\|export function useStageTargetDays" -A6 src/lib/hooks/use-org-settings.ts
```

В отчёт — **все места, где рисуется вердикт** (`verdict`, `DealVerdictChip`, класс
`h-rotting`/`h-attention` в `ProjectDetail.tsx:289`). Ожидание: `ProjectDetail`, `DealFocusPanel`,
возможно панель сигналов в рельсе.

И отдельной строкой в отчёт, **НЕ чинить**: потребители `useCompletenessRules` и чтения
`reconnect_days` — у организации оба ключа переопределены (`settings` на проде:
`completeness_rules`, `reconnect_days`, `stage_target_days`, `stage_dwell_defaults`), значит
до загрузки там тоже дефолты. Это тот же класс, но другой долг.

## ЗАДАЧА 1 — `useStageNormInputs` в `use-org-settings.ts`

Рядом с `useOrgSettingsReady`. JSDoc: зачем (ссылка на P-4/P-6), что `null` — «не знаем», а не
«норм нет»; при ошибке запроса хук отдаёт дефолты (как `useOrgSettingsReady` — `!isPending`).

## ЗАДАЧА 2 — хуки `use-stage-gauge.ts`

`useStageTimeGauge` и `useStageNormDateKey` берут нормы из `useStageNormInputs()`;
`inputs === null` ⇒ `null` (кольца нет, пунктира нет). Порядок хуков: вызов до раннего выхода,
как сейчас. JSDoc обоих — строка про P-6.

## ЗАДАЧА 3 — `ProjectsTable`

Пара `useDwellThresholds`/`useStageTargetDays` → `const normInputs = useStageNormInputs()`;
`rowGauge` при `normInputs === null` отдаёт `null`. `StageTimeRing` на `null` уже возвращает
`null` (`StageTimeRing.tsx:38`) — проверить, что колонка не схлопывается и строка не прыгает
по ширине, когда кольцо появляется (если прыгает — резерв места фиксированной шириной ячейки,
не новым плейсхолдером).

## ЗАДАЧА 4 — `useDealSignals`: вердикт не выносится, пока норм нет

1. В `useDealSignals` нормы — через `useStageNormInputs()`; `gauge` при `null` — `null`.
2. Хук возвращает **`DealSignalsResult & { pending: boolean }`**, `pending = inputs === null`.
   Доменный тип `DealSignalsResult` в `deal-signals.ts` **не трогать** — «ожидание» свойство
   загрузки, а не сделки; `getDealSignals` остаётся чистой функцией.
3. В каждом месте рисования вердикта из разведки: при `pending` —
   - чип вердикта не рендерится (не «В норме», не скелетон — ничего, как кольцо);
   - класс здоровья шапки (`h-rotting`/`h-attention`) не ставится — нейтральная шапка;
   - список сигналов в панели рендерится БЕЗ `stage_dwell` (он и так `na` при `gauge: null`),
     остальные сигналы — как есть.
   Экспорт типа — `DealSignalsView` рядом с хуком.

Обоснование пункта 3 (в комментарий у `pending`): вердикт — сводка worst-wins; без нормы
стадии он систематически оптимистичен, а оптимистичная сводка и есть ложное «в норме».
Отдельные сигналы без нормы честны — каждый про своё.

## ТЕСТЫ

Тестов нет: `useStageNormInputs` — обёртка над состоянием React Query (как
`useOrgSettingsReady` в #123), домен (`resolveStageNorm`, `stageTimeGauge`, `getDealSignals`)
не меняется, его тесты проходят без правок. Если по ходу понадобится вынести логику
`pending` в чистую функцию — тогда тест на неё, поведением.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint 2>&1 | tail -3 && npx vitest run 2>&1 | tail -3
python3 scripts/audit-contrast.py 2>&1 | grep -E "^=== " | grep -v " 0 FAIL"   # ровно 3 строки
python3 scripts/audit-tokens.py 2>&1 | tail -2
grep -rn "useStageTargetDays\|useDwellThresholds" src --include=*.tsx --include=*.ts | grep -v "use-org-settings.ts"
# ожидание: остались только ProjectStageCockpit и RuleEditorModal
npm run build 2>&1 | tail -5
```

Приёмка (ТОЛЬКО просмотр, ничего не записывать): задержать ответ `organizations` (подмена
`fetch` с задержкой 8 с, как в #123, или DevTools → Slow 3G) и открыть:
(а) список сделок — колец нет, строки не прыгают при появлении; (б) карточку сделки «ЭЙЧ ЭНД ЭН»
(`aa2c3628…`) — до ответа нет чипа вердикта и цветной шапки, нет пунктира нормы на таймлайне;
после ответа — «Киснет» и пунктир на месте; (в) peek сделки из канбана — кольцо появляется
после ответа. Без задержки — поведение как на `main`.

## КОММИТ

```
fix(deals): нормы стадий не рисуются до загрузки настроек — кольца, пунктир, вердикт (P-6)

- useStageNormInputs(): единая точка норм, null до ответа настроек организации
- кольцо времени (карточка, peek, таблица) и пунктир нормы на таймлайне — не рисуются до ответа
- useDealSignals: pending — вердикт и цвет шапки не выносятся без нормы стадии,
  иначе «киснущая» по норме сделка первые секунды показывалась «в норме»
```

**Не мержить.** Отчёт — на гейт. В отчёт — список мест вердикта и строка про
completeness/reconnect.
