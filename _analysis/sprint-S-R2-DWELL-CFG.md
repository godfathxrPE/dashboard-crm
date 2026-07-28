# S-R2-DWELL-CFG — порог «залипания» становится настройкой организации

**Ветка:** `feat/r2-dwell-cfg` от `main`. **Миграция 086** (только сид сегмента). Один коммит.

R2-P1, спринт 3. Закрывает развилку «порог dwell», зафиксированную в
`claude/review-R2-P1-entry-reconciliation.md`.

**Трудоёмкость: ~4–5 ч. Риск низкий** — поведение при пустых настройках не меняется.

**Ревью Грока нет** (лимиты) — секция «Самопроверка» обязательна.

---

## Что разведка изменила против плана фазы

Три факта, проверенных по коду 2026-07-28. Два пункта из плана оказались уже построены.

**1. Бейдж «залипла N дн.» уже есть.** `ProjectCard.tsx` ~218: `AttentionLine` с текстом
``залипла ${aging.daysInStage} дн. в «${stageLabel}»``, приоритет 3 после «шаг просрочен» и
«нет действия». Строить нечего — надо прокинуть в него порог из настроек.

**2. `stage_entered_at` уже в whitelist сегментов.** `src/lib/constants/segments.ts:75` —
поле есть, операторы `days_since_gt` / `days_since_lt` есть. Сид-сегмент делается одной
вставкой, без единой строки клиентского кода.

**3. Единственный консьюмер `getStageAging` — `ProjectCard`.** Проверено грепом по `src/`.
`TodayView.rottingDeals` считает через `getDealHealth`, не через aging. Значит смена
сигнатуры затрагивает одно место плюс тесты.

⇒ Спринт вдвое меньше, чем планировалось: остаётся резолвер, проброс, поле в настройках
и сид.

---

## РАЗВЕДКА

```bash
git branch --show-current && git status --short

# три источника порога — понять, какой чем кормится
sed -n '90,150p' src/lib/utils/deal-health.ts          # STALE_BY_PHASE + getStageAging
cat src/lib/validators/org-settings.ts                  # stageDwellDefaultsSchema уже есть
cat src/lib/hooks/use-org-settings.ts                   # useReconnectDays — образец для хука
cat src/components/settings/OrgSettingsSection.tsx      # форма, куда встаёт поле

# единственный консьюмер
grep -rn "getStageAging" src/ tests/

# сегменты: поле и операторы уже на месте
sed -n '60,90p' src/lib/constants/segments.ts
cat supabase/migrations/077_segments.sql | sed -n '/Сид/,$p'   # образец сида
```

**Подтвердить перед правкой:** `STALE_BY_PHASE` = `{attraction:14, working:21, approval:21,
closing:30}`, `STALE_DEFAULT = 21`. Эти значения — **контракт обратной совместимости**: при
пустых `settings` поведение обязано остаться ровно таким.

---

## Решение по развилке (принято, не переоткрывать)

Порогов в проекте три, и они не связаны:

| Источник | Что кормит | Состояние |
|---|---|---|
| `STALE_BY_PHASE` в `deal-health.ts` | бейдж на `ProjectCard` | живой |
| `organizations.settings.stage_dwell_defaults` | ничего | тип + Zod есть, консьюмеров 0 |
| `automation_rules.trigger_config.min_days` | cron-правило `days_in_stage` | правил 0 |

**`stage_dwell_defaults` становится единственным источником для UI-сигнала. `min_days`
правила остаётся независимым. Четвёртая сущность не заводится.**

- **Per-stage отпадает.** `pipeline_stages` — глобальный словарь, потребовалась бы таблица
  `(org_id, stage_id)` плюс UI на неё. При двух воронках и работающем `phase_group`,
  который уже группирует стадии по темпу, это не окупается. Pipedrive держит rotting
  per-stage потому, что воронки там принадлежат аккаунту — у нас нет.
- **Слияние с `min_days` отвергнуто.** Бейдж отвечает «на что смотреть», правило — «когда
  пнуть». Слияние даёт либо уведомление на каждый жёлтый бейдж, либо немой бейдж.

---

## Правка

### 1. Резолвер и хук

`src/lib/utils/deal-health.ts` — рядом со `STALE_BY_PHASE`:

