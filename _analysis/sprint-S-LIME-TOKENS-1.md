# Claude Code Prompt — S-LIME-TOKENS-1: тема `t-lime` (токены, зоны, дефолт)

**Цель.** Добавить восьмую тему `t-lime` и сделать её `DEFAULT_THEME`. Ввести
токены зон (`--zone-*`) для будущей перекомпоновки страницы сделки.

**Границы спринта.** Только CSS-токены, константы тем и скрипт аудита.
**Разметку компонентов НЕ трогать.** `t-minimal` НЕ трогать — она остаётся седьмой темой,
миграция persisted-значений не нужна.

**Источник решений:** `claude/decisions-lime-theme-2026-09-05.md` (проект CRM Architect v.2).
Все контрасты в этом файле уже посчитаны (WCAG 2.2, sRGB) — подбирать заново не надо.

## Acceptance criteria

1. `THEMES` содержит 8 значений, `DEFAULT_THEME === 't-lime'`.
2. `python3 scripts/audit-contrast.py` → **`=== t-lime: 0 FAIL of N ===`**.
3. `python3 scripts/audit-tokens.py` не даёт новых нарушений (hex в TSX не появился).
4. `git diff --stat main...HEAD` содержит **ровно** 7 файлов:
   `src/app/globals.css`, `src/lib/stores/theme-store.ts`, `src/lib/constants/themes.ts`,
   `src/app/layout.tsx`, `src/components/settings/SettingsContent.tsx`,
   `scripts/audit-contrast.py`, `tests/unit/theme-store.test.ts`.
   Любой файл в `src/components/**` кроме `SettingsContent.tsx` — ошибка.
5. `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` — зелёные.

---

## РАЗВЕДКА

```bash
git status --short
git rev-parse --abbrev-ref HEAD

# 1. Границы блока t-minimal (образец для нового блока) — ожидается 662…709
grep -n "^\.t-minimal {" src/app/globals.css
sed -n '659,675p' src/app/globals.css
sed -n '705,730p' src/app/globals.css

# 2. Существующие темы в сторе и константах
grep -n "THEMES\|DEFAULT_THEME\|LEGACY_THEMES" src/lib/stores/theme-store.ts
grep -n "t-minimal" src/lib/constants/themes.ts src/components/settings/SettingsContent.tsx

# 3. FOUC-гард: whitelist и условие «не дефолт»
grep -n "theme-init\|t-aura" src/app/layout.tsx

# 4. Прецедент override «тёмный текст на светлой заливке» — ожидается 1467…1489
sed -n '1467,1490p' src/app/globals.css

# 5. Масштаб проблемы белого текста на акценте
grep -rn "bg-accent" src --include=*.tsx | grep -c "text-white"

# 6. color-mix уже применяется (проверить, что не первый случай)
grep -c "color-mix" src/app/globals.css

# 7. Карта тем в скрипте аудита — ожидается 114…120
sed -n '112,125p' scripts/audit-contrast.py
sed -n '210,228p' scripts/audit-contrast.py

# 8. Куда кладутся тесты
ls tests/unit/ | head -5
```

Если `grep -n "^\.t-minimal {"` вернул не 662 — работать по фактическим номерам,
все `sed -n` в задачах ниже сдвинуть соответственно. Анкоры `str_replace` уникальны
и от номеров не зависят.

---

## ЗАДАЧА 1: блок токенов `.t-lime` в `globals.css`

### Context

Тема светлая, непрозрачная (не glass), шрифт Inter — как `t-minimal`, но акцент
лаймовый. Ключевое отличие от всех существующих тем: **`--accent` слишком светлый,
чтобы быть цветом текста** (`#C9F25A` на белом = 1.29:1). Поэтому пара
`--accent` (заливка) / `--accent-text` (текст) обязательна, а `--on-accent`
переопределяется на почти-чёрный — дефолт `#ffffff` из `:root` дал бы 1.29:1.

Семантические токены сдвинуты темнее, чем в `t-minimal`: у зон есть цветная подложка,
и `--green-text #177B43` на ней даёт 4.13:1. Все значения ниже проверены на **всех
пяти фонах зон плюс белом**, минимум по строке указан в комментарии.

