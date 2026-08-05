# Claude Code Prompt — S-FIX-CO360-1: хвосты Company 360

Три находки гейта S-R2-CO360-1, каждая видна пользователю. Миграций нет, новых
запросов нет, новых зависимостей нет.

**Ветка:** `fix/co360-followups` (от свежего `main`, где уже смержены Company 360
и петроль-акцент).

**Жёсткие рамки:**
- Ни одного файла в `supabase/migrations/`.
- Никаких hardcoded-цветов — только токены.
- `src/types/database.ts` / `supabase.gen.ts` не трогать.
- Пороги `delivery-health.ts` **НЕ менять** — см. примечание в Задаче 3.

---

## РАЗВЕДКА

```bash
# 1. Где инвалидируются кеши после мутаций звонков/встреч/задач
grep -n "invalidateQueries" src/lib/hooks/use-calls.ts
grep -n "invalidateQueries" src/lib/hooks/use-meetings.ts
grep -n "invalidateQueries" src/lib/hooks/use-tasks.ts | head -20

# 2. Ключи новых хуков (менять их НЕ надо — нужны точные строки для инвалидации)
grep -n "queryKey" src/lib/hooks/use-company-team-touch.ts src/lib/hooks/use-contact-strength.ts

# 3. Сколько тема-правил висит на голом теге aside
for t in washi fuji aura minimal; do echo -n "$t: "; grep -c "^\.t-$t aside" src/app/globals.css; done

# 4. Все <aside> в проекте — кто попадает под эти правила
grep -rn "<aside" src/components/

# 5. Как навигационный сайдбар себя помечает сейчас
sed -n '195,215p' src/components/layout/TextNavSidebar.tsx

# 6. Выбор проекта в виджете «Внедрение»
grep -n "activeDeliveries\|const delivery\|stageNameOf\|label=\"Внедрение\"" src/components/companies/CompanyHighlights.tsx
```

---

## ЗАДАЧА 1: Виджеты компании не обновляются после звонка/встречи

**Симптом.** Добавляешь звонок с карточки компании — лента внизу обновляется,
а виджет «Последний контакт», аватарки «кто знает» и strength-бейджи контактов
показывают старое до перезахода на страницу. Два блока на одном экране смотрят
на одни данные и расходятся.

**Причина.** `use-calls` / `use-meetings` инвалидируют `['calls']`,
`['dashboard-stats']`, `['timeline']`. Ключи `['company-team-touch', companyId]`
и `['contact-strength', ids]` не инвалидирует никто.

### 1.1 `src/lib/hooks/use-calls.ts`

В **каждом** `onSuccess`/`onSettled`, где уже есть
`qc.invalidateQueries({ queryKey: ['timeline'] })` (по разведке их три — create,
update, delete), рядом добавить:

```ts
      // S-FIX-CO360-1: виджеты карточки компании считаются из calls/meetings.
      // Инвалидация по ПРЕФИКСУ ключа — накрывает все companyId/наборы контактов
      // разом, точечный ключ здесь пришлось бы собирать из полей мутации.
      qc.invalidateQueries({ queryKey: ['company-team-touch'] });
      qc.invalidateQueries({ queryKey: ['contact-strength'] });
```

### 1.2 `src/lib/hooks/use-meetings.ts`

То же самое, в тех же местах.

### 1.3 `src/lib/hooks/use-tasks.ts` — только под условием

Задачи влияют на strength лишь через `hasUpcoming`, и только когда у задачи есть
`contact_id`. Инвалидировать на каждую мутацию задачи **нельзя**: перетаскивание
карточек по доске — сотни мутаций, и каждая дёргала бы три запроса strength.

Добавить инвалидацию `['contact-strength']` **только** в мутациях создания и
обновления задачи и **только** когда `contact_id` участвует в операции:

```ts
      // S-FIX-CO360-1: upcoming-слагаемое strength зависит от задач контакта.
      // Только при наличии contact_id: на доске задач мутации идут пачками,
      // и безусловная инвалидация гоняла бы запросы на каждый drag.
      if (variables?.contact_id) {
        qc.invalidateQueries({ queryKey: ['contact-strength'] });
      }
```

⚠️ Имя переменной мутации (`variables` / `vars` / деструктуризация) — по факту
кода, не по этому примеру. Если `contact_id` в мутации недоступен, инвалидацию из
`use-tasks` **не добавлять вовсе** и написать об этом в отчёте: обновление
раз в 60 секунд для `hasUpcoming` приемлемо, лишние запросы на доске — нет.

### Проверка задачи 1

```bash
grep -n "company-team-touch\|contact-strength" src/lib/hooks/use-calls.ts src/lib/hooks/use-meetings.ts src/lib/hooks/use-tasks.ts
```

Ручной смок (описать в отчёте): открыть карточку компании → добавить звонок →
виджет «Последний контакт» и бейджи контактов обновились **без** перезагрузки.

---

## ЗАДАЧА 2: Тема-правила навигации бьют по любому `<aside>`

**Симптом.** `.t-washi aside`, `.t-fuji aside`, `.t-aura aside` таргетят голый
тег и красят в sumi/индиго **любую** боковую панель с `!important`, включая текст
внутри неё. На карточке компании это уже поймали (сайдбар переведён на `<div>`),
но под ударом остались `ChatView`, `ActivityDrawer`, `PeekPanel` — по разведке №4.

**Фикс — сузить селекторы до самого навигационного сайдбара**, а не переписывать
все панели на `div`.

### 2.1 Пометить навигацию атрибутом

В `src/components/layout/TextNavSidebar.tsx`, на корневом `<aside>` (по разведке
№5, у него уже есть `aria-label="Основная навигация"`) добавить data-атрибут:

