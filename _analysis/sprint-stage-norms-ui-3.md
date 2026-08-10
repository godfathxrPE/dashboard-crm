# Claude Code Prompt — Sprint STAGE-NORMS-UI-3: нормы стадий в настройках

## Контекст

Спринт 3 эпика «Кокпит». Ключ `organizations.settings.stage_target_days`
(`{stage_id: days}`) введён в S-PIPELINE-COCKPIT-1: резолвер и ридер работают
(`resolveStageNorm` → `readStageTargetDays` → `useStageTargetDays`), но **пишущего
UI нет** — оверрайд мёртв, пока его нельзя задать. Этот спринт добавляет
подсекцию «Нормы стадий» в существующую секцию настроек организации.

Как это работает после спринта: норма конкретной стадии = оверрайд из
`stage_target_days` → порог группы из `stage_dwell_defaults` (существующая форма
там же) → фолбэки 14/21/21/30. Заливка кокпита, кольцо и бейдж «залипла» читают
одну величину.

### Опоры (проверены гейтом S-PIPELINE-COCKPIT-1)

- Форма секции: `src/components/settings/OrgSettingsSection.tsx` — RHF, values
  `{ reconnect_days, stage_dwell, completeness }`, сохранение
  `update.mutateAsync({...})` **merge-патчем** (чужие ключи не страдают),
  `stage_dwell_defaults` собирается `buildStageDwellDefaults(values.stage_dwell, dwell)`.
- Валидатор: `src/lib/validators/org-settings.ts` — `stageTargetDaysSchema`
  (1..365) уже есть; пары «настройка → значения формы» и «значения формы → патч»
  для dwell — образец (`dwellDefaultsToFormValues` / `buildStageDwellDefaults`,
  имена сверить грепом).
- Правило ключа (записано в самом файле): **пустое поле формы ключ НЕ пишет** —
  иначе `??`-цепочка резолвера не дойдёт до фолбэка.
- Воронки/стадии: `usePipelines()` / `usePipelineStages()`
  (`src/lib/hooks/use-pipelines.ts`), глобальные словари, только SELECT.
- Настройки правит только owner (RLS `org_update_owner`) — как секция гейтит UI
  сейчас, выяснить разведкой и повторить.

### Красные линии

Миграций нет (jsonb-ключ существует). Типы руками не правятся (ключ живёт через
`.passthrough()`, В `OrgSettings` его НЕТ — это намеренно). `.env` не читается.

## РАЗВЕДКА

```bash
# 1. Структура формы секции: values, reset, сабмит, как гейтится роль
grep -n "useForm\|mutateAsync\|reset(\|owner\|role" src/components/settings/OrgSettingsSection.tsx | head -20

# 2. Точные имена пары dwell-хелперов и Zod формы
grep -n "dwellDefaultsToFormValues\|buildStageDwellDefaults\|stage_dwell: z\|STAGE_DWELL_MIN\|STAGE_DWELL_MAX" src/lib/validators/org-settings.ts

# 3. stageTargetDaysSchema уже есть (S-PIPELINE-COCKPIT-1)
grep -n "stageTargetDaysSchema\|readStageTargetDays" src/lib/validators/org-settings.ts

# 4. Как секция рендерит подсекции (заголовки, гриды) — повторить стиль
grep -n "text-sm font-semibold\|подсекц\|Полнота\|Залипание\|reconnect" src/components/settings/OrgSettingsSection.tsx | head -15

# 5. RHF-грабля select/number: образец setValueAs в проекте
grep -rn "setValueAs" src/components --include="*.tsx" | head -5
```

## ЗАДАЧА 1: валидатор — пара хелперов для stage_target_days

### Context
Зеркало dwell-пары: настройка → значения формы (строки) и значения формы → патч.
Форма держит строки (input type=number с пустым значением), патч — числа.

### Steps
В `src/lib/validators/org-settings.ts` добавить рядом с dwell-хелперами:

1. Zod-часть формы (по образцу `stage_dwell`): `stage_targets: z.record(z.string(), <строка-или-пусто с проверкой 1..365 при непустом>)` — точный стиль взять у dwell-части (там уже решено, как валидировать строку формы; повторить, не изобретать).
2. `stageTargetsToFormValues(current: Record<string, number> | undefined, stageIds: string[]): Record<string, string>` — для каждой стадии значение оверрайда строкой либо `''`.
3. `buildStageTargetDays(values: Record<string, string>, current: Record<string, number> | undefined): Record<string, number> | undefined`:
   - непустое валидное значение → ключ пишется числом;
   - пустое поле → ключ НЕ пишется (правило dwell: отсутствие ключа ≠ null);
   - если итог пуст — вернуть `undefined` (ключ целиком не пишется в патч —
     сверить, как поступает `buildStageDwellDefaults` с пустым результатом,
     и повторить его контракт байт-в-байт).

