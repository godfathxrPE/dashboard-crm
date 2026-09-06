# Ревью: S-DEAL-SUMMARY-1 — сводка сделки по спеке (W9)

**Дата:** 2026-09-06
**Ревьюер:** Grok (верификация по коду `main` @ `a3d182d` и ветке `feat/deal-chz-1`, crm-architect `learnings.md`, live `DealSummaryCard.tsx` / `deal-completeness.ts` / `use-projects.ts` / `dates.ts` / `docs/schema.md` leads)
**Объект:** `_analysis/sprint-S-DEAL-SUMMARY-1.md` — ИНН, ЛПР, источник, дни в работе, донат полноты; хук компании расширяется
**Контекст:** карта W9. Зависит от S-DEAL-ROLES-1 (ЛПР = роль). Неявно зависит от S-DEAL-CHZ-1 (`use-company-chz`, `formatCalendarDate`) — в шапке этого нет. От развилки вкладок не зависит. Миграций нет.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА | 🟡 команды живые на `main`; `cat use-company-chz.ts` на заявленном входе упадёт |
| Зависимость от ROLES-1 (ЛПР) | ✅ сказано |
| Зависимость от CHZ-1 (хук + форматтер) | ❌ на `main` @ `a3d182d` файлов нет |
| Р-1 рекомендация (в): счётчик не трогать | ✅ верно; два смысла полноты |
| Р-2 рекомендация (а): источник с лида | ✅; колонка называется `converted_deal_id` |
| Р-3 не расширять `PROJECT_COLUMNS` | ✅ тот же аргумент, что CHZ-1 |
| `formatCalendarDate` | 🟡 есть только на `feat/deal-chz-1` (`dates.ts:60`) |
| `+ Указать` / CostDot | ✅ уже в `DealSummaryCard` |
| Донат вместо бейджа | 🟡 у бейджа есть попап missing — не потерять |
| SQL / RLS | ✅ N/A, если Р-2 = (а) |
| CSS-токены | ✅ `--warning` / `--danger-l` существуют |
| Секция ТЕСТЫ | ✅ дни в работе / просрочка, время аргументом |
| Out-of-scope | 🟡 Р-1/Р-2 «решает владелец» — CC встанет без явного «принимаем рекомендацию» |

**Оценка: 80/100 (NO-GO).** Состав полей и отказ от `projects.source` / `decision_maker_id` правильные. На заявленном baseline задача 1 неисполнима: переименовывать нечего.
- Порог передачи в Claude Code: **≥ 85**.
- Открыт B1 → максимум 84.

**Рекомендация:** одна строка во «Вход» — «после мержа `feat/deal-chz-1`» (как у CHZ-2) + «Р-1=(в), Р-2=(а), пока владелец не сказал иначе». Cold review не нужен.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| `DealSummaryCard` | Компания · Контакт · Бюджет · Дедлайн · Создана. ИНН/ЛПР/источника нет |
| `CompletenessBadge` | кнопка `{filled}/{total}` + попап missing (`CompletenessBadge.tsx:19–56`) |
| `DEFAULT_RULES` | компания, контакт, бюджет, стадия, дедлайн, шаг, дата шага, ответственный (+ исходы) |
| `use-company-chz.ts` | **нет на main**; есть на `feat/deal-chz-1` (`id, chz_groups, okved`, ключ `['company-chz']`) |
| `formatCalendarDate` | **нет на main**; на CHZ-1: `formatDateNumeric(\`${iso}T00:00:00\`)` |
| `leads.converted_deal_id` | есть; `converted_project_id` — **нет** |
| Индекс по `converted_deal_id` | в `docs/schema.md` не описан |
| Clipboard | `navigator.clipboard.writeText` + `toast` из `sonner` (AI-панели, TelegramSection) |

---

## Live-разведка (сверка claims)

| Claim спринта | Live | |
|---------------|------|---|
| `DealSummaryCard:75–175` | состав строк `:82–168`; Placeholder «+ Указать» уже есть (`:29–39`); CostDot `bg-yellow` (`:47–54`) | ✅ |
| `deal-completeness.ts:80–145` | 8 рабочих полей + 2 статус-зависимых. Пересечение со спекой — компания, контакт, бюджет, дедлайн | ✅ Р-1 описан честно |
| `use-company-chz.ts` на `main` | файла нет | ❌ |
| `use-projects.ts:175` `companies(id, name)` | `PROJECT_COLUMNS` `:175` | ✅ имя константы `PROJECT_COLUMNS`, не `PROJECT_SELECT` (тот же хвост, что CHZ-1 W9) |
| `converted_project_id` | колонка **`converted_deal_id`** (`docs/schema.md:2175`, `LeadDetail.tsx:283`) | 🟡 разведка грепает не то имя |
| `RailRow` | `RailCard.tsx:42` | ✅ |
| Clipboard | прямого `copyToClipboard` хелпера нет; паттерн — `navigator.clipboard.writeText` + `toast.success` | ✅ не заводить второй |
| `formatCalendarDate` для `date` | смысл верный (UTC-полуночь сдвигает день). На main дедлайн уже через `formatDateNumeric(v)` (`:152–154`) — это и есть баг, который форматтер чинит | 🟡 |
| `--danger-l` / `--warning` | алиасы в `globals.css:2344–2346` | ✅ |
| ЛПР = `decision_maker` из стейкхолдеров | `useDealStakeholders` уже есть; колонки `decision_maker_id` нет и не заводить | ✅ |