```ts
export type DwellThresholds = Record<string, number | undefined> & { default?: number };

/**
 * Порог «залипания» для phase_group. Приоритет:
 *   settings[phaseGroup] → settings.default → STALE_BY_PHASE[phaseGroup] → STALE_DEFAULT
 * Пустые настройки ⇒ ровно нынешнее поведение (H2).
 */
export function resolveDwellThreshold(
  phaseGroup: string | null,
  thresholds?: DwellThresholds,
): number
```

`src/lib/hooks/use-org-settings.ts` — по образцу `useReconnectDays`:

```ts
export function useDwellThresholds(): DwellThresholds {
  const { data } = useOrgSettings();
  return data?.stage_dwell_defaults ?? {};
}
```

### 2. Смена сигнатуры `getStageAging`

Сейчас: `getStageAging(stageEnteredAt, phaseGroup, now = new Date())`.
Третий параметр с дефолтом мешает дописать четвёртый — поэтому опции объектом:

```ts
export function getStageAging(
  stageEnteredAt: string | null,
  phaseGroup: string | null,
  opts?: { thresholds?: DwellThresholds; now?: Date },
): StageAging
```

Внутри — `resolveDwellThreshold(phaseGroup, opts?.thresholds)` вместо чтения
`STALE_BY_PHASE` напрямую. `STALE_BY_PHASE` остаётся как фолбэк внутри резолвера, **не
удалять**.

Вызовов два — `ProjectCard` и тесты. **Найти грепом оба, третьего не предполагать.**
`ProjectCard` берёт пороги из `useDwellThresholds()` и передаёт в `opts.thresholds`.

⚠️ Если в тестах есть вызов с третьим позиционным `now` — он сломается молча (объект
вместо Date даст `NaN`). Проверить каждый вызов глазами, а не только `tsc`.

### 3. Поле в настройках

`OrgSettingsSection` получает второй блок «Норматив дней в стадии» — **четыре** поля по
`phase_group`: привлечение / в работе / согласование / закрытие.

Каждое поле:

- **не обязательное**; пустое = «как по умолчанию»;
- `placeholder` = текущее хардкод-значение (14 / 21 / 21 / 30) — пользователь видит, что
  будет без ввода, и не обязан заполнять всё;
- clamp 1..365 (`STAGE_DWELL_MIN` / `STAGE_DWELL_MAX` уже есть в `org-settings.ts`).

Запись — **merge**, как у `reconnect_days`: `update.mutateAsync({ stage_dwell_defaults: {…} })`.
Пустое поле не пишется ключом со значением `null` — ключ просто **отсутствует**, иначе
резолвер получит `null` и провалится мимо фолбэка.

Правит только owner (`org_update_owner`) — как и `reconnect_days`, отдельной логики нет.

Ключ `default` в UI **не выносить**: четыре группы покрывают все стадии, а пятое поле
«для остальных» без единой стадии вне групп только путает. В резолвере `default`
поддерживается — на случай появления новой `phase_group`.

### 4. Подсказка `min_days` в редакторе правил

`RuleEditorModal`: при создании правила `days_in_stage` подставлять `t_min_days` из
`stage_dwell_defaults.default ?? AUTOMATION_DWELL_MIN_DAYS` как **placeholder**, не как
значение. Связки нет — это подсказка, чтобы пороги не расходились случайно.

### 5. Миграция 086 — сид сегмента

Сегмент «Залипли >14 дней» отсутствует, хотя был demo-критерием ещё R2-P0.

```sql
-- 086: сид-сегмент «залипшие в стадии» (S-R2-DWELL-CFG).
-- Схема НЕ меняется: поле stage_entered_at и оператор days_since_gt уже в whitelist
-- сегментов (src/lib/constants/segments.ts). Это только данные.
--
-- ⚠️ Число 14 в предикате — КОНСТАНТА и вынесено в ИМЯ сегмента намеренно.
-- Предикат сегмента считается на клиенте и про organizations.settings не знает;
-- называть сегмент «Застряли на стадии» значило бы обещать согласованность с
-- настройкой, которой нет. Имя с числом честнее: пользователь правит его руками,
-- как любой другой сегмент.
--
-- Идемпотентно: конфликт по uq_segments_shared_name → do nothing.
insert into public.segments (org_id, name, entity, predicate, is_shared, sort_order)
select o.id, 'Залипли >14 дней', 'deals',
  '{"version":1,"and":[
      {"field":"status","op":"eq","value":"open"},
      {"field":"stage_entered_at","op":"days_since_gt","value":14}
   ]}'::jsonb,
  true, 50
from public.organizations o
on conflict do nothing;
```

