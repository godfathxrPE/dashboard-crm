# Спринт S-DEAL-CHZ-2 — фаза группы ЧЗ из даты, строки групп и подвал по спеке W11

**Переписан 26.09.2026 по сверке входа** (редакция от 06.09 заменена целиком — причины ниже).
**Вход:** `main` ≥ `7b20b1b` (STATUS ревизия 64). **Миграций НЕТ.** **Ветка:** `feat/deal-chz-2`,
worktree по `worktree-isolation`. **Спецификация:** `_analysis/deal-v2-spec.html`, комментарий
над `<article data-widget="chz">`.

---

## Почему файл переписан

Сверка входа 26.09 нашла, что редакция от 06.09 построена на протухшем статусе и неверно
прочитала спеку:

1. **`status: 'starting'` в `src/lib/data/chz-groups.ts` статичен, а спека определяет
   стартующую группу временем — «обязанность наступает ≤ 6 мес.».** У всех шести групп со
   `starting` `since` лежит в диапазоне 2026-03…2026-09, то есть на 26.09 они **уже
   стартовали**. Бейдж сегодня пишет «стартует 2026-03» на четырёх экранах (сделка,
   `CompanySidebar`, `CompanyHighlights`, AI-бриф) и в промпте `ai-run`. Живая БД: у 8 из
   26 сделок с компанией ОКВЭД попадает в «стартующую» группу, у 3 группа подтверждена
   вручную. Если сделать подложку по статичному статусу, ложный «горячий лид» станет громче.
   **Решение владельца 26.09: фазу считать из `since` и `now` на всех экранах.**
2. Пункт «`note` под названием группы» **уже сделан**: рендерится в `DealChzCard` и
   `CompanySidebar`. Пустой `note` только у «Мука, макароны, мёд», и это вопрос данных,
   а не UI. Из спринта пункт снят.
3. Подвал спеки «ОКВЭД 32.50 · 20.20» — это **два кода**, описания там нет. У нас
   `companies.okved` — одна строка (в БД 0 значений с несколькими кодами). Подвал
   показывает «ОКВЭД {код}», описание не выводим.
4. Тег статуса проверки — **решение владельца 26.09: оставить «гипотеза по ОКВЭД»**
   (говорит, откуда данные). Спековое «проверить» не берём, `title` не добавляем:
   код ОКВЭД теперь стоит в подвале.
5. Скрытие для не-IIoT воронок закрыто ещё 06.09 (Р-В: не скрываем) и в спринт не входит.

**Вне скоупа:** пересверка снапшота с честныйзнак.рф (данные от 03.08; `note` мясной группы
уже ссылается на «колбасы 2026-10»). Производная фаза уменьшает вред от устаревшего
справочника, но пересверку не заменяет. Это хвост данных, его делает владелец.
`CHZ_GROUPS` и `CHZ_SNAPSHOT_DATE` в этом спринте **не трогать**.

---

## Модель фазы — контракт

```
ChzPhase = 'mandatory' | 'starting' | 'planned' | 'experiment'
CHZ_START_HORIZON_MONTHS = 6

chzPhase(g, now):
  g.status === 'experiment'              → 'experiment'   (дата не участвует)
  g.since не в формате YYYY-MM           → g.status        (год без месяца — давно действующие)
  d = месяцев от месяца now до месяца since (календарно, по локальной дате now)
  d < 0                                  → 'mandatory'     (уже наступила)
  0 ≤ d ≤ HORIZON                        → 'starting'      (текущий месяц включительно)
  d > HORIZON                            → 'planned'       (далеко, без подсветки)
```

Подписи (`chzStatusLabel(g, now)`): `mandatory` → «обязательна с {since}», `starting` и
`planned` → «старт {since}» (формулировка спеки), `experiment` → «эксперимент {since}» (без
изменений). Порядок вывода (`phaseChzGroups`): starting → mandatory → planned → experiment,
внутри фазы — табличный. Так в макете: стартующая группа стоит первой.