### Steps

Вставить новый блок **после** закрывающей скобки блока `.t-minimal` и его
`--tw-ring-color`-строки (ориентир — строка 727, `.t-minimal { --tw-ring-color: var(--accent-text); }`),
перед комментарием `/* ═══ Minimal v2: глубина и контраст ═══`.

```css
/* ═══ Lime (light, opaque) — ДЕФОЛТ с 2026-09 ═══════════════════════════
   Акцент — лайм #C9F25A (hue 76°). Правило Δhue ≥ 30° до семантики выполнено:
   до --yellow 37.5° Δ39°, до --green 146.5° Δ70°, до --blue 213° Δ137°.

   ГЛАВНОЕ ОТЛИЧИЕ ОТ ОСТАЛЬНЫХ ТЕМ: лайм — цвет ЗАЛИВКИ, никогда цвет текста.
   #C9F25A как текст на белом = 1.29:1. Дефолтный --on-accent: #ffffff из :root
   на лайме тоже 1.29:1 — переопределяем на #14210A (13.05:1).
   Текст акцентом идёт через --accent-text #336809 (6.72 на белом, минимум 5.22
   на фонах зон).

   ПОЧЕМУ СЕМАНТИКА ТЕМНЕЕ, ЧЕМ В t-minimal: у этой темы есть цветные подложки
   зон (--zone-*, ниже). Значения minimal (--green-text #177B43, --yellow-text
   #846300, --blue-text #1D68BC) дают на них 4.13–4.34:1 — ниже AA. Здесь они
   затемнены до минимума 4.77 / 4.85 / 5.04 по всем пяти зонам.
   Контрасты посчитаны WCAG 2.2 sRGB, не на глаз. ══════════════════════════ */
.t-lime {
  --bg: #EDE9E1;  --surface: #FFFFFF;  --surface2: #F4F4F6;  --surface3: #F7F7F9;
  --popover: var(--surface);
  --border: #ECECF0;  --border2: #D9D9E0;  --border-input: #8C8C8C;
  --text: #17171C;  --text-dim: #5F5F6A;  --text-mute: #5F5F6A;

  /* Четвёртой ступени чернил (#8A8A94) в теме НЕТ намеренно: на фонах зон она
     даёт 2.65–3.07:1. Микроподписи 9.5–11px печатаются --text-dim (мин. 4.89). */

  --accent: #C9F25A;                       /* только заливка */
  --accent-text: #336809;                  /* 6.72 бел · 6.03 work · 5.22 attn */
  --on-accent: #14210A;                    /* 13.05:1 на лайме */
  --accent-l: rgba(201,242,90,0.18);  --accent-l2: rgba(201,242,90,0.32);
  --sidebar-indicator: var(--accent);  --sidebar-active-text: var(--on-accent);

  --green:  #1B8A4C;  --green-l:  rgba(27,138,76,0.10);   --green-text:  #15703C;  /* 6.15 бел · 4.77 min */
  --red:    #CC3B2E;  --red-l:    rgba(204,59,46,0.10);   --red-text:    #A02620;  /* 7.52 бел · 5.84 min */
  --yellow: #B0680A;  --yellow-l: rgba(176,104,10,0.12);  --yellow-text: #7A5C00;  /* 6.25 бел · 4.85 min */
  --blue:   #2563C9;  --blue-l:   rgba(37,99,201,0.10);   --blue-text:   #1A5EA8;  /* 6.54 бел · 5.08 min */
  --purple: #7C5CD4;  --purple-l: rgba(124,92,212,0.09);  --purple-text: #6F4BC8;  /* 5.97 бел · 4.64 min */

  --font-app: var(--font-inter, 'Inter');
  font-feature-settings: 'cv11';

  --radius: 12px;  --radius-s: 9px;  --radius-m: 12px;  --radius-l: 20px;

  --shadow-xs: 0 1px 2px rgba(18,18,24,0.05);
  --shadow-sm: 0 1px 2px rgba(18,18,24,0.06), 0 2px 8px rgba(18,18,24,0.05);
  --shadow-md: 0 4px 12px rgba(18,18,24,0.07), 0 1px 3px rgba(18,18,24,0.05);
  --shadow-lg: 0 12px 34px rgba(18,18,24,0.10), 0 2px 8px rgba(18,18,24,0.05);
  --shadow-card: var(--shadow-sm);  --shadow-card-hover: var(--shadow-md);
  --shadow-accent: 0 6px 16px rgba(185,240,74,0.40);

  /* Тёмный материал «следующего шага» и текста события — СПЛОШНОЙ, без
     backdrop-filter. Композит rgba(23,23,28,.72) поверх фона зоны даёт #535452 —
     средне-серый, а не ink: прозрачность на однотонной подложке не даёт эффекта,
     а blur(30px) стоит кадров. Белый на #17171C = 17.86:1. */
  --glass-bg: #17171C;  --glass-border: rgba(255,255,255,0.18);  --glass-blur: none;
  --glass-inset: inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(255,255,255,0.06);
  --glass-sheen: linear-gradient(160deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 45%, rgba(201,242,90,0.08) 100%);
}
.t-lime { --tw-ring-color: var(--accent-text); }
```

