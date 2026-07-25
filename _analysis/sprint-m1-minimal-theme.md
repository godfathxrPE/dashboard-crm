# Claude Code Prompt — Sprint M1: Тема «Minimal» (t-minimal, 7-я тема)

Новая светлая тема класса Linear/Attio: нейтральный серый canvas, один терракотовый
акцент, шрифт Inter, тихие тени. Без орбов, без glass, без watermark-фич — это
«тихая» тема, где характер даёт дисциплина, а не декор.

Референс палитры согласован с Олегом (концепт torii-redesign-concept.html).
Все пары прошли предварительный WCAG-расчёт, финальная проверка —
`scripts/audit-contrast.py` (задача 6).

> v1.1 — учтено ревью Grok 2026-07-19: +ContentHeader (B1), audit-contrast.py
> + регистрация темы (B2), вставка CSS после всего fuji-стека (W1), Inter 700 (W3),
> точечный git add (W6).

---

## РАЗВЕДКА (выполнить ДО правок)

```bash
# 1. Убедиться, что рабочее дерево чистое
git status --short

# 2. Текущий список тем в сторе
grep -n "THEMES = " src/lib/stores/theme-store.ts

# 3. FOUC-whitelist в layout
grep -n "var V=" src/app/layout.tsx

# 4. Свотчи пикера — ДВА места: settings и header
grep -n "t-tidal" src/components/settings/SettingsContent.tsx
grep -n "THEME_SWATCHES" src/components/layout/ContentHeader.tsx

# 5. Конец fuji-блока в globals.css (вставлять t-minimal ПОСЛЕ всех .t-fuji-правил, перед BASE STYLES)
grep -n "^\.t-fuji" src/app/globals.css | tail -3
grep -n "BASE STYLES\|Modal animation" src/app/globals.css | head -2

# 6. Контраст-скрипт (внимание: имя audit-contrast.py, НЕ contrast.py)
ls scripts/audit-contrast.py
grep -n "theme_selectors" scripts/audit-contrast.py
```

---

## ЗАДАЧА 1: Шрифт Inter в layout.tsx

Файл: `src/app/layout.tsx`

1. Добавить `Inter` в импорт из `next/font/google` (рядом с Manrope, IBM_Plex_Sans, Onest, Unbounded).
2. Сконфигурировать:

```tsx
// Minimal theme: Inter — рабочая лошадь data-UI (кириллица, tabular nums, высокий x-height)
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],  // 700 — в UI встречается font-bold, без него faux-bold
  variable: '--font-inter',
  display: 'swap',
});
```

3. Добавить `${inter.variable}` в className на `<html>` (рядом с остальными font-variable классами).
4. В inline FOUC-скрипте `id="theme-init"` расширить whitelist:

```
var V=['t-aura','t-washi','t-fuji','t-frost','t-aurora','t-tidal','t-minimal'];
```

ВАЖНО: правило проекта — шрифт применяется ТОЛЬКО через `--font-app` в CSS
(задача 3), НЕ прямым font-family на тема-селекторе.

---

## ЗАДАЧА 2: t-minimal в theme-store

Файл: `src/lib/stores/theme-store.ts`

```ts
const THEMES = ['t-aura', 't-washi', 't-fuji', 't-frost', 't-aurora', 't-tidal', 't-minimal'] as const;
```

`LEGACY_THEMES` и merge-логику не трогать — неизвестные значения и так мигрируют на дефолт.

---

## ЗАДАЧА 3: Токен-блок в globals.css

Файл: `src/app/globals.css`. Вставить ПОСЛЕ ВСЕГО fuji-стека (последнее
`.t-fuji`-правило по РАЗВЕДКЕ №5), перед базовыми стилями/анимациями — НЕ между
fuji-токенами и fuji-декором:

