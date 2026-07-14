# Ревью спринта `SPRINT-visual-audit-P2.md` (волна 3)

**Дата:** 12 июля 2026  
**Контекст:** P0/P1 на проде (`72a9f53`). Скрипт после P1: **0 text/badge FAIL**, остались только **border/ui FAIL** (18 пар по 10 темам). P2 в коде **ещё не начат** — ревью спринт-документа перед исполнением.  
**Вердикт:** **можно брать в работу с правками** — архитектурное решение (`--border-input` отдельно от `--border`) верное и согласовано с гейтом; блокирующий риск — **черновые значения токенов не проходят 3:1** и **узкий scope контролов оставит невидимые границы в модалках**.

---

## Общая оценка: 7.5/10

Спринт точно формулирует WHY (WCAG 1.4.11 только для границ компонентов, не декора), правильно запрещает глобальный `sed`, предлагает переклассификацию скрипта. Слабые места: примерные hex/rgba в §1 не пересчитаны (6 из 9 светлых тем FAIL), scope покрывает `Input.tsx` и 27 `<select>`, но **~80+ сырых `<input>`/`<textarea>` в модалках** остаются на `border-border`, плюс не учтён **Scandi override** в `globals.css`.

---

## Что verified и согласовано

| Пункт | Статус | Комментарий |
|-------|--------|-------------|
| WHY / 1.4.11 | ✅ | `Input.tsx:26` → `border-border` = `--border`. Aura `#E2E2EC` на `#fff` = **1.29:1** (скрипт). Реальный UX-дефект. |
| Не трогать `--border` глобально | ✅ | `border-border` в **~75 файлах** / **~200+ вхождений** — карточки, разделители, модалки-обёртки. Глобальный подъём убьёт суми-характер. |
| Tailwind `border-input` | ✅ | `tailwind.config.ts:67–69` сейчас только `DEFAULT: var(--border)`. Добавить `input: var(--border-input)` — без конфликтов. |
| UI-компоненты из таблицы | ✅ | `Input`, `Button` secondary, `ChipFilter`, `SavedViewChips`, `InlineEdit` — файлы и строки совпадают с живым кодом. |
| Native `<select>` ×27 | ✅ | `rg '<select' src/components` → **27** элементов в 14 файлах. Спринт не завышает. |
| `InlineEdit` → `border2` | ✅ | `border2/surface` FAIL в 8/10 тем (2.67–1.29:1). Перевод на `border-input` обоснован. |
| Скрипт §4 | ✅ | Сейчас `border/surface` и `border2/surface` — `kind='ui'` FAIL (`audit-contrast.py:228–229`). Переклассификация в `decorative` + KPI `border-input/surface` — правильный DoD. |
| Focus не трогать | ✅ | `focus:border-accent` + ring на контролах — отдельный путь, контрастен. |
| Коммиты (2 штуки) | ✅ | Токен+скрипт / контролы — логичное разделение. |
| Вне scope (микрокегль, CVD) | ✅ | Согласовано с гейтом и `REVIEW-visual-audit-2026-07-12.md`. |

---

## Критические замечания (исправить до старта)

### 1. Примерные значения `--border-input` не проходят DoD

Спринт пишет «ПОДТВЕРДИТЬ пересчётом», но в таблице §1 указаны значения, которые **уже сейчас FAIL** при проверке против `--surface`:

| Тема | Значение из спринта | Ratio к surface | Статус |
|------|---------------------|-----------------|--------|
| t-aura | `#a8a8b8` | **2.34:1** | ❌ |
| t-scandi | `rgba(0,0,0,0.32)` | **2.25:1** | ❌ |
| t-paper | `#a89878` (= текущий border2) | **2.67:1** | ❌ |
| t-sand | `#a08860` | **3.12:1** | ✅ |
| t-washi | `#b8afa0` | **2.12:1** | ❌ |
| t-fuji | `#c0b8a5` | **1.92:1** | ❌ |
| t-frost / aurora / tidal | `rgba(255,255,255,0.34)` | **3.06–3.08:1** | ✅ |
| t-scandi-dark | `rgba(255,255,255,0.36)` | **3.29:1** | ✅ |