### Verification

```bash
grep -n "^\.t-lime {" src/app/globals.css
grep -c "on-accent: #14210A" src/app/globals.css   # → 1
npx tsc --noEmit
```

---

## ЗАДАЧА 2: токены зон через `color-mix` — для всех тем сразу

### Context

Макет «Сделка v2» зонирует страницу тремя цветными подложками (Работа / Риски /
Контекст), причём фон «Рисков» меняется вместе с health. Хардкодить пять hex
нельзя: на `t-frost`/`t-aurora`/`t-tidal` (тёмные) светлые подложки развалят экран.

Зоны выводятся из семантики каждой темы одной формулой. `color-mix` в проекте уже
применяется (см. РАЗВЕДКА п.6), это не первый случай.

Проверка формулы на `t-lime`: даёт `#F1F5DD / #EAE8E5 / #DDE8DE / #EDE1D2 / #F3E2DE` —
в пределах 4 единиц на канал от подобранных дизайнером вручную
`#EDF1DC / #ECE8E0 / #E6F1D6 / #F5EBDA / #F6ECEA`.

### Steps

В блок `:root` (тот, что начинается на строке 5, где `--content-max`), после
`--content-max: 90rem;` добавить:

```css
  /* ── Зоны страницы сделки (S-LIME-TOKENS-1) ────────────────────────────
     Три подложки макета «Сделка v2»: Работа / Риски / Контекст. Выводятся из
     семантики ТЕКУЩЕЙ темы, а не хардкодятся: в тёмных темах --bg тёмный,
     и подмес уходит в тёмное автоматически. Пер-темный override — только там,
     где провалится audit-contrast.py.
     --zone-base — подложка светлее фона, но темнее карточки: карточка на зоне
     обязана отделяться без тяжёлой тени. */
  --zone-base:           color-mix(in srgb, var(--surface) 55%, var(--bg));
  --zone-work:           color-mix(in srgb, var(--accent) 14%, var(--zone-base));
  --zone-ctx:            color-mix(in srgb, var(--text)    6%, var(--zone-base));
  --zone-risk-ok:        color-mix(in srgb, var(--green)  12%, var(--zone-base));
  --zone-risk-attention: color-mix(in srgb, var(--yellow) 14%, var(--zone-base));
  --zone-risk-rotting:   color-mix(in srgb, var(--red)    10%, var(--zone-base));

  /* Состояние health переключается классом на контейнере зоны «Риски».
     Дефолт — ok; .h-attention / .h-rotting переопределяют тройку. */
  --h-zone: var(--zone-risk-ok);
  --h-ring: var(--green);
  --h-chip-ink: var(--green-text, var(--green));
```

Отдельным правилом **сразу после закрывающей скобки этого `:root`**:

```css
.h-attention { --h-zone: var(--zone-risk-attention); --h-ring: var(--yellow); --h-chip-ink: var(--yellow-text, var(--yellow)); }
.h-rotting   { --h-zone: var(--zone-risk-rotting);   --h-ring: var(--red);    --h-chip-ink: var(--red-text, var(--red)); }
```

Ничего этими токенами пока не красить — потребители появятся в S-DEAL-ZONES-1.