```css
/* ═══ Minimal (light, neutral — Linear/Attio class) ═══
   Тихая тема: нейтральный canvas, 1 тёплый акцент, никакого декора.
   Характер = дисциплина: Inter, компактность, сигналы только у исключений. */
.t-minimal {
  --bg: #F6F6F7;  --surface: #FFFFFF;  --surface2: #F3F3F4;  --surface3: #EAEAEC;
  --popover: var(--surface);
  --border: #E5E5E8;  --border2: #D6D6DB;  --border-input: #8A8A93;  /* 3.42:1 к surface */
  --text: #1A1A1E;  --text-dim: #5A5A64;  --text-mute: #66666F;  /* mute 4.73:1 на surface3, тише dim (5.67:1) */
  --sidebar-indicator: var(--accent-l);  --sidebar-active-text: var(--accent-text);
  /* Терракота Torii — единственный акцент */
  --accent: #C05A2E;  --accent-l: rgba(192,90,46,0.08);  --accent-l2: rgba(192,90,46,0.16);
  --accent-text: #A64A24;  /* 5.79:1 на белом, 5.36:1 на bg */
  --green: #1B8A4C;  --green-l: rgba(27,138,76,0.09);   --green-text: #177B43;   /* 5.32:1 */
  --red: #CC3B2E;    --red-l: rgba(204,59,46,0.09);     --red-text: #B02A24;     /* 6.56:1 */
  --blue: #2563C9;   --blue-l: rgba(37,99,201,0.09);    --blue-text: #1D68BC;    /* 5.59:1 */
  --yellow: #B0680A; --yellow-l: rgba(176,104,10,0.10); --yellow-text: #846300;  /* 5.58:1 */
  --purple: #7C5CD4; --purple-l: rgba(124,92,212,0.09); --purple-text: #6F4BC8;  /* 5.97:1 */
  --teal-text: #007B6A;
  --radius: 10px;  --radius-s: 6px;  --radius-m: 10px;  --radius-l: 14px;
  --shadow-xs: 0 1px 2px rgba(20,20,25,0.04);
  --shadow-sm: 0 1px 3px rgba(20,20,25,0.05), 0 1px 2px rgba(20,20,25,0.04);
  --shadow-md: 0 4px 12px rgba(20,20,25,0.06), 0 1px 3px rgba(20,20,25,0.04);
  --shadow-lg: 0 10px 32px rgba(20,20,25,0.08), 0 2px 8px rgba(20,20,25,0.04);
  --shadow-card: var(--shadow-xs);  --shadow-card-hover: var(--shadow-sm);
  --glass-bg: var(--surface);  --glass-border: var(--border);  --glass-blur: none;  --glass-inset: none;
  --elevation-0: none;
  --elevation-1: 0 1px 3px rgba(20,20,25,0.05), 0 1px 2px rgba(20,20,25,0.04);
  --elevation-2: 0 4px 12px rgba(20,20,25,0.07), 0 2px 4px rgba(20,20,25,0.04);
  --elevation-3: 0 12px 40px rgba(20,20,25,0.11), 0 4px 8px rgba(20,20,25,0.05);
  --ease-out: cubic-bezier(0.16,1,0.3,1);  --ease-spring: cubic-bezier(0.34,1.56,0.64,1);
  --duration-fast: 0.15s;  --duration-normal: 0.25s;
  /* Pipeline-треки: нейтральная пастель + насыщенный current (solid hex — не rgba) */
  --track-prep-done: #EDEDEF; --track-prep-current: #2E2E36;
  --track-exp-done: #F5E4DB;  --track-exp-current: #C05A2E;
  --track-nego-done: #F7EBD4; --track-nego-current: #B0680A;
  --track-proj-done: #DFEAF9; --track-proj-current: #2563C9;

  --font-app: var(--font-inter, 'Inter');
  font-feature-settings: 'cv11';
}

/* Minimal A11Y: сплошные заливки с белым текстом — тот же приём, что в aura.
   --accent #C05A2E white-on-fill = 4.43:1 (провал AA) → затемняем fill до *-text. */
.t-minimal .bg-accent { background-color: var(--accent-text) !important; }
.t-minimal .bg-green  { background-color: var(--green-text) !important; }
.t-minimal .bg-blue   { background-color: var(--blue-text) !important; }
.t-minimal .bg-red    { background-color: var(--red-text) !important; }
.t-minimal .bg-purple { background-color: var(--purple-text) !important; }
.t-minimal .bg-yellow { background-color: var(--yellow-text) !important; }
.t-minimal { --tw-ring-color: var(--accent-text); }
```

