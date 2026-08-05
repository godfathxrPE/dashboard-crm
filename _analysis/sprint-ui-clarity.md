# Claude Code Prompt — S-UI-CLARITY-1: честные числа, честные состояния, уборка

Пять хвостов из гейтов S-R2-CO360-1 и S-FIX-CO360-1. Все видны пользователю или
защищают от тихой поломки. Миграций нет, новых запросов нет.

**Ветка:** `fix/ui-clarity` от свежего `main`.

**Жёсткие рамки:**
- Ни одного файла в `supabase/migrations/`.
- Никаких hardcoded-цветов — только токены.
- `src/types/database.ts` / `supabase.gen.ts` не трогать.
- Пороги `deal-health.ts` / `delivery-health.ts` не менять.

---

## РАЗВЕДКА

```bash
# 1. Три числа в шапке сделки — где каждое рисуется
grep -n "headerProb\|headerStage.probability\|CompletenessBadge" src/components/projects/ProjectDetail.tsx | head
grep -n "pct\|{pct}%" src/components/projects/StackedPipeline.tsx | head

# 2. Пустой «Следующий шаг» — как рендерится сейчас
grep -n "Следующий шаг\|Какой следующий шаг\|назначить" src/components/projects/DealFocusPanel.tsx

# 3. Тип события ленты — что уже есть в TimelineEvent
cat src/types/timeline.ts
grep -n "event_type\|kind" src/lib/timeline/adapters.ts | head -20
grep -n "activity_log\|event_type" src/lib/hooks/use-entity-timeline.ts | head -20

# 4. Признак drawer в темах (после S-FIX-CO360-1 остался на :not([aria-label]))
grep -n "aside:not(\[aria-label\])" src/app/globals.css
grep -n "<aside" src/components/layout/ActivityDrawer.tsx src/components/chat/ChatView.tsx

# 5. Удаление задачи — что приходит в мутацию
grep -n "useDeleteTask" -A 25 src/lib/hooks/use-tasks.ts | grep -n "mutationFn\|onSuccess\|invalidate\|id" | head

# 6. Как устроены существующие юнит-тесты хуков (есть ли моки supabase)
ls tests/unit/ && grep -rln "supabase" tests/ | head
```

---

## ЗАДАЧА 1: Три метрики сделки без подписей

**Симптом.** В шапке сделки одновременно: пилюля «Защита КП · **80 %**»,
полоса воронки «**82 %**» и бейдж «**6/8**». Три разные величины, два процента
рядом, ни один не подписан — читается как одно число с ошибкой округления.

**Что это на самом деле** (установлено разведкой, не гадать):
- `80 %` — `headerStage.probability`, вероятность закрытия на текущей стадии;
- `82 %` — `StackedPipeline`, доля пройденного пути по воронке (в коде уже стоит
  комментарий «НЕ legacy probability»);
- `6/8` — `CompletenessBadge`, заполненность полей сделки.

**Фикс — назвать величины, не меняя их.** Числа остаются, добавляется смысл:

1. `src/components/projects/ProjectDetail.tsx`, пилюля стадии: вместо
   `${headerStage.name} · ${probability}%` → `${headerStage.name} · вероятность ${probability}%`.
   Если строка перестаёт помещаться на узких экранах — оставить «· ${probability}%»,
   но добавить `title="Вероятность закрытия на этой стадии"` на пилюлю.
2. `src/components/projects/StackedPipeline.tsx`, процент справа от полосы:
   подписать `Пройдено {pct}%` (или `title="Доля пройденных стадий воронки"`, если
   ширины нет — решить по факту вёрстки, но **молчащих процентов остаться не должно**).
3. `CompletenessBadge` — число `6/8` оставить как есть, но у бейджа обязан быть
   `title` вида «Заполнено 6 из 8 ключевых полей сделки». Проверить, что он есть;
   нет — добавить.

⚠️ Не трогать сами величины и не сводить их в одну. Это три разных вопроса
(«насколько вероятно», «как далеко прошли», «всё ли заполнено»), и объединение
любых двух — потеря информации.

---

## ЗАДАЧА 2: Пустой «Следующий шаг» выглядит заполненным

**Симптом.** В блоке «Следующий шаг» при пустом `next_step` стоит текст
«Какой следующий шаг?» тем же весом и цветом, что реальное значение, а ниже
«Дата: назначить». Пустое поле читается как заполненное — менеджер пролистывает
его как сделанное.

**Фикс** в `src/components/projects/DealFocusPanel.tsx`:
- текст-приглашение красить `text-text-mute` и `italic` (как пустые состояния
  секций карточки компании: «Нет сделок. Привяжи компанию…»);
- «Дата: назначить» — тем же приглушённым стилем;
- если блок кликабелен (открывает inline-редактор) — приглашение остаётся
  кликабельным, меняется только вес/цвет.

Заполненное значение своего вида не меняет — правка касается **только** ветки
пустого состояния.

---

## ЗАДАЧА 3: Чип «Заметки» шире своего лейбла

**Симптом.** Фильтр ленты «Заметки» (`kind='activity'`) на деле включает весь
`activity_log`, в том числе системные записи (смена стадии, изменения полей).
Пользователь фильтрует «Заметки», получает системный шум.