```tsx
    <aside
      data-app-nav
      aria-label="Основная навигация"
```

### 2.2 Переписать тема-правила

В `src/app/globals.css` заменить **все** вхождения селекторов вида
`.t-<тема> aside` на `.t-<тема> aside[data-app-nav]` для тем `washi`, `fuji`,
`aura`, `minimal` (по разведке №3 их суммарно порядка 54).

Механическая замена, безопасная только при точном шаблоне:

```bash
sed -i '' -E 's/^(\.t-(washi|fuji|aura|minimal)) aside/\1 aside[data-app-nav]/' src/app/globals.css
grep -c "aside\[data-app-nav\]" src/app/globals.css   # должно совпасть с суммой из разведки №3
grep -n "^\.t-[a-z]* aside[^[]" src/app/globals.css   # должно быть пусто
```

⚠️ На macOS `sed -i` требует пустой аргумент (`-i ''`) — на Linux он лишний.
Если шаблон не совпал (правило записано в две строки, через запятую или с
отступом) — правь вручную, но добей до пустого вывода второго grep.

⚠️ Специфичность растёт (добавился атрибут), приоритет над компонентными
классами сохраняется — ломаться не должно ничего. Правила с `!important`
работают как раньше.

### Проверка задачи 2

Открыть в темах **washi** и **fuji**, сравнить с тем, как было:
- навигационный сайдбар слева — тёмный sumi/индиго, как и был (не сломали);
- список каналов в `/chat` — светлый, на `bg-surface`, тёмный текст (было тёмное);
- `ActivityDrawer` (правый ящик) и `PeekPanel` (превью записи) — светлые;
- карточка компании — без изменений (там уже `div`).

В отчёте перечислить, что визуально изменилось в чате и панелях: это **ожидаемое**
изменение вида, а не регресс.

---

## ЗАДАЧА 3: Виджет «Внедрение» показывает внутренний проект

**Симптом.** На компании «Ориент продактс» виджет с заголовком «ВНЕДРЕНИЕ»
показывает «Внутренний» — это пресейл-проект `type='internal'`, не внедрение.
Секция ниже честно называется «Внедрения и внутренние», виджет — нет.

**Причина.** `splitCompanyProjects` по контракту кладёт `internal` в
`deliveries`, а виджет берёт первый активный по дедлайну, не разбирая тип.

### Фикс в `src/components/companies/CompanyHighlights.tsx`

1. Среди активных проектов сначала искать настоящие внедрения
   (`type === 'delivery'`); внутренний берётся, только если внедрений нет вовсе.
2. Заголовок виджета следует за тем, что в нём лежит: `Внедрение` для delivery,
   `Внутренний проект` для internal.
3. У internal нет стадии (`stage_id = null`) — в крупной строке виджета для него
   показывать **имя проекта** (truncate + `title`), а не слово «Внутренний»:
   оно уже стоит в заголовке, и повторять его дважды незачем. Прогресс `X/Y`
   показывается для обоих типов, когда `progress_total > 0`.

```tsx
  // ─── 2. Внедрение / внутренний проект ───
  // Настоящее внедрение важнее внутреннего: полоса отвечает на вопрос «что мы
  // сейчас делаем ДЛЯ клиента». Внутренний (пресейл, `stage_id = null`) —
  // запасной вариант, и тогда виджет честно меняет заголовок, а не выдаёт
  // пресейл за внедрение (контракт `splitCompanyProjects` кладёт их в один массив).
  const activeDeliveries = deliveries.filter(...)          // как сейчас
  const realDelivery = activeDeliveries.filter((p) => p.type === 'delivery');
  const pool = realDelivery.length > 0 ? realDelivery : activeDeliveries;
  const delivery = [...pool].sort(byDeadlineThenName)[0];
  const deliveryIsInternal = delivery?.type === 'internal';
```

Заголовок:

```tsx
<Widget icon={Rocket} label={deliveryIsInternal ? 'Внутренний проект' : 'Внедрение'}>
```

`DeliveryValue` получает флаг и при `progress_total === 0` показывает
`stageNameOf(...)` для delivery и `project.name` для internal.

**⚠️ Пороги health НЕ трогать.** На том же скриншоте у просроченного проекта
жёлтая точка, а не красная — это корректная арифметика текущих порогов:
просрочка даёт штраф 40, `100 − 40 = 60`, а `at_risk` начинается ниже 40
(`delivery-health.ts`). Поднять `PENALTY_OVERDUE` — продуктовое решение, которое
перекрасит портфель и доску проектов целиком; в этом спринте его нет.

### Проверка задачи 3

```bash
grep -n "deliveryIsInternal\|realDelivery" src/components/companies/CompanyHighlights.tsx
```

Смок: компания только с внутренним проектом → заголовок «Внутренний проект»,
в крупной строке имя проекта. Компания с настоящим внедрением → «Внедрение»,
прогресс/стадия, внутренний в виджет не лезет.

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run 2>&1 | tail -5
npm run build 2>&1 | tail -5          # последним: убивает живой next dev

# ни одного hardcoded-цвета в тронутых файлах
grep -rn "#[0-9a-fA-F]\{3,6\}" src/components/companies/CompanyHighlights.tsx | grep -v "var(--" || echo "OK"
```

## КОММИТ

```bash
git checkout -b fix/co360-followups
git add .
git commit -m "S-FIX-CO360-1: инвалидация кешей виджетов компании, тема-правила навигации только на aside[data-app-nav], виджет внедрения не выдаёт internal за delivery"
```

В отчёте: где именно добавлена инвалидация (файл + число мест), удалось ли
подключить `use-tasks` под условием, сколько селекторов переписано в globals.css,
что визуально изменилось в чате/панелях в washi и fuji, результат смока по трём
задачам.
