# Claude Code Prompt — Sprint S-R2-CO360-1: Company 360 — пересборка карточки компании

**Roadmap:** R2-P1, пункты F6 (Company 360) + D1 (relationship strength) + D2 (org-wide
last touch + who-knows). Backlog sprint prompt №10.

**Визуальный референс:** `_analysis/company-360-mockup.html` — открой в браузере,
там переключатель всех 7 тем. Итоговая страница должна соответствовать ему по
структуре и иерархии. Мокап — HTML-концепт, классы из него в React не копируются:
вся стилизация — Tailwind-утилиты проекта на CSS-токенах.

**Ветка:** `feat/company-360`

**Жёсткие рамки спринта:**
- **Миграций НЕТ.** Ни одного файла в `supabase/migrations/`. Всё считается на клиенте
  из существующих таблиц (calls, meetings, tasks, projects, contact_company).
- **Никаких hardcoded-цветов** — только `var(--token)` / Tailwind-классы проекта,
  завязанные на токены (`text-text-mute`, `bg-surface2`, `bg-yellow-l`, …).
- **Ownership: `created_by`, НЕ `user_id`** (calls/meetings владеют через created_by).
- `src/types/database.ts` / `supabase.gen.ts` **не трогать**.
- Pinned-заметка компании (жёлтый блок над лентой в мокапе) — **ВНЕ спринта**:
  требует колонку/флаг, это отдельная фича. Не реализовывать, не имитировать.

---

## РАЗВЕДКА (перед любыми изменениями)

```bash
# 1. Текущая структура CompanyDetail (что переносим, что выкидываем)
wc -l src/components/companies/CompanyDetail.tsx
grep -n "Bracket\|data-card\|ChzBadge\|formatCompany360Summary" src/components/companies/CompanyDetail.tsx | head -20

# 2. Существующий last-touch механизм — БАЗА для strength, не дублировать
cat src/lib/hooks/use-last-touch.ts

# 3. Что экспортирует deal-health (порядок severity для worst-health виджета)
grep -n "export" src/lib/utils/deal-health.ts src/lib/utils/delivery-health.ts

# 4. SpawnWizard — props для CTA «Запустить внедрение»
grep -n "interface.*Props\|export function SpawnWizard" src/components/projects/SpawnWizard.tsx
grep -n "SpawnWizard" src/components/projects/*.tsx | grep -v "SpawnWizard.tsx"

# 5. EntityTimeline — текущие props и сортировка (для фильтра и Предстоящее/Ранее)
sed -n '1,60p' src/components/shared/EntityTimeline.tsx
grep -n "kind\|sort\|order" src/lib/hooks/use-entity-timeline.ts | head -20

# 6. ContactDetailHub — паттерн HighlightCard/hub-layout (референс структуры, не копировать 1:1)
grep -n "HighlightCard\|RIGHT COLUMN\|grid-cols" src/components/contacts/ContactDetailHub.tsx | head

# 7. Хуки calls/meetings: как фильтруются, какие поля селектятся
grep -n "from('calls')\|from('meetings')\|select(" src/lib/hooks/use-calls.ts src/lib/hooks/use-meetings.ts | head

# 8. Профили для who-knows (имена/аватарки актёров)
grep -n "export" src/lib/hooks/use-team-members.ts | head

# 9. Tailwind-маппинг токенов (какие утилиты доступны)
sed -n '1,60p' tailwind.config.ts

# 10. formatBudget и склонения
grep -n "formatBudget" src/lib/validators/project.ts
```

⚠️ Если разведка противоречит этому промпту (имена props, экспорты) — истина в коде,
адаптируйся, но цель задач не меняй.

---

## ЗАДАЧА 1: Домен — relationship strength (D1), чистая функция + тесты

Новый файл `src/lib/domain/relationship-strength.ts`. Только домен, ноль запросов.

```ts
// Формула из CRM-ROADMAP-2-ARCHITECTURE §4.5 (P1-E).
// recency 0–50: кусочно-линейно по daysSince последнего касания:
//   0 дн → 50; 21 дн → 25; 60+ дн → 0 (между точками — линейная интерполяция)
// frequency 0–40: min(40, touches90d * 5) — касание = звонок или встреча за 90 дн
// upcoming 0–10: 10, если есть запланированное будущее касание
//   (call status='pending' с date в будущем, meeting с date >= сегодня,
//    task с deadline в будущем на этом контакте), иначе 0
export interface StrengthInput {
  daysSinceLastTouch: number | null; // null = касаний не было
  touches90d: number;
  hasUpcoming: boolean;
}
export type StrengthBand = 'strong' | 'warm' | 'cold';
export interface Strength { score: number; band: StrengthBand; }

export function relationshipStrength(input: StrengthInput): Strength
// score = recency + frequency + upcoming, округлить до целого
// касаний не было вовсе → { score: 0, band: 'cold' }
// bands: strong >= 65, warm >= 30, cold < 30
```

