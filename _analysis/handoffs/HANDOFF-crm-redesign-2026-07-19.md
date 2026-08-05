# Handoff — dashboard-crm визуальный редизайн (ветка `feat/deal-card`)

**Дата:** 2026-07-19 · **Ветка:** `feat/deal-card` · **Repo:** `godfathxrpe/dashboard-crm`
**Стек:** Next.js 15 · TS · Tailwind · Supabase (`uoiavcabxgdjugzryrmj`) · Vercel

---

## TL;DR

Весь редизайн (новая тема Minimal + виджет-дисциплина на 7 темах + правки P1/P2/T1)
живёт на `feat/deal-card` — **15 коммитов впереди `main`**, всё запушено на origin.
**Прод (`dashboard-crm-ten.vercel.app`) деплоится только с `main`, а `main` редизайна
НЕ содержит** — поэтому на проде 6 тем без Minimal. Чтобы выкатить: смерджить
`feat/deal-card` → `main` (миграций в дельте нет, деплой чисто фронтовый).

---

## Состояние деплоя (главное открытое)

| | ветка | HEAD | Minimal | что видит |
|---|---|---|---|---|
| **Прод** | `main` | `8b77540` (S-DEAL-CARD) | ❌ нет | старый UI, 6 тем |
| **Работа** | `feat/deal-card` | `74fd202` (T1) | ✅ есть | весь редизайн, 7 тем |

- `feat/deal-card` **ahead 15** от `origin/main`, локальный HEAD = origin HEAD (всё запушено).
- **Миграций в дельте `main..feat` — НЕТ** (`git diff --name-only ... supabase/migrations/` пусто).
  БД общая (один Supabase-проект, миграции 001–061 уже применены гейтом). Мердж не трогает схему.
- Preview: у Vercel на каждый пуш ветки есть preview-деплой
  (`dashboard-crm-git-feat-deal-card-*.vercel.app`) — там Minimal уже виден, прод не затронут.

**Выкатить на прод (решение и руки — пользователя, не CC/агента; shared-ветка `main`):**
```bash
git checkout main && git pull origin main
git merge feat/deal-card
git push origin main     # → Vercel авто-деплой прода
```
Рекомендация: сперва глянуть preview (билд зелёный + Minimal ок), потом мердж.

---

## Что вошло в 15 коммитов (снизу вверх)

```
8ffee6d  feat(themes): новая тема Minimal (t-minimal) — нейтральный canvas, Inter, терракота
c4763dd  refactor(ui): widget discipline — анатомия KPI, тихий risk-виджет, бюджет маркеров
8cdbba6  fix(themes): minimal — чёрный primary, нейтральный активный нав
6cb80a9  fix(ui): nav icons — семантика (Zap/DollarSign/Folder), size 20→16
4e515b1  refactor(tasks): композиция /tasks — шапка с метой, карточка списка, один контекст-тег
6ae3f47  feat(chat): глубина чата — токены пузырей 7 тем, слои канваса, автор
b6a8cc4  refactor(project): «Материалы проекта» в сворачиваемую секцию (F-10)
3ebbb32  refactor(analytics): единая палитра фаз с /overview, донат всем темам, empty-CTA
3a43bb7  fix(themes): minimal — disabled solid-кнопки тихие (surface3)
95cf07d  refactor(project): компактный стептер — фазы в чипы, активная в чевронах
84c9691  feat(analytics): донат по статусу — hover-эмфаза + значение в центре
698d737  feat(gantt): импорт плана из Excel на вкладке Гант + шаблон .xlsx
2aa9fff  polish (P1): minimal checkbox → чёрный; мета шапки задач → text-sm
bbb1045  feat (P2): тёмные фазовые цвета → секвенциальный ramp (frost/aurora/tidal)
74fd202  feat (T1): единый display-формат телефона + дедуп синонимов ролей в чипах
```

---

## Работа этой сессии (детально)

### P2 — тёмные воронки (`bbb1045`)
Три тёмные темы делили одну «радугу» на `--track-*-current` (зелёный/фиолет/жёлтый/розовый).
Заменено на **секвенциальный ramp варианта B (color-architect): светлота + дрейф тона по «своей»
дуге** — frost индиго→циан, aurora фиолет→маджента, tidal бирюза→аква. Значения по OKLCH,
пол ≈4:1 (одиночные точки фаз на карточках не тусклее прежних), всё ≥3:1 против фактических
поверхностей, монотонно. Итог:

| тема | prep | exp | nego | proj |
|---|---|---|---|---|
| frost  | `#5381C4` | `#339CEB` | `#08BAF8` | `#5CD7F4` |
| aurora | `#7E6ED3` | `#A974F7` | `#D283FF` | `#F1A4F7` |
| tidal  | `#3B9373` | `#23AD90` | `#15C5B1` | `#62DAD6` |

Рассмотрены 3 варианта (A монохром / B двутон / C тёплое-закрытие), diverging отклонён
(у воронки нет середины). Выбран B за различимость упорядоченных ступеней + тематичность.
Aurora-финал оставлен розовым осознанно (идентичность темы; бледный высокосветлый ≠ старая маджента).

### P1 — полиш (`2aa9fff`)
Minimal checkbox → чёрный (`var(--text)`, не accent-терракота); мета шапки /tasks `text-[13px]`→`text-sm`.

