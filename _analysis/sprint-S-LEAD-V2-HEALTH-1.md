# Спринт S-LEAD-V2-HEALTH-1 — кокпит со шкалой времени и зона «Риски» лида

**27.09.2026.** **Вход:** `main` с влитым `S-LEAD-V2-LAYOUT-1`. **Миграций НЕТ.**
**Ветка:** `feat/lead-v2-health-1`, worktree по `worktree-isolation`.
**Спека:** `_analysis/lead-v2-spec.md` — §3 (W1), §7 (W5), §8 (домен). Чинит F-01, F-06, F-13 аудита.

Суть: у лида появляются мера «сколько в статусе против нормы» (в кокпите) и список сигналов с вердиктом
(в «Рисках»). Один факт — одно словесное место: слова «просрочен / молчание / остывает» живут только в
«Рисках».

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -1
sed -n 1,90p src/lib/domain/stage-norm.ts
sed -n 20,170p src/components/shared/PipelineCockpit.tsx       # пропсы, ветвление Legacy/CockpitRow
sed -n 363,600p src/components/shared/PipelineCockpit.tsx      # CockpitRow целиком
cat src/lib/utils/lead-health.ts
sed -n 1,60p src/lib/constants/leads.ts
sed -n 1,60p src/components/projects/DealSignals.tsx
sed -n 160,330p src/components/projects/DealSignals.tsx         # showVerdict=false и SignalRow
sed -n 40,147p src/components/projects/DealHealthRing.tsx       # STATE_STROKE и ряд сегментов
grep -n "regulatoryMonths\|showRegWarning\|showColdSignal\|LeadHealthMark" src/components/leads/LeadDetail.tsx
cat tests/unit/lead-health.test.ts | head -60                   # стиль тестов лида
```

**Разведка данных** (read-only, через отчёт; в БД ничего не писать):

```sql
select status,
       count(*)                                         as total,
       count(first_contacted_at)                        as has_first_touch,
       count(qualified_at)                              as has_qualified_at,
       count(*) filter (where next_action_date is not null) as has_step