Юнит-тесты `src/lib/domain/relationship-strength.test.ts` (vitest уже настроен):
границы recency (0/21/60/интерполяция), cap frequency на 40, банды на 65/30/29,
null-кейс. Минимум 6 кейсов.

---

## ЗАДАЧА 2: Хук `useCompanyTeamTouch` (D2) — last touch + who-knows

Новый файл `src/lib/hooks/use-company-team-touch.ts`.

Один хук, **два лёгких запроса** (calls + meetings по company_id), агрегация на клиенте:

```ts
export interface CompanyTeamTouch {
  lastTouch: { date: string; kind: 'call' | 'meeting'; actorId: string | null } | null;
  // top-3 актёров по числу касаний за 90 дней, отсортированы по count desc
  whoKnows: { actorId: string; count: number; lastAt: string }[];
}
export function useCompanyTeamTouch(companyId: string): UseQueryResult<CompanyTeamTouch>
```

Требования:
- Ключ React Query: `['company-team-touch', companyId]` (конвенция проекта).
- Селектить только нужные поля: `id, date, created_by, status` (calls) /
  `id, date, time, created_by` (meetings). Не тащить ai_summary и тексты.
- calls: считать касанием только `status = 'done'`; будущие/pending — не касание
  (они пойдут в `hasUpcoming` в Задаче 3).
- meetings: `date <= сегодня` — касание; будущие — upcoming.
- `whoKnows` — группировка по `created_by` (NULL отбрасываем), top-3.
- Имена/аватары актёров хук НЕ резолвит — UI маппит через существующий
  `use-team-members` (разведка №8).
- `enabled: !!companyId`.

⚠️ RLS сам ограничит выборку организацией — `org_id` в запрос руками не писать
(клиентские хуки проекта его не пишут, проверь по use-calls.ts и делай так же).

---

## ЗАДАЧА 3: Strength-мапа контактов компании

По результатам разведки №2 — **расширить** `use-last-touch.ts`, если там уже
грузятся calls/meetings по контактам, либо создать
`src/lib/hooks/use-contact-strength.ts`, который его переиспользует. НЕ заводить
третий дублирующий фетч тех же таблиц.

```ts
// contactIds → Map<contactId, { strength: Strength; lastTouch: { kind, date } | null }>
export function useContactStrengthMap(contactIds: string[]): ...
```

- Внутри: агрегаты per contact (daysSince, touches90d, hasUpcoming по calls/meetings/tasks
  контакта) → `relationshipStrength()` из Задачи 1.
- tasks для hasUpcoming: `contact_id in (...)`, `deadline > now()` — только count/exists.
- Ключ: `['contact-strength', ...sorted ids]` или производный от last-touch кеша —
  реши по факту разведки, но без N+1 (один запрос на таблицу, не per contact).

---

## ЗАДАЧА 4: Секции-компоненты карточки

ARCH-ревью прямо запрещает раздувать detail-страницы («avoid 2k LOC file» — extract
sections). Новые файлы в `src/components/companies/`:

### 4.1 `CompanyHighlights.tsx` — полоса из 4 виджетов (Attio-паттерн)

Grid `grid gap-3 md:grid-cols-4` (на мобиле 2×2 — `grid-cols-2`), каждый виджет —
карточка `data-card` (bg-surface, border-border, radius темы). Референс — мокап.

1. **«Открытые сделки»**: сумма `budget` открытых (не won/lost) через `formatBudget`,
   крупно (`text-xl font-semibold tabular-nums`); мета-строка: количество + worst
   health среди открытых (`getDealHealth`, худший статус → точка `DealHealthDot`
   + текст вида «1 без шага 6 дн» — переиспользуй подпись из deal-health, если
   экспортируется; нет открытых сделок → «Нет открытых» и точка не рендерится).
2. **«Внедрение»**: активное delivery (не терминальное, по `isDeliveryTerminal`):
   `progress_done/progress_total` крупно (только если `progress_total > 0`, иначе
   название фазы), мета: стадия + дедлайн, `DeliveryHealthDot`. Нет активных → виджет
   не рендерится, а сетка становится `md:grid-cols-3` (пустые рамки — шум).