Правила, которые НЕ нарушать:
- НЕ добавлять `font-family` напрямую на `.t-minimal` — только `--font-app`.
- Блок вставлять ВНЕ `@layer` (как остальные темы) — unlayered тема-оверрайды
  должны перебивать layered-компонентные правила.
- Никаких `[data-modal]`-оверрайдов не нужно — surface непрозрачный.

---

## ЗАДАЧА 4: Свотч в пикере настроек

Файл: `src/components/settings/SettingsContent.tsx`

В массив `THEMES` добавить последним:

```ts
{ id: 't-minimal', label: 'Minimal', color: '#C05A2E' },
```

Грид пикера: `grid-cols-3 gap-2 sm:grid-cols-6` — при 7 темах на sm будет 6+1.
Заменить на `sm:grid-cols-4` (4+3, ровнее).

---

## ЗАДАЧА 4b: THEME_SWATCHES в ContentHeader (ОБЯЗАТЕЛЬНО — иначе tsc упадёт)

Файл: `src/components/layout/ContentHeader.tsx`

Хедер-пикер тем держит `THEME_SWATCHES: Record<Theme, string>` — после
расширения `THEMES` в сторе TypeScript потребует ключ `'t-minimal'`. Добавить:

```ts
't-minimal': '#C05A2E',
```

---

## ЗАДАЧА 5: Тип Theme

Проверить, что тип `Theme` выводится из массива `THEMES` (`(typeof THEMES)[number]`) —
тогда правок в типах не нужно. Если где-то есть ручные union-типы темы:

```bash
grep -rn "t-tidal" src --include="*.ts" --include="*.tsx" | grep -v theme-store | grep -v SettingsContent | grep -v layout.tsx | grep -v globals.css
```

Каждое найденное место (списки тем в компонентах, isDark-хелперы и т.п.) —
дополнить `t-minimal` по смыслу (t-minimal — светлая, НЕ glass, без орбов,
иконочный sidebar как washi/fuji/dark-темы, БЕЗ sumi/indigo фона — дефолтный
светлый surface).

---

## ЗАДАЧА 6: Контраст-гейт (audit-contrast.py)

Скрипт называется `scripts/audit-contrast.py` и парсит темы из словаря
`theme_selectors` — новую тему он сам не увидит. Два шага:

1. В `scripts/audit-contrast.py` в `theme_selectors` добавить:

```python
't-minimal': '.t-minimal',
```

2. Прогнать:

```bash
python3 scripts/audit-contrast.py
```

Все text-токены обязаны давать ≥4.5:1 на --surface, --bg И --surface3;
--border-input ≥3:1 к --surface. Предрасчёт: text 17.35 / dim 6.82 / mute 5.27
(на белом) — запас есть. Провал → затемнить провалившийся токен на минимальный
шаг и перепрогнать; остальные значения задачи 3 не трогать. По старым 6 темам
новых FAIL быть не должно (скрипт их тоже прогонит — это и есть регресс-гейт).

## ЗАДАЧА 7: Смок

```bash
npm run build 2>&1 | tail -20   # tsc должен пройти
npm run dev
```

Руками (или dev-скриншотами): переключить тему на Minimal в ОБОИХ пикерах
(/settings и хедер), пройти /overview, /tasks, /deals, /projects/[id], модалку
любую, CommandPalette (⌘K). Проверить: шрифт Inter применился (DevTools →
computed font-family), FOUC нет (hard reload на /tasks), переключение на
остальные 6 тем не сломалось, cycleTheme проходит все 7.

---

## КОММИТ

Рабочее дерево может быть грязным (`_analysis/*` и пр.) — добавлять ТОЛЬКО
файлы спринта, никакого `git add .`:

```bash
git add src/app/layout.tsx src/lib/stores/theme-store.ts src/app/globals.css \
  src/components/settings/SettingsContent.tsx src/components/layout/ContentHeader.tsx \
  scripts/audit-contrast.py
git commit -m "feat(themes): новая тема Minimal (t-minimal) — нейтральный canvas, Inter, терракотовый акцент"
```

НЕ пушить без подтверждения. Миграций БД в этом спринте нет.
После мержа (зона Cowork-гейта, не CC): обновить theme-system.md /
architecture.md в скилле crm-architect — «тем 7», swatch, шрифт Inter.