**Причина.** В `TimelineEvent` нет `event_type` — разделить нечем (это отмечено
комментарием в `EntityTimeline.tsx`, долг S-R2-CO360-1).

**Фикс:**
1. `src/types/timeline.ts` — добавить в `TimelineEvent` опциональное поле
   `eventType?: string | null` (камelCase, как остальные поля типа).
2. `src/lib/timeline/adapters.ts` (или там, где строятся события из `activity_log`
   по разведке №3) — прокинуть `event_type` строки в это поле. Селект в
   `use-entity-timeline.ts` расширить на одну колонку, если её там нет.
3. `src/components/shared/EntityTimeline.tsx`:
   - `KIND_LABEL.activity` переименовать в **«Система»** — это честное имя для
     `activity_log` целиком;
   - добавить **производный** фильтр «Заметки»: события `kind='activity'`, у
     которых `eventType` указывает на заметку (точное значение — из данных:
     `grep -n "type.*note\|'note'" src/lib/utils/activity-events.ts`);
   - если в данных заметки от системных записей не отличаются вовсе — чип
     «Заметки» **убрать**, оставив «Система», и написать об этом в отчёте.
     Ложный фильтр хуже отсутствующего.

⚠️ `kindFilter`/`splitUpcoming`/`filter` — не ломать: другие страницы
(`ProjectDetail`, `ContactDetailHub`, `MessageThread`) передают props не полностью
и должны рендериться ровно как сейчас.

---

## ЗАДАЧА 4: Признак drawer в темах держится на хрупком селекторе

После S-FIX-CO360-1 навигация опознаётся по `data-app-nav`, а drawer — по
`:not([aria-label])`. Признак «у элемента нет aria-label» ломается от любого
улучшения доступности и заодно цепляет `<aside>` списка каналов в `ChatView`.

**Фикс:**
1. `src/components/layout/ActivityDrawer.tsx` — на корневой `<aside>` добавить
   `data-drawer`.
2. `src/app/globals.css` — заменить `.t-aura aside:not([aria-label])` на
   `.t-aura aside[data-drawer]`, комментарий обновить: признак теперь явный, а не
   «от противного». Второе правило (`.t-aura aside:not([data-app-nav]) .bracket`)
   оставить как есть — оно про виджеты внутри ящика и работает верно.
3. Проверить, что скругление левых углов drawer в `t-aura` на месте, а список
   каналов чата его больше не получает (он его и не должен был).

---

## ЗАДАЧА 5: Тесты на агрегацию хуков Company 360

Домен `relationship-strength` покрыт 15 кейсами, а агрегация, которая его кормит,
— нет. Ломается тихо: «состоявшееся касание vs запланированное», окно 90 дней,
приоритет последнего касания.

**Фикс — вынести чистую часть и покрыть её**, не мокая Supabase:

1. Из `src/lib/hooks/use-company-team-touch.ts` вынести агрегацию в чистую функцию
   (тот же файл или `src/lib/domain/company-touch.ts` — решить по факту, но
   функция обязана быть **без** запросов и без `Date.now()` внутри: «сейчас»
   передаётся параметром):
   ```ts
   export function aggregateTeamTouch(
     calls: {date: string; created_by: string|null; status: string}[],
     meetings: {date: string; created_by: string|null}[],
     now: Date,
   ): CompanyTeamTouch
   ```
2. Так же поступить с агрегацией в `use-contact-strength.ts`.
3. `tests/unit/company-touch.test.ts` — минимум 8 кейсов:
   - `pending`-звонок не считается касанием, но даёт `hasUpcoming`;
   - прошедший `pending` (забыли отметить) — ни касание, ни upcoming;
   - встреча сегодня — касание, завтра — upcoming;
   - касание за пределами 90 дней не попадает в `whoKnows`, но может быть
     `lastTouch`;
   - `created_by = null` не создаёт запись в `whoKnows`;
   - тай-брейк `whoKnows` по свежести при равном количестве;
   - `whoKnows` не длиннее трёх;
   - контакт без касаний → `strength.score = 0`, `band = 'cold'`.

⚠️ Тесты кладутся в `tests/unit/` — `vitest.config.ts` включает **только**
`tests/unit/**`, файл в `src/` не запустится и покажет ложный «passed».

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run 2>&1 | tail -6
npm run build 2>&1 | tail -5          # последним: убивает живой next dev

grep -rn "#[0-9a-fA-F]\{3,6\}" src/components/projects/StackedPipeline.tsx src/components/shared/EntityTimeline.tsx | grep -v "var(--" || echo "OK: no hardcoded colors"
```

Ручной смок: карточка сделки в **minimal** — три числа читаются как три разные
величины; пустой «следующий шаг» выглядит пустым; фильтр ленты на карточке
компании даёт то, что обещает чипом; drawer в **aura** скруглён, чат — нет.

## КОММИТ

```bash
git checkout -b fix/ui-clarity
git add .
git commit -m "S-UI-CLARITY-1: подписаны три метрики сделки, пустой next_step как пустое состояние, честный фильтр ленты, data-drawer, тесты агрегации Company 360"
```

В отчёте: что решено по чипу «Заметки» (производный фильтр или удаление и
почему), куда вынесены чистые агрегации, сколько кейсов в новых тестах,
результат смока по трём темам.