3. **«Последний контакт»**: `daysSince(lastTouch.date)` крупно + «Звонок/Встреча ·
   {имя актёра}»; справа стек из ≤3 аватарок who-knows (инициалы, bg — семантические
   токены) + подпись «знают N». Данных нет → «Касаний не было», без аватарок.
4. **«Маркировка ЧЗ»**: рендерится только при `chzGroups.length > 0` (та же логика,
   что сейчас). Внутри: первая группа крупно, бейдж статуса (`ChzBadge` — вынести
   из CompanyDetail сюда или в shared, не копировать), примечание. Статус `starting`
   → карточка получает класс `co360-hot` (см. Задачу 7): это ЕДИНСТВЕННЫЙ
   подсвеченный виджет полосы — горячий пресейл-сигнал. `mandatory`/прочие — обычная
   карточка. Групп нет → виджет не рендерится (сетка сжимается).

### 4.2 `CompanyDealsCard.tsx`, `CompanyDeliveriesCard.tsx`, `CompanyContactsCard.tsx`

Перенос текущих секций из CompanyDetail с изменениями:

- **Deals**: как сейчас (health dot, стадия, бюджет, закрытые приглушены,
  сортировка `compareByNextAction`), плюс перенос заголовочного счётчика/кнопки.
- **Deliveries**: как сейчас + прогресс-бар `progress_done/progress_total`
  (тонкий, 4px, `bg-surface3` трек / `bg-green` заливка, только при total > 0).
  **Новое — CTA «Запустить внедрение»**: если есть won-сделка без дочернего
  delivery (`!linkedDeliveries.some(d => d.parent_deal_id === deal.id)`), под списком
  рендерится строка с dashed-рамкой: «По сделке «{name}» (won) внедрение не
  запущено» + кнопка, открывающая `SpawnWizard` с этой сделкой (props — из
  разведки №4). Показывать только при `canCreate` (viewer не создаёт, RLS 42501).
  Несколько таких сделок → строка по каждой, максимум 2, остальное «+ ещё N».
- **Contacts**: каждая строка получает аватар-кружок с инициалами (паттерн
  `getAvatarColor`/`getInitials` из ContactDetailHub — вынести в shared-утилиту,
  НЕ копипастить), роль из `contact_company.role` (уже есть), новое — бейдж
  strength (`strong · 82` / `warm · 54` / `cold · 8`) из Задачи 3 и last touch
  справа («звонок · 3 дн»). Цвета бейджей: strong → `bg-green-l text-green`
  (в светлых темах текстовый токен подтянется через существующие `*-text`-правила —
  используй тот же приём, что ChzBadge: `var(--green-text, var(--green))`),
  warm → yellow-пара, cold → `bg-surface3 text-text-mute`.
  Сортировка: по score desc, без касаний — вниз.

### 4.3 `CompanySidebar.tsx` — правая колонка (справочное)

Четыре карточки:
1. **Сведения**: телефон (PhoneList), сайт, адрес, отрасль — формат key-value
   (label `text-text-mute` слева min-w фикс, значение справа). Пустые поля не рендерить.
2. **Реквизиты**: текущий блок S-INN-1 целиком (ИНН/КПП/ОГРН/ОКВЭД/юрназвание/юрадрес,
   статус-бейдж, «Обновить из ЕГРЮЛ», «Сверено … »). Логика `handleRefreshLegal`
   переезжает сюда без изменений. Блока нет, если нечего показать (как сейчас).
3. **Маркировка ЧЗ — детали**: полный список групп с примечаниями и подписью
   справочника (highlight-виджет показывает сигнал, эта карточка — детали; при
   пустом `chzGroups` не рендерится).
4. **Заметки**: `company.notes`, как сейчас; нет заметок — карточки нет.

---

## ЗАДАЧА 5: Пересборка `CompanyDetail.tsx`

Итоговая структура (см. мокап):

```
← Компании
Header:  [логотип-плитка 46px: Building2 на bg-accent-l]  Название (aura-page-title)
         подстрока: отрасль · чип «Действующее»/статус ИНН · чип «ИНН …» (tabular-nums)
         actions: [AI-бриф] [+ Сделка (primary)] [edit] [delete]
CompanyHighlights (полоса 3–4 виджетов)
grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5:
  main:  CompanyDealsCard → CompanyDeliveriesCard → CompanyContactsCard → Активность
  side:  CompanySidebar
```

Изменения против текущего:
- Info-grid (телефон/email/сайт/адрес) **уезжает в сайдбар** — из основного потока
  убрать.
- Чип статуса юрлица и ИНН — в header (идентичность записи); внутри карточки
  «Реквизиты» статус-бейдж остаётся как сейчас (там он про реестр).