**Направление пересчёта** (подтвердить скриптом + коридор ≤4.5:1 к `--text-mute`):

```css
.t-aura   { --border-input: #8E8EA6; }   /* 3.2:1 — из SPRINT-visual-audit-fixes §3.3, не #a8a8b8 */
.t-scandi { --border-input: rgba(0,0,0,0.42); }  /* ~3.02:1 */
.t-paper  { --border-input: #968872; }   /* ~3.3:1, тёплый ink */
.t-washi  { --border-input: #918578; }   /* ~3.45:1, тёплый серо-коричневый */
.t-fuji   { --border-input: #9B9080; }   /* ~3.02:1, не индиго */
```

**Рекомендация:** в спринте убрать «направление» как псевдо-финал; добавить шаг «итеративный подбор до PASS скрипта» с обязательной проверкой верхней границы (не темнее `text-mute`).

### 2. Scope контролов не закроет формы в модалках

Спринт меняет только `Input.tsx`, но **большинство полей** — сырые элементы с паттерном `border border-border`:

| Паттерн | Вхождений (прибл.) | Примеры |
|---------|-------------------|---------|
| `border border-border` (все) | ~200+ | карточки + контролы |
| `w-full rounded-lg border border-border` (формы) | ~80+ | `TaskModal`, `MeetingModal`, `LeadModal`, `ProjectModal`, `GatesSection` inputs |
| `<Input` из ui/Input | ~24 файла | частичное покрытие |

**Следствие:** после P2 по спринту-as-is граница в `Input.tsx` станет видимой, а в той же форме (`TaskModal`) `textarea` и `<select>` на строках 143–213 останутся 1.3:1 на Aura.

**Рекомендация** — расширить §3 одним из путей (выбрать один, зафиксировать в DoD):

1. **Прицельный grep** — заменить `border-border` → `border-input` только в `className` у `<input>`, `<textarea>`, `<select>` (не трогать `div`/`button` декор):
   ```bash
   rg -l '<(input|textarea|select)' src/components --glob '*.tsx'
   ```
2. **Или** явный хвост в DoD: «known gap: сырые поля в модалках → волна 3.1» — но тогда live-скриншоты из DoD не выполнимы для `/settings` и модалок сделки.

### 3. Scandi override перебивает Tailwind-класс

В `globals.css:899–908` для `.t-scandi input/textarea/select`:

```css
border-bottom: 0.5px solid var(--border) !important;
```

Даже если `Input.tsx` получит `border-input`, Scandi **принудительно** рисует `var(--border)` (1.6:1). **Обязательно** в том же блоке заменить на `var(--border-input)` (или добавить `--border-input` в Scandi и обновить override). Иначе DoD для default-темы не закроется.

### 4. Комментарий `:root/*frost*/` — неверный

`:root` (строка 20) — **Claude fallback**, не Frost. Frost — `.t-frost` (строка 54). Скрипт мержит оба `:root`-блока как fallback для всех тем (`audit-contrast.py:108–111`). `--border-input` нужен:
- в `:root` (fallback cascade),
- в каждом `.t-*` блоке,
- в `@media (prefers-color-scheme: dark) .t-scandi` (scandi-dark).

Итого **11 контекстов** в скрипте (9 тем + scandi-dark + cascade) — число в спринте верное, пояснение про frost — нет.

---

## Средние замечания

### 5. `Combobox.tsx` и `AssigneeSelect.tsx` — интерактивные, вне таблицы

Оба — кастомные контролы выбора с `border border-border` на триггере (`Combobox.tsx:104`, `AssigneeSelect.tsx:91`). По 1.4.11 это те же «границы компонента». Используются в формах проектов/задач. Добавить в таблицу §3 или в «волна 3.1».

### 6. `GatesSection` / `AutomationsSection` — не только `<select>`

В settings есть и `<input>` с `border-border` (например `GatesSection.tsx:110,122`). Спринт упоминает файлы, но инструкция только для `<select>`. Уточнить: **все** form-контролы в перечисленных settings-файлах.

### 7. `PipelineBoard.tsx:658` — select без рамки

Сортировка: `className="bg-transparent text-xs..."` — **без** `border-border`. Не включать в замену (регресс не нужен). В спринте можно пометить как исключение.