from leads group by status order by status;
```

Ответить до кода: у скольких `contacted` нет `first_contacted_at` и у скольких `qualified` нет
`qualified_at` — от этого зависит, как часто сработает фолбэк на `updated_at` (§8). Ноль — хорошо; не ноль —
строкой в отчёт, фолбэк остаётся.

---

## ЗАДАЧА 1: `leadStatusGauge` — мера времени в статусе

Спека §8, первая таблица. Файл `src/lib/domain/lead-status-gauge.ts`, чистый, `now` аргументом.

### Steps
1. Типы — как в спеке. `StageTimeGauge` импортировать из `stage-norm.ts`, пороги состояний не дублировать:
   для `contacted`/`qualified` — прямой вызов `stageTimeGauge(entered, norm, now)`.
2. `new` — счёт по часам: `h = floor((now − created_at)/3.6e6)`, `pct = min(100, round(h/24·100))`,
   state: `h > 24` → over, `pct ≥ 70` → warn, иначе ok. `days = floor(h/24)`, `norm = LEAD_NEW_STALE_DAYS`.
   `counterLabel`: `h < 48` → «{h} ч из 24», иначе «{days} дн. из 1».
3. Нормы — только константы `LEAD_NEW_STALE_DAYS` / `LEAD_CONTACTED_STALE_DAYS` (не новые числа).
4. `dates`: `entered` — «9 сент.» (`toLocaleDateString('ru-RU',{day:'numeric',month:'short'})`), у `new` — плюс
   время «18:40»; `norm` — дата входа + норма тем же форматом; у `qualified` — `null`.
5. Даты — МСК-ключи (`mskDateKey` / приём бакетов на UTC-полдне — см. CLAUDE.md «Календарные вычисления»),
   не голый `toDateString()`.

### Verification
```bash
npx tsc --noEmit && npx vitest run tests/unit/lead-status-gauge.test.ts
```

---

## ЗАДАЧА 2: `getLeadSignals` — сигналы и вердикт

Спека §8, вторая таблица. Файл `src/lib/domain/lead-signals.ts`, чистый, `now` аргументом.

### Steps
1. Перенести `regulatoryMonths` из `LeadDetail.tsx` сюда (экспорт), порог `REG_WARNING_MONTHS = 3` — тоже
   сюда с комментарием-обоснованием из `LeadDetail` («длина пилота»). Добавить дни: < 31 дн. — формулировка
   «через N дн.».
2. `step` строится **поверх** `getLeadHealth` (не второй копией правила): шаг назначен → по его дате;
   шага нет → уровень staleness из `getLeadHealth`. Ядро «шаг глушит молчание» не ломать.
3. Вердикт, сортировка, `top` — по спеке. Закрытый лид → пустой список.
4. Формулировки — дословно из таблицы спеки; даты — `formatActionDate` (из LAYOUT-1) и
   `formatDateKeyRu` (`lead-qualification.ts`) для `regulatory_deadline`.
5. Никаких CSS-классов в `lib` — только смысл (`state`). Карта «state → класс» живёт в компоненте
   (learnings: «Tailwind не сканирует `src/lib`»).

### Verification
```bash
npx tsc --noEmit && npx vitest run tests/unit/lead-signals.test.ts
```

---

## ЗАДАЧА 3: `PipelineCockpit` — три аддитивных пропса, лид на `CockpitRow`

Спека §3.

### Steps
1. `map` в типе становится `ReactNode | fn | null`. В `CockpitRow`: `const hasMap = map != null`;
   без карты — шеврона нет, чип пройденных рендерится `<span>` с теми же классами (без hover и `onClick`).
2. `counterLabel?: string` — если задан, печатается вместо «{days} дн. из {norm} по норме» в ячейке. `title`
   ячейки прежний.
3. `inlineNames?: boolean` — чип пройденных печатает `pastNames.join(' · ')` вместо числа; вместо «+N» —
   по пунктирному чипу на каждое имя из нового пропса `restNames?: string[]` (классы — спека §3).
4. **Сделка и внедрение не меняются:** ни один из новых пропсов они не передают, дефолты = прежнее поведение.
   `LegacyRow` не трогать (им больше никто не пользуется после ЗАДАЧИ 4 — строкой в отчёт: «LegacyRow без
   потребителей», удаление — отдельным решением, не здесь).
5. `LeadDetail`: кокпит передаёт `gauge`, `counterLabel`, `dates` из `leadStatusGauge(lead, new Date())`,
   `groupLabel="Статус лида"`, `inlineNames`, `restNames`, `map={null}`. `currentExtra` и `StageRail`-карта —
   удалить. Импорт `StageRail` из `LeadDetail` уходит.

### Verification
```bash
npx tsc --noEmit
grep -n "LegacyRow\|StageRail\|currentExtra" src/components/leads/LeadDetail.tsx | wc -l     # 0
git diff --stat main -- src/components/projects | tail -1                                   # сделку не трогали
```

---

## ЗАДАЧА 4: `LeadRisksCard` и зона «Риски»

Спека §7, W5. Файл `src/components/leads/LeadRisksCard.tsx`.

### Steps
1. `DealSignals.tsx`: экспортировать `VERDICT_STYLES`, `STATE_STYLES` и `SignalRow`; `SignalRow` —
   дженерик по ключу (`signal: { key: K; state; label; detail; cta }`, `onAction?: (key: K) => void`).
   Типы и поведение сделки не меняются. `DealHealthRing.tsx`: экспортировать `STATE_STROKE`.
2. `LeadRisksCard({ result, onAction })`: строка «Здоровье лида» + чип (подписи лида: «В порядке» / «Внимание» /
   «Остывает», классы — `VERDICT_STYLES`), ряд сегментов (разметка из `DealHealthRing`), подпись-счёт
   (`pluralRu`), список — проблемы `SignalRow`, норма свёрнута «N в норме» (повторить ветку
   `showVerdict={false}` из `DealSignals`, состояние свёртки локальное, не персистить).
3. CTA: `step` → скролл к `#lead-next-step`, `regulatory` → `#lead-qualification` (якорь ставит WORK-1; до него
   CTA `regulatory` скроллит к карточке квалификации по `id`, добавить `id="lead-qualification"` на обёртку
   квалификации в этом спринте).
4. `LeadDetail`: `const signals = useMemo(() => getLeadSignals(lead, new Date()), [lead])`. Зона «Риски» —
   когда `signals.signals.length > 0`; класс зоны по вердикту (`h-attention` / `h-rotting`, ok — дефолт).
   Временная карточка «Сигналы» из LAYOUT-1, `regulatoryMonths`, `showRegWarning`, `showColdSignal` —
   удалить.