Докблок каждого: одна строка «зачем» + ссылка на правило пустого поля.

### Verification
```bash
npx tsc --noEmit && npx vitest run
```

Если у dwell-хелперов есть юнит-тесты (проверить: `grep -rn "buildStageDwellDefaults" tests/`) —
добавить зеркальные для новой пары в тот же файл: пустое поле не пишет ключ;
мусор отбрасывается; round-trip настройка→форма→патч стабилен.

## ЗАДАЧА 2: подсекция «Нормы стадий» в OrgSettingsSection

### Context
UI: селект воронки → список её активных стадий с number-инпутами. Плейсхолдер
инпута — унаследованная норма (та, что подействует при пустом поле), чтобы
владелец видел фолбэк до того, как что-то введёт.

### Steps
1. В `OrgSettingsSection.tsx`:
   - данные: `usePipelines()`, `usePipelineStages()`; локальный `useState`
     выбранной воронки (дефолт — первая deal-воронка); стадии выбранной воронки:
     фильтр `pipeline_id`, `!is_won && !is_lost`, сорт `order_index`;
   - в `defaultValues`/`reset` добавить `stage_targets:
     stageTargetsToFormValues(readStageTargetDays(settings), <ВСЕ id стадий всех воронок>)`
     — не только выбранной: смена селекта не должна терять несохранённый ввод
     по другой воронке;
   - в сабмит добавить `stage_target_days: buildStageTargetDays(values.stage_targets,
     readStageTargetDays(settings))` — тем же merge-патчем, что остальные ключи;
   - рендер подсекции ПОСЛЕ подсекции «залипания» (они — одна тема): заголовок
     в стиле соседних, строка-пояснение: «Норма дней на конкретную стадию.
     Пусто — действует порог группы (настройка выше). Красит заливку стадии на
     карточке и кольцо в списках»;
   - селект воронки (обычный `<select>` в стиле полей секции; НЕ трогать RHF —
     это UI-состояние, не значение настройки);
   - по каждой стадии строка: имя стадии + подпись группы (`phase-labels.ts`)
     тихим текстом + `<input type="number" min=1 max=365>` c
     `placeholder={<унаследованная норма>}` — считать
     `resolveDwellThreshold(stage.phase_group, <текущие значения dwell-формы>)`;
     регистрация `register(\`stage_targets.${stage.id}\`)`;
   - ошибки поля — как у dwell-полей.
2. ⚠️ RHF-грабля проекта: для number-инпута с пустым значением НЕ использовать
   `valueAsNumber` (NaN на пустой строке) — форма держит строку, число делает
   `buildStageTargetDays` (образец — как dwell-поля уже сделаны; РАЗВЕДКА п.5).
3. Роль: подсекция подчиняется тому же гейту, что вся секция (owner) — ничего
   нового не изобретать.

### Verification
```bash
npx tsc --noEmit
grep -n "stage_targets" src/components/settings/OrgSettingsSection.tsx | head
```

## ЗАДАЧА 3: docs/schema.md — снять пометку «пишущего UI пока нет»

### Steps
В `docs/schema.md`, строка settings организации (ключ `stage_target_days`):
заменить «**пишущего UI пока нет** — появится отдельным спринтом» на
«правится owner'ом в „Настройки организации" → „Нормы стадий" (S-STAGE-NORMS-UI-3)».

### Verification
```bash
grep -n "пишущего UI" docs/schema.md   # ожидание: 0 строк
```

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint      # ровно baseline
npx vitest run
npm run build     # последним
```

Рантайм-смок (если доступен браузер; иначе отметить «остаётся гейту») — БЕЗ
сохранения на проде: открыть настройки, увидеть плейсхолдеры-фолбэки (14 у
attraction-стадий, 21/30 дальше), ввести значение, увидеть валидацию 1..365,
переключить воронку и вернуться — ввод не потерян. Кнопку «Сохранить» на проде
НЕ жать — запись проверит гейт на тестовом значении и откатит.

## КОММИТ

```bash
git add -A
git commit -m "feat(settings): нормы дней по стадиям — UI для stage_target_days (S-STAGE-NORMS-UI-3)

- подсекция «Нормы стадий»: селект воронки, инпуты по стадиям, плейсхолдер = унаследованный порог группы
- пара stageTargetsToFormValues/buildStageTargetDays (пустое поле ключ не пишет)
- merge-патч settings, чужие ключи не страдают; docs/schema.md обновлён"
```