### 8. Toggle-кнопки (приоритет, фильтры)

`TaskModal.tsx:188` — неактивный приоритет `border-border`. `ChipFilter` в scope, а priority-toggle — нет. Для единообразия secondary/toggle в покое — тот же `border-input`. Не блокер, но заметно в live QA.

### 9. `theme-system.md` — путь

Как в ревью P1: файл в `crm-architect/references/theme-system.md`, не в репо. DoD «обновить theme-system.md» — указать **skill reference**; опционально дубль в `docs/`.

### 10. Верхняя граница 4.5:1 vs `--text-mute`

Коридор 3.0–4.5:1 разумен. При подборе значений проверять, что `border-input` не темнее `text-mute` на той же surface (иначе рамка читается как disabled-текст). Добавить в скрипт пару `border-input / text-mute` как **warning**, не FAIL.

---

## Мелочи

- **Коммит 2** — добавить `src/components/shared/Combobox.tsx`, `AssigneeSelect.tsx` если пойдут в scope; иначе явный out-of-scope.
- **grep в DoD** (`border-border` в `Input.tsx`) — расширить на `ChipFilter`, `Button`, `SavedViewChips`.
- **`:root` Claude fallback** — если `html` всегда с `t-*`, fallback редко виден; токен всё равно нужен для cascade в скрипте.
- **Скриншоты 4–5 тем** — включить **Scandi** (default) и **Aura** (прод); в Scandi граница — bottom-border, не full box.
- **Verification Labels** — после P1 text/badge = 0; P2 KPI = только `border-input/surface`.

---

## Прогноз FAIL после P2 (as-is спринта)

| Этап | border-input KPI | decorative border | text/badge |
|------|------------------|-------------------|------------|
| Сейчас | N/A (нет токена) | 18 FAIL (ui) | **0** |
| После P2 с черновыми hex | **6+ тем FAIL** | 0 FAIL (info) | 0 |
| После P2 с пересчитанными токенами + полный scope форм | **0** | 0 (info) | 0 |
| После P2 узкий scope (только ui/* + selects) | токены 0 | 0 (info) | 0, **но live формы в модалках — частичный фикс** |

---

## Рекомендуемые правки в `SPRINT-visual-audit-P2.md`

1. **§1** — заменить примерные значения на пересчитанные; aura → `#8E8EA6`, не `#a8a8b8`; paper/washi/fuji/scandi — тёмнее.
2. **§3** — добавить блок **«сырые form-контролы»**: grep по `<input|textarea|select` + `border-border`; отдельно Scandi override `:899–908`.
3. **§3** — `Combobox`, `AssigneeSelect`; `GatesSection`/`AutomationsSection` inputs.
4. **Исправить** комментарий `:root` ≠ frost.
5. **DoD** — «0 FAIL border-input» + «все form-контролы (не только Input.tsx)» или явный known-gap.
6. **DoD theme-system** — путь `crm-architect/references/theme-system.md`.
7. **Скрипт §4** — добавить измерение `border-input/surface`; опционально warning `border-input` vs `text-mute`.

---

## Порядок выполнения (если правки приняты)

1. **Токены** — подбор `--border-input` по всем 11 контекстам, прогон скрипта до 0 FAIL.
2. **Scandi override** — `var(--border-input)` в bottom-border блоке (до переключения компонентов).
3. **Tailwind + скрипт** — `border-input`, reclassify decorative.
4. **Контролы** — ui/* → settings selects/inputs → сырые поля в модалках → Combobox/AssigneeSelect.
5. **tsc + build** → скрипт → live 5 тем (aura, washi, fuji, frost, scandi) → theme-system.md.

---

## Заключение

Спринт P2 **архитектурно зрелый** — отдельный токен вместо глобального `--border` это правильный trade-off для 9 тем с тонкими декоративными рамками. Перед стартом обязательно: **пересчитать значения токенов** (черновые FAIL у 6 светлых тем) и **расширить scope на все form-контролы** или честно зафиксировать partial fix. Scandi `!important` override — скрытый блокер default-темы. После этих правок спринт готов к исполнению; ожидаемый результат — **0 ui FAIL по border-input**, decorative borders в info-only, text/badge остаётся 0.