### Verification

```bash
grep -n "zone-base\|zone-risk-rotting\|\.h-rotting" src/app/globals.css
npm run build   # color-mix не должен ломать сборку CSS
```

---

## ЗАДАЧА 3: тёмный текст на лаймовой заливке

### Context

`grep -rn "bg-accent" src --include=*.tsx | grep -c "text-white"` даёт **82**
совпадения. На лайме белый текст = 1.29:1 — тема уехала бы в прод сломанной.

Прецедент — блок для тёмных тем на строках 1467–1489 (`.t-frost button.bg-accent`
и соседи). Повторяем его форму, но берём `var(--on-accent)` вместо хардкод-hex.

**Только `.bg-accent`.** Остальные семантические заливки (`--green #1B8A4C`,
`--red #CC3B2E`, `--blue #2563C9`, `--purple #7C5CD4`) достаточно тёмные — белый
на них работает, как в `t-minimal`. `--yellow #B0680A` под вопросом — решение
за скриптом аудита в ЗАДАЧЕ 5, не за глазом.

### Steps

Сразу после блока `.t-tidal button.bg-accent, …` (заканчивается `color: #080f0d !important;`)
добавить:

```css
/* Lime: тёмный текст на лаймовой заливке. Тот же приём, что у тёмных тем выше,
   но через токен --on-accent, а не хардкод: у лайма 82 места в разметке несут
   `bg-accent text-white`, а белый на #C9F25A = 1.29:1.
   Специфичность .t-lime .bg-accent (0,2,0) бьёт .text-white (0,1,0) и без
   !important, но оставляем его симметрично соседним темам. */
.t-lime button.bg-accent, .t-lime a.bg-accent, .t-lime .bg-accent.text-white {
  color: var(--on-accent) !important;
}
```

### Verification

```bash
grep -n "t-lime button.bg-accent" src/app/globals.css
npm run build
```

---

## ЗАДАЧА 4: регистрация темы и смена дефолта

### Context

Тема попадает в 4 файла: стор (список + дефолт), свотч, подпись в настройках,
FOUC-гард. FOUC-гард содержит и whitelist, и сравнение с дефолтом — при смене
дефолта надо править обе части, иначе `t-lime` из localStorage не применится
(условие `t !== 't-aura'` пропустит, но класс на `<html>` уже будет `t-lime`,
а вот сохранённая `t-aura` перестанет применяться).

### Steps

**4.1 — `src/lib/stores/theme-store.ts`.**

```
str_replace
old: const THEMES = ['t-aura', 't-washi', 't-fuji', 't-frost', 't-aurora', 't-tidal', 't-minimal'] as const;
new: const THEMES = ['t-lime', 't-aura', 't-washi', 't-fuji', 't-frost', 't-aurora', 't-tidal', 't-minimal'] as const;
```

```
str_replace
old: const DEFAULT_THEME: Theme = 't-aura';
new: const DEFAULT_THEME: Theme = 't-lime';
```

Комментарий над `THEMES` (`// AUDIT C: scandi/paper/sand удалены. Дефолт — aura...`)
обновить: дефолт — lime, `t-lime` идёт первой, поэтому `cycleTheme` начинает с неё.
`LEGACY_THEMES` **не трогать** — `t-minimal` остаётся валидной темой.

**4.2 — `src/lib/constants/themes.ts`.** Добавить в `THEME_SWATCH` первым:

```ts
  /* Лайм — единственная тема, где свотч равен --accent буквально: цвет
     достаточно насыщен, чтобы читаться кружком (в отличие от графита ауры). */
  't-lime': '#C9F25A',
```

**4.3 — `src/components/settings/SettingsContent.tsx`.** В массив `THEMES`
(строка ~32) первым элементом: `{ id: 't-lime', label: 'Lime' },`

**4.4 — `src/app/layout.tsx`.** Две правки.