Сегодня (26.09) по этой модели подсвечивается одна группа: «Мука, макароны, мёд» (2026-09).
Остальные пять бывших `starting` становятся «обязательна с 2026-0X».

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -1
grep -n "export\|STATUS_RANK" src/lib/data/chz-groups.ts
diff <(sed -n '/^export/,$p' src/lib/data/chz-groups.ts) <(sed -n '/^export/,$p' supabase/functions/ai-run/chz-groups.ts) && echo "зеркало совпадает"
grep -rn "chzStatusLabel\|ChzBadge\|\.status === 'starting'" src supabase/functions --include=*.ts --include=*.tsx | grep -v "lib/data/chz-groups.ts\|ai-run/chz-groups.ts"
grep -rn "стартует\|chzStatusLabel" tests/ | head
grep -n "className\|RailCard" src/components/shared/RailCard.tsx | head -15
grep -n "\-\-bg:" src/app/globals.css | head -3
grep -n "\-\-warning" src/app/globals.css | head
```

Ответить до кода:
- зеркало `ai-run/chz-groups.ts` совпадает с клиентским (иначе стоп — это отдельный дефект);
- полный список потребителей `chzStatusLabel` / `ChzBadge` / `status === 'starting'` —
  ожидается: `DealChzCard`, `CompanySidebar`, `CompanyHighlights`, `CompanyBriefRenderer`,
  `ai-run/index.ts`. Нашёлся ещё один — он тоже переходит на фазу;
- какой фон у `RailCard` — чтобы строка `surface2` на нём читалась (не сливалась).

---

## ЗАДАЧА 1: Фаза группы — домен и зеркало

### Context
Статус «стартует» — функция времени, а не свойство записи справочника. Чистая функция
с `now` аргументом (конвенция проекта: время аргументом, не `Date.now()` внутри — журнал,
`leadStaleness`).

### Steps
1. В `src/lib/data/chz-groups.ts` добавить: `export type ChzPhase`,
   `export const CHZ_START_HORIZON_MONTHS = 6`, `export function chzPhase(g, now: Date): ChzPhase`,
   `export interface PhasedChzGroup extends ChzGroup { phase: ChzPhase; label: string }`,
   `export function phaseChzGroups(groups: ChzGroup[], now: Date): PhasedChzGroup[]`.
   Контракт выше. `since` разбирать строго `/^(\d{4})-(\d{2})$/`, месяц 1–12; мусор → `g.status`.
2. `chzStatusLabel(g)` → `chzStatusLabel(g, now: Date)`, подпись по фазе. Второй
   аргумент **обязательный**: иначе забытый вызов молча останется статичным.
3. `matchChzGroups` и `STATUS_RANK` **не менять**: мирор-страж сравнивает их вывод, а
   сортировка по фазе живёт в `phaseChzGroups`.
4. Файл остаётся чистым (ни одного импорта). Шапочный комментарий `ChzStatus` дополнить
   одной строкой: «`status` — снапшот на дату справочника; на экран идёт `chzPhase`».
5. **Зеркало:** те же правки дословно в `supabase/functions/ai-run/chz-groups.ts`.

### Verification
```bash
diff <(sed -n '/^export/,$p' src/lib/data/chz-groups.ts) <(sed -n '/^export/,$p' supabase/functions/ai-run/chz-groups.ts) && echo OK
grep -n "import" src/lib/data/chz-groups.ts | wc -l   # 0
```

---

## ЗАДАЧА 2: Экраны компании и AI-бриф на фазу

### Steps
1. `src/components/shared/ChzBadge.tsx`: проп `status: ChzPhase` (было `ChzStatus`).
   `starting` → `bg-warning-l` + `text-warning-text` (семантический токен вместо `yellow`;
   внутри `.sheet` `--warning-text` уже переадресован). `mandatory` — как сейчас (`green`).
   `planned` и `experiment` — нейтральный тег `bg-surface2 text-text-mute`. Комментарий
   шапки поправить: «горячий» определяется фазой, а не статусом справочника.
2. `CompanySidebar.tsx`, `CompanyHighlights.tsx`: `const now = new Date()` один раз на
   рендер → `phaseChzGroups(groups, now)` → `ChzBadge status={g.phase} label={g.label}`.
   В `CompanyHighlights` `chz = phased[0]`, `hot={chz.phase === 'starting'}`. Раньше
   `chzGroups[0]` выбирался по статичному рангу (mandatory первым), и при смешанном
   профиле стартующая группа в полосу не попадала вообще.
3. `CompanyBriefRenderer.tsx`: `chzStatusLabel(g, new Date())`.
4. `supabase/functions/ai-run/index.ts` (~стр. 902): `phaseChzGroups(chz, new Date())` и
   `g.label` в строке промпта. Иначе модель получает «стартует 2026-03» как факт.
   Импорт — из `./chz-groups.ts`.

### Verification
```bash
grep -rn "chzStatusLabel(g)\|chzStatusLabel(chz)\|status === 'starting'" src supabase/functions | wc -l   # 0
npx tsc --noEmit
```

---

## ЗАДАЧА 3: Строки групп в `DealChzCard` по спеке

### Context
Спека W11: каждая группа — строка-плашка. Стартующая (фаза `starting`) — тёплая подложка
и рамка, действующая — `surface2`. Это носитель состояния: «начнётся в этом месяце»
и «действует пять лет» — это разные разговоры с клиентом.

### Steps
Файл `src/components/projects/DealChzCard.tsx`, блок `profile.groups.map`:
1. `const now = new Date()`; итерировать `phaseChzGroups(profile.groups, now)`.
2. Строка: радиус как у соседних строк рельса (`rounded-xl`, сверить с `DealStakeholders`),
   паддинг `px-3 py-2.5`, промежуток между строками `space-y-2`. Название слева
   (`text-sm font-medium text-text-main`), `ChzBadge` справа (`flex items-start justify-between gap-2`).
   `note` под ними, `text-xs text-text-mute mt-0.5`.
3. `phase === 'starting'`: фон `color-mix(in srgb, var(--warning) 8%, var(--bg))`, рамка
   `1px solid color-mix(in srgb, var(--warning) 25%, var(--bg))`. Смешивать от `--bg`
   (твёрдый во всех темах), **не от `transparent` и не rgba**. Прецедент — `--cal-line` и
   зоны в `globals.css`. Задать через `style`, как в `ChzBadge`, или утилитой-аркой
   Tailwind. Отдельную CSS-переменную **не заводить**: одно место, одно применение.
4. Остальные фазы: `bg-surface2`, без рамки.
5. Блок сирот, тег «подтверждено / гипотеза по ОКВЭД», `ClarifyLink` и состояния
   loading / error / none **не трогать**.

### Verification
```bash
grep -n "#[0-9a-fA-F]\{3,6\}\b\|rgba(" src/components/projects/DealChzCard.tsx src/components/shared/ChzBadge.tsx | wc -l   # 0
python3 scripts/audit-contrast.py 2>&1 | tail -5
```

---

## ЗАДАЧА 4: Подвал «ОКВЭД ↔ справочник»

### Steps
1. `SnapshotNote` заменить на `ChzFooter({ okved }: { okved: string | null })`: одна строка
   `mt-3 flex items-baseline justify-between gap-2 text-xs text-text-dim`. Слева
   `ОКВЭД {okved.trim()}`, только если значение непустое; иначе пустой `<span />`, чтобы
   правая часть осталась прижатой вправо. Справа `справочник {CHZ_SNAPSHOT_DATE.slice(0, 7)}`
   с `title={\`Снапшот ${formatCalendarDate(CHZ_SNAPSHOT_DATE)} · Источники: …\`}`.
   Полная дата уходит в подсказку, текстом остаётся версия, как в спеке.
2. Подвал ставится во всех ветках, где сейчас стоит `SnapshotNote` (none/asked, none/not
   asked, группы). `okved` берётся из `data.okved` (`useCompanyChz`), **новых запросов нет**.
3. Комментарий над бывшим `SnapshotNote` (про `title` и скринридер) перенести к `ChzFooter`,
   он в силе.

### Verification
```bash
grep -n "SnapshotNote" src/components/projects/DealChzCard.tsx | wc -l   # 0
grep -n "okved" src/components/projects/DealChzCard.tsx
```

---

## ТЕСТЫ

`tests/unit/chz-groups.test.ts`. Кейсы описаны поведением, `now` фиксирован:

| # | Вход | Ожидание |
|---|---|---|
| 1 | `starting`, since `2026-09`, now 2026-09-26 | `starting`, «старт 2026-09» (текущий месяц включён) |
| 2 | `starting`, since `2026-03`, now 2026-09-26 | `mandatory`, «обязательна с 2026-03» |
| 3 | since `2027-03`, now 2026-09-26 | `starting` (ровно 6 мес., граница включительно) |
| 4 | since `2027-04`, now 2026-09-26 | `planned`, «старт 2027-04» |
| 5 | since `2027-01`, now 2026-12-15 | `starting` (переход года) |
| 6 | `mandatory`, since `2019` | `mandatory`, «обязательна с 2019» (год без месяца → статус как есть) |
| 7 | `experiment`, since `2026` | `experiment`, «эксперимент 2026» при любом now |
| 8 | мусор в since: `2026-13`, `''`, `2026-9` | фаза = `g.status`, без исключения |
| 9 | `phaseChzGroups([mandatory, starting-в-окне, experiment])` | порядок starting → mandatory → experiment; две mandatory сохраняют табличный порядок |
| 10 | `phaseChzGroups(CHZ_GROUPS, 2026-09-26)` | ровно одна `starting` — «Мука, макароны, мёд». Фиксирует сегодняшнюю картину, чтобы правка снапшота была видна в диффе теста |

Старый кейс «`chzStatusLabel` … `стартует 2026-03`» переписать под `now` (он становится
кейсом 2). В describe «зеркала клиент ↔ edge синхронны» добавить: `chzPhase` и
`chzStatusLabel` клиента и edge совпадают на всех `CHZ_GROUPS` при трёх датах
(2026-03-15, 2026-09-26, 2027-06-01). Прогнать `tests/unit/company-brief-chz.test.tsx`:
если он проверяет текст подписи, обновить его под `now`, **не ослабляя** проверку.

UI (`DealChzCard`, `ChzBadge`) без юнит-тестов: разметка и токены, логика вынесена в `lib/`.

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | tail -8
python3 scripts/audit-contrast.py 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Визуально, `npm run dev`: сделка, у компании которой ОКВЭД `10.61`/`10.73`/`01.49` или
подтверждена «Мука, макароны, мёд» (если такой нет — завести тестовую компанию, живые
записи клиентов не трогать). Тема **minimal** первой, затем остальные шесть: стартующая
строка отличима от действующей, тег «старт» читается на своей подложке, подвал в одну
строку. Карточка компании с тем же ОКВЭД: виджет «Маркировка ЧЗ» в полосе подсвечен.

---

## КОММИТ

```
feat(deals): ЧЗ — фаза группы из даты, строки групп и подвал по спеке W11

Статус «стартует» считался снапшотом справочника и на 26.09 врал на четырёх
экранах и в промпте ai-run. Фаза теперь выводится из since и now (горизонт
6 мес.), сортировка — стартующие первыми. DealChzCard: строки-плашки,
тёплая подложка у стартующей, подвал «ОКВЭД ↔ справочник YYYY-MM».
```

После мержа отдельно выкатить edge-функцию (прод, делает владелец):
`npx supabase functions deploy ai-run --project-ref uoiavcabxgdjugzryrmj`.
Контракт ответа не меняется, поэтому порядок относительно фронта не важен.
