# Claude Code Prompt — Fix M1.1: Minimal — чёрный primary, нейтральный активный нав (D1)

Живой t-minimal разошёлся с референсом (torii-redesign-concept.html) в роли
акцента. Референс: primary-действия и лого — ЧЁРНЫЕ (--text), терракота —
только ссылки/текстовые акценты. Live: терракота залезла в кнопки, лого и
активный пункт сайдбара через ремап `.bg-accent → --accent-text` (A11Y-блок M1)
и дефолтные sidebar-токены.

Работать в чекауте, где HEAD = feat/deal-card (M1+M2 запушены).

> v1.1 — учтено ревью Grok 2026-07-19: полный unlayered-override .nav-active
> (B1: фон/color/lucide, не только рамка — токены sidebar-indicator компонентами
> не читаются), animation:none на focus-day (W1), псевдокод ветки audit-скрипта,
> обновить комментарий A11Y-блока (W6).

---

## РАЗВЕДКА

```bash
git log --oneline -1                       # ожидается верхушка feat/deal-card
grep -n "t-minimal .bg-accent" src/app/globals.css
grep -n "sidebar-indicator\|sidebar-active-text" src/app/globals.css | head -12
grep -n "nav-active" src/app/globals.css | head -20   # кто рисует рамку/фон актива
grep -n "focus-day-card" src/app/globals.css
grep -n "t-minimal" scripts/audit-contrast.py
```

---

## ЗАДАЧА 1: .bg-accent → чёрный (замена существующего ремапа)

Файл: `src/app/globals.css`, A11Y-блок t-minimal.

БЫЛО (из M1, ~L679):
```css
.t-minimal .bg-accent { background-color: var(--accent-text) !important; }
```
СТАЛО:
```css
/* Primary actions — чёрные (референс Minimal): white-on-#1A1A1E ≈ 17.3:1.
   Терракота остаётся тексту/ссылкам (.text-accent → --accent-text). */
.t-minimal .bg-accent { background-color: var(--text) !important; }
```

ЗАМЕНИТЬ строку, не добавлять вторую (иначе исход решает порядок в файле).
Остальные ремапы (.bg-green/.bg-red/...) не трогать. Ремапы других тем не трогать.
Комментарий над A11Y-блоком («затемняем fill до *-text») обновить: для accent
теперь fill = --text, остальные — по-прежнему *-text.

## ЗАДАЧА 2: нейтральный активный пункт сайдбара

В токен-блоке `.t-minimal { ... }`:

БЫЛО:
```css
--sidebar-indicator: var(--accent-l);  --sidebar-active-text: var(--accent-text);
```
СТАЛО:
```css
--sidebar-indicator: rgba(26,26,30,0.06);  --sidebar-active-text: var(--text);
```

## ЗАДАЧА 3: полный override .nav-active (КРИТИЧНО — токены сами не сработают)

Факт из live: `--sidebar-indicator` компонентами НЕ читается. Актив рисует
layered-правило `.nav-active` (~L1330): `border-left: 3px solid var(--accent)`
+ `background: var(--accent-l)` + `color: var(--accent)` + lucide-иконка accent.
Гасить только рамку недостаточно — фон и цвет останутся терракотовыми.

Полный override, UNLAYERED (рядом с A11Y-блоком minimal, вне @layer — иначе
не перебьёт):

```css
/* Minimal: актив нава — нейтральный тинт, без терракоты */
.t-minimal aside .nav-active {
  border-left-color: transparent;
  background: var(--sidebar-indicator);
  color: var(--sidebar-active-text);
  box-shadow: none;
}
.t-minimal aside .nav-active .lucide {
  color: var(--sidebar-active-text);
}
```

## ЗАДАЧА 4: focus-day-card — нейтральная рамка + animation:none

Live (~L875): glow сидит не только в box-shadow, но и в keyframes-анимации
`focus-glow` — без `animation: none` фикс проиграет анимации:

```css
.t-minimal .focus-day-card {
  border: 1px solid var(--border);
  box-shadow: none;
  animation: none;
}
```

## ЗАДАЧА 5: audit-contrast.py — button-модель t-minimal

В M1 ветка скрипта (~L220) считает solid-fill для t-minimal = `*-text`.
После задачи 1 фактический fill `.bg-accent` = `--text` (#1A1A1E), остальные
цвета (green/red/...) — по-прежнему `*-text`. Развести ветки:

```python
elif th == 't-aura':
    fill = text_token(th, c)
elif th == 't-minimal':
    fill = resolve(th, 'text') if c == 'accent' else text_token(th, c)
```

(имена функций подогнать под фактический код скрипта). Прогнать:

```bash
python3 scripts/audit-contrast.py   # 0 FAIL по всем 7 темам
```

## СМОК

/tasks + /overview на t-minimal: кнопка «+ Задача» чёрная; лого TC чёрное;
NavBadge-счётчики чёрные (urgent — красные, как были); актив нава — серый тинт,
текст и иконка --text, без терракотовой полосы слева; ссылки («Портфель →»,
«добавить») ОСТАЛИСЬ терракотовыми; focus-ring остаётся терракотовым (норма,
не трогаем); «Фокус дня» без glow и без пульсации.
Быстрый прогон aura + washi + одна тёмная: их primary/лого/актив не изменились
(все правки scoped .t-minimal).

Опция по вкусу (вне обязательного скоупа): чекбоксы `:checked` красятся сырым
var(--accent) и останутся терракотовыми. Если в смоке это выбивается — добавить
`.t-minimal`-override на --text тем же коммитом, отметить в отчёте.

## КОММИТ

```bash
git add src/app/globals.css scripts/audit-contrast.py
git commit -m "fix(themes): minimal — чёрный primary и нейтральный активный нав (соответствие референсу)"
```

НЕ пушить без подтверждения. Миграций нет.
