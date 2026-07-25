# SPRINT: visual-audit P2 (волна 3) — border-input токен

Узкий заход по решению Олега (гейт): только **видимость границ интерактивных
контролов**. Микрокегль (55 вхождений text-[<11px]) и CVD blue/purple — вынесены
из scope (не WCAG-нормативы, размытый DoD, риск откатить волну 2). Источник: аудит
color-architect (P2), верификация гейта (Cowork) по живому коду 12.07.2026.

Контекст: Next.js 15 + Tailwind v3 (цвета через CSS vars), 11 тем-блоков в
`src/app/globals.css`, default `t-scandi`, прод-активная `t-aura`. Волны 1/2 на проде
(main `72a9f53`). Сверяйся с `theme-system.md` и crm-architect.

## WHY

`Input.tsx:26` рисует поле в покое классом `border-border` = токен `--border`. В светлых
темах `--border` < 3:1 к `--surface` (verified скриптом): aura `#E2E2EC`=**1.29:1**,
washi `#D8D2C8`=1.47, fuji `#DDD5C5`=1.42, paper `#c8bfa0`=1.74, sand `#c0a880`=2.11,
scandi `#c8c8c8`=1.6. В тёмных `rgba(255,255,255,0.10–0.12)`=1.1–1.5:1. По **WCAG 2.2
SC 1.4.11 (Non-text Contrast)** граница, идентифицирующая интерактивный компонент,
обязана быть ≥3:1. Сейчас поля ввода и селекты почти сливаются с фоном — реальный
UX-дефект, не косметика.

**НО:** тот же `--border` висит на **314** местах в компонентах — карточки,
разделители, контейнеры. Для декоративных границ 1.4.11 порога 3:1 **не требует**
(это не «граница компонента/состояния»). Поднять `--border` глобально = раздуть все
карточки жирными рамками и убить тонкий суми-характер washi/fuji/aura. **Неверный путь.**

## WHAT

Ввести отдельный токен `--border-input` ≥3:1 во всех темах и повесить его **только на
покоящиеся границы интерактивных контролов**. Декоративный `--border` не трогаем.
Focus-состояния (`border-accent` + ring) уже контрастны — не трогаем.

## HOW

### 1. Токен `--border-input` во всех темах (globals.css)

Добавить в каждый тема-блок рядом с `--border`. Требование к значению:
- **≥3:1 против `--surface` этой темы** (проверять скриптом, не на глаз);
- **не темнее/не ярче `--text-mute`** — иначе граница читается как заполненный текст
  или ошибка. Целевой коридор **3.0–4.5:1**;
- **сохранить hue темы** (washi — тёплый серо-коричневый, fuji — холодный индиго-серый,
  aura — нейтральный), чтобы линия оставалась «в характере», а не чёрной рамкой.

Направление (значения ПОДТВЕРДИТЬ пересчётом скрипта, не финальные):
```css
/* светлые — темнее surface до 3:1 */
.t-aura   { --border-input: #a8a8b8; }   /* surface #fff */
.t-scandi { --border-input: rgba(0,0,0,0.32); }
.t-paper  { --border-input: #a89878; }   /* = текущий border2, проверить 3:1 к #fdf8ec */
.t-sand   { --border-input: #a08860; }
.t-washi  { --border-input: #b8afa0; }   /* тёплый, к #fdfcfa */
.t-fuji   { --border-input: #c0b8a5; }   /* к #fdfcf8 — тёплая рамка, не индиго */
:root/*frost*/ { --border-input: rgba(255,255,255,0.34); }
.t-aurora { --border-input: rgba(255,255,255,0.34); }
.t-tidal  { --border-input: rgba(255,255,255,0.34); }
/* scandi-dark @media — rgba(255,255,255,0.36) */
```
База `:root` (frost — это первый блок): добавить `--border-input` туда же, где `--border`.

### 2. Tailwind: класс `border-input` (tailwind.config)

`borderColor` блок (config уже имеет `DEFAULT: var(--border)`):
```js
borderColor: {
  DEFAULT: 'var(--border)',
  input: 'var(--border-input)',   // + добавить
  // ...остальное как есть
},
```
Проверить, что `border-input` не конфликтует с существующими ключами.

### 3. Переключить интерактивные контролы в покое — ТОЧЕЧНО

Заменить `border-border` → `border-input` ТОЛЬКО на этих контролах (в покое):

| Файл | Строка(и) | Что |
|------|-----------|-----|
| `src/components/ui/Input.tsx` | 26 | `border-border` (ветка без error) → `border-input` |
| `src/components/ui/ChipFilter.tsx` | 34 | неактивный чип `border-border` → `border-input` |
| `src/components/ui/SavedViewChips.tsx` | 54, 93 | `border-border` → `border-input` |
| `src/components/ui/Button.tsx` | 14 | `secondary` variant `border-border` → `border-input` |
| `src/components/ui/InlineEdit.tsx` | 67, 85 | уже `border-border2` — **проверить скриптом**: если border2 ≥3:1 к surface, оставить; иначе → `border-input` |
| native `<select>` (27 шт) | — | у всех `border border-border bg-surface` → `border-input` |