---

## С чем согласен полностью

### 1. Р-1 (в): счётчик работы, в таблицу — справочные поля

Код меряет «ведётся ли сделка» (шаг, дата, ответственный). Спека меряет «заполнена ли карточка» (ИНН, ЛПР, источник). Два процента рядом никто не различит. Трогать `deal-completeness.ts` в этом спринте нельзя: org уже может иметь `completeness_rules` в settings. Рекомендация (в) — единственная, которая не ломает настроенные веса.

### 2. Р-2 (а): не заводить `projects.source`

Источник живёт у лида. Сделки заводятся и без лида — колонка сразу наполовину пустая и просит ручной ввод того, что система знает. Читать `leads` по обратной ссылке, нет лида — «+ Указать» без миграции.

### 3. Р-3: не расширять джойн списка сделок

Тот же аргумент, что закрыл CHZ-1: `PROJECT_COLUMNS` кормит воронку, канбан и очередь. ИНН на каждую строку списка не нужен. Один хук карточки компании на зону «Контекст».

### 4. ЛПР — проекция W10, не колонка

Прецедент `companies.phone` ↔ `phones[]`. Клик «+ Указать» ведёт к слоту, не к полю сделки. Точка `--warning` — единственное поле сводки, которое влияет на health: согласовано с W6 после ROLES-1.

### 5. Тесты только чистых функций

Дни в работе и просрочка — календарь МСК, `now` аргументом. Дедлайн сегодня не просрочен. Разметку не покрываем.

---

## Блокеры (критично — исправить до запуска)

### B1. Вход `main = a3d182d` не содержит того, что задача 1 переименовывает

Шапка: «Вход: `main` = `a3d182d`. Зависит от S-DEAL-ROLES-1».

Задача 1: «Переименовать `use-company-chz.ts` → `use-company-card.ts`». Разведка: `cat src/lib/hooks/use-company-chz.ts`.

На `a3d182d` файла нет. Он живёт на `feat/deal-chz-1` (186 строк `DealChzCard`, хук с `select('id, chz_groups, okved')`, ключ `['company-chz']`). Тот же CHZ-1 добавляет `formatCalendarDate` в `dates.ts` — задача 2 на него ссылается («см. S-DEAL-CHZ-1»), не говоря, откуда функция на baseline.

CC на чистом `main` либо создаст второй хук рядом с будущим CHZ-1, либо остановится. Очередь карты ставит SUMMARY **перед** CHZ-2, но **после** CHZ-1 только у четвёртого спринта вход это пишет.

**Вклеить во «Вход»:**

```
Вход: после мержа feat/deal-chz-1 И feat/deal-roles-1.
use-company-chz.ts и formatCalendarDate уже в дереве — задача 1 их переименовывает, не создаёт.
```

Если CHZ-1 к старту не смержен — задача 1 пишется как **создание** `use-company-card` (`select id, chz_groups, okved, inn`), без слова «переименовать», и CHZ-2 потом садится на него.

---

## Предупреждения (желательно исправить)

### W1. Р-1 и Р-2 зафиксировать как принятые рекомендации

«Решает владелец» без галочки в файле — CC напишет в отчёте «ждал решения» и отдаст дырявую сводку. Строка в шапке:

> Пока владелец не сказал иначе: Р-1 = (в), Р-2 = (а). `deal-completeness.ts` не трогать. `projects.source` не заводить.

В отчёте всё равно объяснить почему — спринт это уже просит.

### W2. Колонка — `converted_deal_id`, не `converted_project_id`

Греп разведки (`converted_project_id\|converted_at\|source`) попадёт в `converted_at` и `leads.source`, имя FK промахнёт. В задачу 2:

```ts
.from('leads').select('source').eq('converted_deal_id', projectId).maybeSingle()
```