- «+ Сделка» — primary-кнопка в header (`bg-accent` — ремапы тем сделают её
  графитовой/чёрной/torii сами), рендер при `canCreate`. Кнопки «+ Сделка»/«+ Контакт»
  в заголовках секций остаются.
- Строка-сводка `formatCompany360Summary` **удаляется** — её роль забрала
  highlight-полоса (два источника одних чисел = рассинхрон).
- Модалки, `openTimelineEvent`, InlineConfirm удаления — без изменений.
- Состояния загрузки/ошибки — как сейчас.
- Mobile: сайдбар падает вниз (`grid-cols-1`), highlights `grid-cols-2`.

⚠️ Не превращай CompanyDetail обратно в god-component: после пересборки в нём
остаются только данные+состояние+композиция, разметка секций — в компонентах
Задачи 4. Ориентир: CompanyDetail.tsx ≤ 350 строк.

---

## ЗАДАЧА 6: Лента — фильтр по типу и «Предстоящее / Ранее»

Attio-паттерн (changelog 29.06.2026): фильтр по типу события с памятью per-entity.

1. `EntityTimeline` — два **опциональных** props (обратная совместимость: контакт,
   сделка и прочие страницы НЕ трогаем):
   - `kindFilter?: string[]` — показывать только эти kinds (маппинг kind→тип уже
     есть в use-entity-timeline/adapters — разведка №5; фильтр применяй к уже
     загруженным событиям, НЕ меняй запрос).
   - `splitUpcoming?: boolean` — события с датой в будущем рендерятся первой
     группой «Предстоящее» (label-стиль `text-[11px] uppercase tracking-wide
     text-text-mute`), остальные — «Ранее». По умолчанию false — текущий рендер
     без изменений.
2. В CompanyDetail над ActivityComposer — ряд чипов: Все / Звонки / Встречи /
   Задачи / Заметки / Сделки (реальный набор — по kinds из разведки; чип типа,
   которого нет в адаптерах, не рендерить). Актив — один чип; стиль как SavedViewChips /
   ChipFilter, если подходит (разведка) — переиспользуй, не изобретай.
3. Память per-entity-type: выбранный фильтр — в `ui-store` (Zustand, persist),
   ключ `timelineFilter.company`. Не URL (это не share-able состояние).

---

## ЗАДАЧА 7: CSS — глобальные добавки в `globals.css`

Только токены, БЕЗ тема-селекторов (работает во всех 7 темах автоматически):

```css
/* Company 360: горячий сигнал highlight-полосы (единственное цветное исключение) */
.co360-hot {
  border-color: color-mix(in srgb, var(--yellow) 40%, var(--border));
  background:
    linear-gradient(180deg, var(--yellow-l), transparent 60%),
    var(--surface);
}
```

Никаких новых hex, никаких `.t-*` блоков. Если чего-то не хватает — используй
существующие утилиты; появление нового тема-специфичного правила = сигнал, что
дизайн-решение неверное, остановись и отметь в отчёте.

---

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run src/lib/domain/relationship-strength.test.ts 2>&1 | tail -5
npm run build 2>&1 | tail -5

# Не осталось hardcoded-цветов в новых файлах
grep -rn "#[0-9a-fA-F]\{3,6\}\|rgb(" src/components/companies/Company*.tsx src/lib/hooks/use-company-team-touch.ts | grep -v "var(--" || echo "OK: no hardcoded colors"

# Никто не пишет user_id
grep -rn "user_id" src/lib/hooks/use-company-team-touch.ts src/lib/hooks/use-contact-strength.ts 2>/dev/null || echo "OK"

# CompanyDetail не god-component
wc -l src/components/companies/CompanyDetail.tsx
```

Ручной смок (описать результат в отчёте, скриншоты приветствуются):
- Компания с данными (сделки+внедрение+контакты) — все 4 виджета, суммы сходятся
  со списками ниже.
- Компания-пустышка (0 сделок, 0 внедрений, без ОКВЭД) — полоса сжимается,
  пустых рамок нет, «Касаний не было».
- Viewer-роль: нет «+ Сделка», нет CTA «Запустить внедрение».
- Переключить темы aura / minimal / frost — ничего не «горит» и не пропадает.

## КОММИТ

```bash
git checkout -b feat/company-360
git add .
git commit -m "S-R2-CO360-1: Company 360 — highlight-полоса, strength контактов, who-knows, сайдбар реквизитов, фильтры ленты"
```

В отчёте: список новых файлов, изменённые props EntityTimeline, принятые в ходе
разведки решения (что отличилось от промпта и почему), результаты смока по ролям
и темам.