**Native selects (27 вхождений)** — файлы: `settings/AutomationsSection.tsx`,
`settings/GatesSection.tsx`, `settings/TeamSection.tsx`, `calls/CallModal.tsx` и др.
Найти и заменить прицельно:
```bash
grep -rln "<select" src/components --include="*.tsx"   # список файлов
# в каждом: заменить border-border → border-input ТОЛЬКО в className самого <select>
```
⚠️ **НЕ** делать глобальный `sed border-border→border-input` по репо — снесёт 300+
декоративных границ. Только элементы из таблицы + `<select>`-контролы.

### 4. Скрипт: разделить border-input и декор (audit-contrast.py)

Сейчас скрипт (`:229`) меряет `border/surface` и `border2/surface` как `kind='ui'` и
считает их FAIL. Это ложный сигнал — декор-границы 1.4.11 не обязаны 3:1.
- Добавить пару `border-input / surface` (req 3.0, kind='ui') — **это реальный DoD-KPI**;
- `border/surface` и `border2/surface` переклассифицировать в `kind='decorative'` и
  **вывести из FAIL-счётчика** (печатать отдельным блоком «decorative borders, info-only»).

## ПРОВЕРКА (после правок)

```bash
npx tsc --noEmit 2>&1 | head && npm run build 2>&1 | tail -5
python3 scripts/audit-contrast.py          # border-input/surface ≥3:1 во всех 11 темах; decorative — info-only
grep -rn "border-border" src/components/ui/Input.tsx   # ветки без error не должно остаться
```

**Live (Cowork через Chrome, localhost:3000), скриншоты 4–5 тем:**
- Форма с `<input>` (`/settings`, модалка сделки/лида) — граница поля видна в покое во
  всех темах (особенно aura/washi/fuji/frost).
- `<select>` в Настройках — рамка видна.
- Secondary-кнопки — рамка видна, но не «жирная».
- Карточки на `/deals`, `/projects` — **декор-границы НЕ изменились** (регресс-контроль:
  суми-характер washi/fuji цел, карточки не потолстели).
- Focus по Tab — accent-рамка+ring работает как раньше.

## Definition of Done (волна 3)

- [ ] `--border-input` во всех 11 тема-блоках, ≥3:1 к surface (скрипт), в коридоре 3.0–4.5:1.
- [ ] `border-input` в tailwind.config; tsc/build зелёные.
- [ ] Input/ChipFilter/SavedViewChips/Button-secondary/native-selects в покое на `border-input`.
- [ ] InlineEdit: border2 проверен скриптом — оставлен либо переведён с обоснованием.
- [ ] Декоративные `border-border` (карточки/разделители) **не тронуты** — live регресс чист.
- [ ] Скрипт: border-input — DoD-KPI (0 FAIL); border/border2 — decorative info-only, не FAIL.
- [ ] theme-system.md (скилл): задокументировать `--border-input` — интерактив ≥3:1,
      декор-`--border` порога не имеет (за Олегом/CC, мост не достаёт).
- [ ] Скриншоты 4–5 тем приложены.

## КОММИТЫ (после ревью diff гейтом)

```bash
# 1. токен + tailwind + скрипт
git add src/app/globals.css tailwind.config.* scripts/audit-contrast.py
git commit -m "feat(a11y): токен --border-input ≥3:1 для границ интерактивных контролов (P2 §1.4.11)"
# 2. переключение контролов
git add src/components/ui/Input.tsx src/components/ui/ChipFilter.tsx src/components/ui/SavedViewChips.tsx src/components/ui/Button.tsx src/components/ui/InlineEdit.tsx src/components/settings src/components/calls/CallModal.tsx
git commit -m "fix(a11y): input/select/secondary-контролы на border-input — видимая граница во всех темах (P2)"
```

## Verification Labels (заполнить в отчёте CC)

```
Type Safety:            [ ]  (tsc)
Backward Compatibility: [ ]  (декор-border не тронут, focus не тронут)
Runtime Tested:         [ ]  (build + live)
Regional Availability:  NOT_APPLICABLE
```

## Дальше (вне scope этой волны)

Микрокегль ≥11px (55 вхождений — классификация информативный/decorative, поштучно) и
CVD blue/purple (форма+цвет, паттерн HealthDot-глифов) — отдельными точечными заходами,
как дизайн-ревизия, не как measurable-гейт. `.stage-future` — мёртвый класс, можно убрать.