Индекса под обратный поиск в схеме нет. На объёме org это терпимо; если гейт увидит seq scan — partial index `WHERE converted_deal_id IS NOT NULL` отдельной миграцией, не здесь. Хука «лид этой сделки» нет (`use-leads.ts` только обнуляет поле при дисквале). Завести узкий `useLeadSource(projectId)` рядом, `enabled: !!projectId`, `staleTime` длинный.

Нет лида / нет `source` — Placeholder «+ Указать», без миграции и без ввода на сделке (некуда писать).

### W3. Донат не должен съесть попап missing

`CompletenessBadge` по клику показывает, **какие** поля пусты и чем это стоит (`rule.cost`). Спека — немой 22×22. Задача 3: «меняется только ФОРМА». Сохранить клик/hover со списком missing, иначе ось достоверности (S-R3-TRUST-1) потеряет единственный носитель «что ломается». Знаменатель прежний (вариант в). Цвет дуги — `--green` при 100, иначе как сейчас пороги 60 / 0, семантическими токенами.

### W4. `formatCalendarDate` и дедлайн

На CHZ-1:

```ts
export function formatCalendarDate(isoDate: string): string {
  return formatDateNumeric(`${isoDate}T00:00:00`);
}
```

Дедлайн — колонка `date`. Сейчас сводка гоняет её через `formatDateNumeric(v)` (`DealSummaryCard.tsx:152`) — в TZ западнее UTC день уедет вчера. После B1 форматтер уже в дереве; если CHZ-1 не влит — скопировать эти 3 строки в задачу, не изобретать третий.

`created_at` — timestamptz, `formatDateNumeric` + «N дн. в работе» через `mskDateKey` / `diffDaysKey` (`date-helpers.ts`). Не `Math.floor(ms/86400000)`: это другой день, чем у пульса.

Просрочка: `deadline < сегодня(MSK)` → `--red-text` + чип «−N дн.» на `--danger-l`. Сегодня = 0, не просрочен (тест это уже говорит).

### W5. Ключ `['company-card']` и инвалидация

Ревью CHZ-1 (W4): ключ `['company-chz']` не сбрасывается `useUpdateCompany` (там `['companies']`). Rename на `['company-card', companyId]` дыру не лечит: после «Уточнить ИНН в карточке компании → назад» 5 минут stale. Либо ключ `['companies', companyId, 'card']`, либо явный `invalidateQueries` в `useUpdateCompany` / `useDeleteCompany`. В verification — grep нового ключа в `use-companies.ts`.

`inn` уже в типе `Company` (`use-companies.ts:18`). Select дописать.

### W6. Точка ЛПР vs существующий CostDot

CostDot на контакте/бюджете — `bg-yellow` + `title={rule.cost}` из полноты. У ЛПР правила полноты нет (вариант в счётчик не трогает) — `title` сочинять нельзя («два источника одного факта»). Точка `--warning` + `title="ЛПР не в контуре — ключевой риск стадии"` из hint сида ROLES, не новый текст.

Порядок строк по спеке: Компания · ИНН · Контакт · Бюджет · Дедлайн · ЛПР · Источник · Создана. «Тип воронки» в таблицу не добавлять — он в шапке сделки.

ИНН «+ Указать» → `/companies/${id}` (как ClarifyLink в CHZ-карточке), не `onEdit` модалки сделки: ИНН принадлежит компании.

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| `feat/deal-chz-1:src/lib/hooks/use-company-chz.ts` | весь | переименовать + `inn` |
| `feat/deal-chz-1:src/lib/utils/dates.ts` | 60–62 | `formatCalendarDate` |
| `src/components/projects/DealSummaryCard.tsx` | 82–168 | новые строки; дедлайн на calendar-форматтер |
| `src/components/projects/CompletenessBadge.tsx` | 19–56 | форма доната, попап оставить |
| `src/lib/hooks/use-companies.ts` | 213+ | инвалидация ключа карточки |
| `src/lib/hooks/use-leads.ts` | — | нет обратного поиска; новый узкий хук |
| `src/lib/domain/deal-completeness.ts` | — | **не трогать** при Р-1=(в) |

---

## Предлагаемые правки в спринт

1. **B1.** Вход = после CHZ-1 + ROLES-1.
2. **W1.** Р-1=(в), Р-2=(а) — дефолт файла.
3. **W2.** Имя колонки `converted_deal_id` в разведку и задачу.
4. **W3.** Донат + сохранившийся список missing.
5. **W5.** Инвалидация ключа вместе с rename.

---

## Чеклист перед CC

- [ ] CHZ-1 влит (или задача 1 переписана как создание хука)
- [ ] ROLES-1 влит: иначе клик ЛПР ведёт в плоский список
- [ ] Р-1/Р-2 не ждут отдельного ответа владельца
- [ ] `deal-completeness.ts` в «не трогать»
- [ ] Миграций нет