### T1 — нормализация Контактов (`74fd202`)
Две находки live-аудита, оба фикса недеструктивны (сторадж не переписывают):
- **Телефон:** новый `formatPhone()` в `phone.ts` → `+7 (XXX) XXX-XX-XX`; битые (напр. `7110`) как есть.
  `EditableCell` получил опц. проп `format` — инпут правит/сохраняет сырое, форматируется только покой.
- **Дубли чипов ролей:** новый `position.ts` `canonicalPosition()` + alias-карта (засеяна из
  РЕАЛЬНОЙ БД, 26 позиций). Мерджит ГД→Генеральный директор; ИТ-директор/IT директор/Директор
  IT→Директор по информационным технологиям; Глав. бух.→Главный бухгалтер. Технический директор /
  Бухгалтер / Директор — раздельно. Живой смок: «Генеральный директор 7», «Директор по ИТ 6»,
  «Главный бухгалтер 2» — счётчики схлопнулись как рассчитано.

---

## Зафиксированные решения / инварианты

- `--track-*-current` — только **ЗАЛИВКА** (точки-маркеры, тинты, бары воронки). Текст лейблов
  давно на отдельных `*-text`-токенах. → планка контраста 3:1 (графобъект), не 4.5:1.
  Потребители: `StackedPipeline`, `ProjectCard`, `PipelineBoard`, `StageBoard`, `OverviewCharts`,
  `Charts` (analytics), `delivery-phases.ts`. Изменение токена = системный фазовый цвет везде.
- Уникальные фичи тем беречь: Aura sidebar; Washi кандзи-нав + matrix-scramble hover
  (accent Washi = красный — это НЕ danger-мискод).
- Нормализация телефона/должностей — display/filter-only, БД не переписываем.

---

## Петля QA (как работаем)

1. Спринт (формат crm-architect, РАЗВЕДКА на ЖИВОМ дереве, не по номерам строк) → кладём в
   `_analysis/` на Mac.
2. CC внедряет + коммитит (**не пушит, миграции не применяет**).
3. Grok-watcher генерит ревью в `_analysis/review-sprint-*.md` → блокеры вносим в v1.1 спринта.
4. Я смокаю живьём в Chrome (localhost:3000) по затронутым экранам/темам.
5. Отмашка → **пользователь пушит**. Миграции: CC пишет+коммитит, применяет гейт Cowork.

**Уроки сессии (не повторять):**
- Проверять git-факты живьём, не по памяти CC: CC дважды ошибся («3 незапушенных» → был 1;
  «M5b–M8 незапушены» → уже на origin). `git log origin/<br>..HEAD` — источник правды.
- `device_stage_files` отдаёт КЭШ ранее застейдженных файлов → для чтения текущего кода
  использовать `device_bash` (живой диск). «Рассинхрон чекаута» ранее был кэшем стейджа, не git.
- `device_commit_files`: брать СВЕЖИЙ fileUuid после правки (не старый из pre-edit SendUserFile).

---

## Что дальше (очередь)

1. **ДЕПЛОЙ (главное):** мердж `feat/deal-card` → `main`, чтобы весь редизайн уехал на прод.
   Решение пользователя. Готов собрать PR-описание.
2. **T2 Звонки — ОТМЕНЁН.** «Красный» на «→ следующий шаг» = `text-accent` (CallLog.tsx:229),
   не danger. Красным был на Washi (accent красный). Бага нет.
3. **T3 Компании (MEDIUM):** 260 записей, колонки Отрасль/Телефон/Email пустые на 100%,
   Контакты/Сделки «—» вместо «0». Bulk-импорт (только имя+ИНН). Рационализация колонок /
   умный empty / дозаполнение данных.
4. **Хвост аудита (LOW):** заметки звонков — мусорный текст (data, не UI); встречи — только
   прошедшие; борд Сделок и empty-states уже в порядке (закрыто), Лиды тоже.
5. **Housekeeping (опц.):** `.gitignore` для `_analysis/`, `.grok/`, `screenshots/`,
   `scripts/__pycache__/`, `scripts/audit-contrast-results.json`, `supabase/.temp/`.

---

## Якоря в коде

- Токены тем: `src/app/globals.css` — `.t-frost` (L53, track-current L80-83),
  `.t-aurora` (L86, L113-116), `.t-tidal` (L120, L147-150). Три dark-блока: prep/exp/proj-current
  байт-в-байт одинаковы, различаются nego → замена ТОЛЬКО целым 4-строчным блоком.
- `src/lib/utils/phone.ts` (`normalizePhone` + `formatPhone`), `src/lib/utils/position.ts`
  (`canonicalPosition` + `POSITION_ALIASES`).
- `src/components/shared/EditableCell.tsx` (проп `format`), `.../contacts/ContactsTable.tsx`.
- Файлы-спринты этой сессии: `_analysis/sprint-p1-polish.md`, `sprint-p2-dark-funnel.md`,
  `sprint-t1-contacts-normalize.md`.

---

## Справка окружения

7 тем: aura (default) · washi · fuji · frost · aurora · tidal · **minimal** (новая).
Vercel: авто-деплой из `main`, прод `dashboard-crm-ten.vercel.app`. Local: `~/Downloads/dashboard-crm`.
Проект memory — skill `crm-architect`; аудит — `crm-design-auditor`; цвет — `color-architect`.