### Verification
```bash
npx tsc --noEmit && npx eslint src/components/leads src/components/projects/DealSignals.tsx
grep -n "showRegWarning\|showColdSignal\|regulatoryMonths" src/components/leads/LeadDetail.tsx | wc -l   # 0
grep -n "#[0-9a-fA-F]\{3,6\}\b" src/components/leads/LeadRisksCard.tsx | wc -l                          # 0
```

---

## ТЕСТЫ

`tests/unit/lead-status-gauge.test.ts` — `now` фиксирован 2026-09-27T11:40:00Z (14:40 МСК):
- `new`, создан 20 ч назад → `counterLabel` «20 ч из 24», `pct` 83, state `warn`;
- `new`, создан 5 ч назад → `ok`; 30 ч назад → `over`, `pct` 100; 50 ч → «2 дн. из 1»;
- `contacted`, `first_contacted_at` 18 дн. назад → days 18, norm 7, `over`, `pct` 100;
- `contacted`, `first_contacted_at` 5 дн. назад → `warn` (5/7 = 71%); 3 дн. → `ok`;
- `contacted` без `first_contacted_at` → считается от `updated_at`;
- `qualified` → `norm: null`, `pct: null`, state `ok`, `days` от `qualified_at`;
- `converted`, `disqualified` → `days: null`.

`tests/unit/lead-signals.test.ts` — тот же `now`:
- шаг вчера → `step` bad «Шаг просрочен на 1 дн.», вердикт `rotting`;
- шаг завтра + молчание 30 дн. → `step` ok, **молчание не сигналит**, вердикт `ok`;
- `contacted` без шага, `updated_at` 3 дн. назад → `step` warn «Следующий шаг не назначен»;
- `contacted` без шага, 10 дн. → warn «Молчание 10 дн.»; 15 дн. → bad «… — лид остывает»;
- `new` без шага, 30 ч → warn «Следующий шаг не назначен» (staleness `new` срабатывает с `days > 1`, то есть
  с 48 ч — это правило `leadStaleness`, не менять); 50 ч → warn «Нет первого касания 2 дн.»;
- `regulatory_deadline` сегодня → warn «… — сегодня»; через 4 дн. → «… через 4 дн.» (прежний код писал
  «срок наступил» для всего `regMonths === 0`, то есть до ~15 дн. вперёд — это ошибка, чинится здесь);
  через 2 мес. → «через 2 мес.»; через 5 мес. → нет сигнала; вчера → нет сигнала (правило прежнее: прошедший
  срок — не сигнал этой карточки);
- `new`, 20 ч, без касания → `first_touch` ok «осталось 4 ч»; `contacted`, касание через 14 ч → ok
  «через 14 ч»; касание через 40 ч → сигнала нет;
- сортировка bad → warn → ok; `top` = первый не-ok; `converted` → пустой список, вердикт ok.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint
npx vitest run
npm run build            # последним
```

Смок в браузере, 8 тем (фон зоны «Риски» в `h-attention` / `h-rotting` — глазами в тёмных), 1440 и 1280:
1. Лид `contacted` с просроченным шагом и дедлайном ЧЗ через ≤ 3 мес.: зона `h-rotting`, чип «Остывает»,
   2 проблемы + «1 в норме»; «К шагу» скроллит к стеклу; кокпит «N дн. из 7 по норме», шкала красная, без
   шеврона и карты.
2. Лид `new` моложе суток: зона без тревоги, «20 ч из 24».
3. Лид `qualified`: «3 дн.» без шкалы, точки готовности, «Конвертировать в сделку» с замком при незакрытом
   бюджете.
4. **Регрессия:** кокпит сделки и внедрения — шеврон, карта, «+N», мини-карта на месте.

## КОММИТ

```bash
git add -A
git commit -m "feat(leads): шкала времени в статусе и зона «Риски» лида

S-LEAD-V2-HEALTH-1. leadStatusGauge (нормы из constants/leads) и getLeadSignals
поверх getLeadHealth; PipelineCockpit: map=null, counterLabel, inlineNames/restNames —
аддитивно, сделка не меняется. Слова риска — только в «Рисках» (F-01). Миграций нет."
```