> **CC: имя уникального индекса и точный набор колонок сверить с 077**, не угадывать.
> `sort_order` подобрать так, чтобы сегмент встал последним среди сидированных.

---

## Правила `suggest_spawn` — руками, не кодом

Второе решение из `review-R2-P1-entry-reconciliation.md`: два правила `stage_entered` на
won-стадию каждой воронки → действие `suggest_spawn`. **Кода не требует**, заводится в
Настройках → Автоматизации. Делает Олег; в спринт не входит, но отчёт должен напомнить.

Критерий проверки на выходе из P1: если была живая победа и по уведомлению не кликнули —
удалить `suggest_spawn` отдельной миграцией с re-narrow трёх CHECK'ов.

---

## Границы

- **Не заводить** `stage_dwell_overrides` и `pipeline_stages.rotting_days` — развилка
  закрыта, обе отпадают.
- **Не связывать** порог бейджа с `min_days` правила (кроме placeholder из п.4).
- **Не удалять** `STALE_BY_PHASE` — это фолбэк и контракт H2.
- **Не трогать** `TodayView.rottingDeals` — он про `getDealHealth`, другой сигнал.
- **Не менять** схему сегментов: 086 только вставляет строку.

---

## Самопроверка перед сдачей

1. **Пустые `settings` ⇒ прежнее поведение.** Показать: `resolveDwellThreshold('attraction', {})`
   = 14, `('working', {})` = 21, `('approval', {})` = 21, `('closing', {})` = 30,
   `(null, {})` = 21, `('новая_группа', {})` = 21.
2. **Приоритет источников.** `resolveDwellThreshold('working', {working: 7})` = 7;
   `('working', {default: 5})` = 5; `('working', {working: 7, default: 5})` = 7.
3. **Все вызовы `getStageAging` найдены и поправлены?** Перечислить файлы и строки. Если
   где-то остался третий позиционный аргумент — это тихий `NaN`, а не ошибка компиляции.
4. **Пустое поле не пишет ключ.** Показать payload `update.mutateAsync` при трёх пустых
   полях из четырёх: в jsonb должен уйти объект с одним ключом, без `null`.
5. **Merge не затирает `reconnect_days`.** Сохранить порог стадии и показать, что
   `reconnect_days` в `organizations.settings` остался прежним.
6. **Сегмент 086 находит то, что должно.** На проде сегодня открытых client-сделок с
   `stage_entered_at` — **2**, залипших >14 дней — **0**. Значит сразу после сида сегмент
   покажет пустой список, и это **правильный** результат, а не поломка. Показать счёт
   запросом, не «работает».
7. **Не-owner не может править настройки.** Поле disabled и запись отбивается —
   как у `reconnect_days`.

---

## VERIFY / коммит

```bash
npx tsc --noEmit
npm test
npm run lint
npm run build      # последним, при остановленном next dev
```

Коммит: `feat(deals): порог залипания из настроек организации + сид-сегмент (086)`

Ветка `feat/r2-dwell-cfg`. Apply 086 — гейт Cowork. Мерж и пуш — Олег.
**Фронт мержится после apply**, порядок как в прошлых спринтах.

```
Type Safety:            [заполнить]
RLS Coverage:           [заполнить — 086 политик не трогает, обосновать]
Backward Compatibility: [заполнить — пункт 1 самопроверки обязателен]
Runtime Tested:         [заполнить]
Regional Availability:  NOT_APPLICABLE
```

## Что НЕ делает Claude Code

- Не применяет 086 — apply на гейте Cowork.
- Не заводит правила автоматизаций (это руками у Олега).
- Не правит `supabase.gen.ts` / `database.ts` руками.
- Не читает `.env`.
- Отчёт — отчётом о сделанном.