```
str_replace
old: className={`t-aura ${manrope.variable}
new: className={`t-lime ${manrope.variable}
```

```
str_replace
old: __html: `try{var V=['t-aura','t-washi','t-fuji','t-frost','t-aurora','t-tidal','t-minimal'];var s=JSON.parse(localStorage.getItem('dashboard-theme'));var t=s&&s.state&&s.state.theme;if(t&&V.indexOf(t)!==-1&&t!=='t-aura'){var d=document.documentElement;d.classList.remove('t-aura');d.classList.add(t);}}catch(e){}`,
new: __html: `try{var V=['t-lime','t-aura','t-washi','t-fuji','t-frost','t-aurora','t-tidal','t-minimal'];var s=JSON.parse(localStorage.getItem('dashboard-theme'));var t=s&&s.state&&s.state.theme;if(t&&V.indexOf(t)!==-1&&t!=='t-lime'){var d=document.documentElement;d.classList.remove('t-lime');d.classList.add(t);}}catch(e){}`,
```

В комментарии над `<script id="theme-init">` заменить упоминание «вспышка
дефолтного t-aura» и «остаёмся на дефолте t-aura» на `t-lime`.

### Verification

```bash
grep -n "t-lime" src/lib/stores/theme-store.ts src/lib/constants/themes.ts src/app/layout.tsx src/components/settings/SettingsContent.tsx
npx tsc --noEmit
```

Ожидается: `Theme` выводится из `THEMES`, `THEME_SWATCH: Record<Theme, string>`
без `t-lime` не скомпилируется — это встроенная страховка от забытого свотча.

---

## ЗАДАЧА 5: `scripts/audit-contrast.py` — включить `t-lime` и прогнать

### Context

Скрипт держит карту тем на строках ~114–120 и пер-темные особые случаи на ~210–225
(`YELLOW_DARKEN_FILL`, ветки `if th == 't-aura' / 't-minimal'`). Без записи в карту
тема просто не аудируется, и «0 FAIL» будет означать «не проверяли».

### Steps

1. В словарь тем добавить `'t-lime': '.t-lime',` первым элементом.
2. Прогнать `python3 scripts/audit-contrast.py`.
3. Разобрать вывод секции `=== t-lime: … ===`:
   - **FAIL на текстовой паре** → затемнить соответствующий `*-text` токен
     в блоке `.t-lime` и перепрогнать. Значения `--accent`, `--green`, `--red`,
     `--blue`, `--yellow`, `--purple` (заливки) **не трогать** — они несут hue темы.
   - **FAIL на `--yellow` fill** → добавить `'t-lime'` в `YELLOW_DARKEN_FILL`
     (там уже `t-aura`, `t-fuji`, `t-washi`) и перепрогнать.
   - **FAIL на паре с `--accent` как текстом** → это ошибка скрипта, а не темы:
     у лайма текст идёт через `--accent-text`. Добавить ветку по образцу
     `elif th == 't-minimal':` — брать `accent-text` вместо `accent`.
4. Каждое изменённое значение сопроводить комментарием с новым отношением.

Итог задачи — **`=== t-lime: 0 FAIL of N ===`** в выводе, и `N` не меньше, чем
у `t-minimal` (иначе тему проверили не целиком).

### Verification

```bash
python3 scripts/audit-contrast.py 2>&1 | sed -n '/t-lime/,/^$/p'
python3 scripts/audit-tokens.py 2>&1 | tail -20
git diff --stat
```

---

## ТЕСТЫ

Смена `DEFAULT_THEME` меняет поведение `merge()` в persist-обёртке стора: это не
стиль, это логика миграции сохранённого значения, и она молча ломается.

Создать `tests/unit/theme-store.test.ts` (vitest, `tests/unit/**` — см. `vitest.config.ts`).
Тестировать **функцию слияния, а не React**: вынести логику из `merge` не нужно,
достаточно вызвать её через импортированные `THEMES` / `DEFAULT_THEME` /
`LEGACY_THEMES` и повторить условие, либо экспортировать хелпер
`resolvePersistedTheme(t: unknown): Theme` из `theme-store.ts` и покрыть его.
Предпочтителен второй вариант — тест не должен дублировать реализацию.

Кейсы (вход → ожидаемый выход):

| Вход | Выход | Почему |
|---|---|---|
| `'t-minimal'` | `'t-minimal'` | валидная тема пережила смену дефолта — главный кейс, ради него спринт не мигрирует minimal |
| `'t-aura'` | `'t-aura'` | бывший дефолт остаётся выбором пользователя, а не сбрасывается на lime |
| `'t-lime'` | `'t-lime'` | новый дефолт |
| `'t-scandi'` | `'t-lime'` | LEGACY → новый дефолт, не старый |
| `'t-nonsense'` | `'t-lime'` | неизвестное → дефолт |
| `undefined` | `'t-lime'` | пустой localStorage |
| `''` | `'t-lime'` | граничный: пустая строка не должна пройти как валидная |

Плюс один кейс на `THEME_SWATCH`: `Object.keys(THEME_SWATCH)` совпадает с `THEMES`
по составу — забытый свотч ловится тестом, а не глазами в настройках.

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
python3 scripts/audit-contrast.py 2>&1 | grep "==="
python3 scripts/audit-tokens.py 2>&1 | tail -5
git diff --stat main...HEAD
```

Проверить руками перед коммитом:

1. `git diff --stat main...HEAD` — ровно 7 файлов из AC п.4. Ни одного файла
   в `src/components/**`, кроме `SettingsContent.tsx`.
2. Вывод `audit-contrast.py` — `t-lime: 0 FAIL`, у остальных семи тем число FAIL
   **не выросло** относительно `scripts/audit-contrast-results.json` до спринта.
3. `npm run dev` → зайти в Настройки: восьмой кружок лаймовый, подпись «Lime»,
   переключение работает; вернуться на `t-minimal` — тема применяется, ничего
   не поехало.
4. Жёсткая перезагрузка на `t-lime`: вспышки другой темы нет (FOUC-гард).
5. Любая кнопка `bg-accent` (например «Создать» в списке сделок) — текст тёмный,
   не белый.

---

## КОММИТ

```bash
git checkout -b feat/lime-theme-tokens
git add src/app/globals.css src/lib/stores/theme-store.ts src/lib/constants/themes.ts \
        src/app/layout.tsx src/components/settings/SettingsContent.tsx \
        scripts/audit-contrast.py tests/unit/theme-store.test.ts
git commit -m "feat(theme): восьмая тема t-lime как новый дефолт + токены зон

Лайм #C9F25A — цвет заливки, не текста: на белом 1.29:1, поэтому пара
--accent / --accent-text (#336809) и --on-accent #14210A вместо дефолтного
белого. Семантические *-text затемнены против t-minimal: у темы есть цветные
подложки зон, на них значения minimal давали 4.13-4.34:1.

Токены --zone-* выведены через color-mix из семантики текущей темы — три
подложки макета «Сделка v2» работают и в тёмных темах без пер-темных хардкодов.
Потребителей пока нет, появятся в S-DEAL-ZONES-1.

.t-lime .bg-accent красит текст в --on-accent: 82 места в разметке несут
bg-accent + text-white, на лайме это 1.29:1.

DEFAULT_THEME → t-lime, FOUC-гард и whitelist обновлены. t-minimal не тронута,
persisted-значения всех семи прежних тем продолжают работать."
```

Пуш в `main` запрещён branch protection — только PR.

---

## Если что-то пошло не так

| Симптом | Причина | Что делать |
|---|---|---|
| Экран без стилей после смены класса на `<html>` | В `.t-lime` не хватает токена, который есть только в `:root` дефолта | Сравнить состав `.t-lime` и блока `:root` строки 24–61, дописать недостающее |
| Белый текст на лаймовых кнопках остался | Правило ЗАДАЧИ 3 попало выше блоков `.t-frost/.t-aurora/.t-tidal` или сработал `.text-white` из более позднего слоя Tailwind | Проверить порядок правил, при необходимости поднять специфичность до `.t-lime .bg-accent.text-white` |
| `audit-contrast.py` не выводит секцию `t-lime` | Тема не попала в карту на строке ~117 | ЗАДАЧА 5 шаг 1 |
| `tsc` ругается на `THEME_SWATCH` | Забыт свотч | ЗАДАЧА 4.2 |
| `color-mix` даёт прозрачный/чёрный фон | В теме нет одного из `--surface` / `--bg` / `--green` / `--yellow` / `--red` | Проверить состав блока темы; в `:root` дефолта они все есть |
