# Ревью: Fix M1.1 — Minimal: чёрный primary + нейтральный активный нав

**Дата:** 2026-07-19  
**Ревьюер:** Grok (live `feat/deal-card` @ `c4763dd` — M1+M2 в истории)  
**Объект:** `_analysis/fix-m1-1-minimal-polish.md`  
**Контекст:** post-M1 polish vs референс torii-redesign; только `globals.css` + `audit-contrast.py`

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА vs live | ✅ якоря 1:1 |
| Задача 1 (bg-accent → --text) | ✅ диагноз и фикс верны; WCAG 17.3:1 |
| Задача 2 (sidebar tokens) | ✅ нужны; **недостаточны одни** (см. B1) |
| Задача 3 (nav-active) | 🟡 рамка есть; override в спринте **неполный** |
| Задача 4 (focus-day) | 🟡 glow есть; нужен `animation: none` |
| Задача 5 (audit-contrast) | ✅ ветка `t-aura`/`t-minimal` L220 — править |
| Scope / commit | ✅ |
| Готовность к CC | 🟡 после уточнения B1 (1 блок CSS) |

**Оценка: 8.5/10.** Узкий, правильный fix.  
**Рекомендация:** GO в CC **с расширенным** override `.nav-active` (B1) и `animation: none` на focus-day (W1). As-is task 3 оставит терракотовый фон активного пункта.

---

## Live-разведка

| Claim | Live |
|-------|------|
| HEAD feat/deal-card | ✅ `c4763dd` (M2; M1 = `8ffee6d`) |
| `.t-minimal .bg-accent` | L679 → `var(--accent-text)` |
| sidebar tokens minimal | L644: `accent-l` / `accent-text` |
| `.nav-active` global | L1330–1331 `@layer`: border-left accent, bg `accent-l`, color accent |
| aura kill left border | L1068 `.t-aura aside .nav-active { border-left: none }` |
| focus-day-card | L875–878: border accent-l2 + glow + `focus-glow` animation |
| audit-contrast t-minimal | L119 + L220 `elif th in ('t-aura', 't-minimal'): fill = text_token` |
| logo / CTA | `TextNavSidebar` L177 `logo-icon … bg-accent`; NavBadge `bg-accent` |

`--sidebar-indicator` **нигде в компонентах не читается** (только CSS-токены). Актив рисует **`.nav-active`**, не indicator.

---

## С чем согласен

### 1. WHY / роль акцента

Live: primary = терракота через A11Y-remap `bg-accent → accent-text` (M1, white-on-#C05A2E = 4.43).  
Референс: primary/logo = near-black (`--text` #1A1A1E), terracotta = text/links.  
Задача 1: `background-color: var(--text)` → white-on-fill **~17.3:1** — корректно; `.text-accent` остаётся на `--accent-text` (не трогаем).

### 2. Задача 1 — replace, not duplicate

Одна строка L679; green/red/… не трогать; другие темы не трогать — ок.

### 3. Задача 2 — токены

`--sidebar-active-text: var(--text)` совпадает с `text-[var(--sidebar-active-text)]` в `TextNavSidebar` L133.  
`--sidebar-indicator: rgba(26,26,30,0.06)` — пригодится как bg для nav-active (см. B1).

### 4. Задача 5

Скрипт сейчас моделирует minimal solid = `*-text` как aura. После task 1 accent-fill = `--text` → обновить ветку (только accent / t-minimal), green…yellow оставить `text_token`.

### 5. Scope

Только CSS + audit script; не push; no migrations — ок.

---

## Блокеры

### B1. Задача 3: `border-color: transparent` **не** убирает терракоту

Глобально (layered, но наследуется minimal):

```1330:1331:src/app/globals.css
  .nav-active { border-left: 3px solid var(--accent); background: var(--accent-l); font-weight: 600; color: var(--accent); }
  .nav-active .lucide { color: var(--accent); }
```

После task 2:
- текст active через utility может стать `--text`, но  
- **background: var(--accent-l)** = терракотовый тинт 8%,  
- **border-left: 3px solid var(--accent)** = терракотовая полоса,  
- **color / lucide: var(--accent)** может перебить utility.

Спринтовый snippet:
```css
.t-minimal aside .nav-active { border-color: transparent; box-shadow: none; }
```
гасит только border-color (полоса может стать transparent), **фон и color/lucide — нет**.

**Обязательный override (вставить в промпт / выполнить в CC):**

```css
/* Minimal: актив нава — нейтральный тинт, без terracotta (после token-fix task 2) */
.t-minimal aside .nav-active {
  border-left-color: transparent; /* или border-left: none */
  background: var(--sidebar-indicator);
  color: var(--sidebar-active-text);
  box-shadow: none;
}
.t-minimal aside .nav-active .lucide {
  color: var(--sidebar-active-text);
}
```

Unlayered (рядом с A11Y-блоком minimal) — перебьёт `@layer` `.nav-active`.  
Без этого смок «актив — серый тинт» **провалится**.

---

## Предупреждения

### W1. focus-day-card: animation перезапишет box-shadow

```875:878:src/app/globals.css
.focus-day-card {
  border: 1px solid var(--accent-l2);
  box-shadow: 0 0 20px var(--accent-l), 0 0 40px var(--accent-l);
  animation: focus-glow 3s ease-in-out infinite;
}
```

Только `box-shadow: none` **проиграет** keyframes. Нужно:

```css
.t-minimal .focus-day-card {
  border: 1px solid var(--border);
  box-shadow: none;
  animation: none;
}
```

### W2. `--tw-ring-color: var(--accent-text)` (L685)

Focus-ring остаётся терракотовым — нормально для «ссылки/акцент». Не трогать, если референс не требует чёрный ring.

### W3. Checkbox `:checked` fill = `var(--accent)` (raw, не `.bg-accent`)

Останется терракотовым. Референс primary = black может хотеть чёрный check — **out of scope** unless smoke complains; optional:

```css
.t-minimal input[type="checkbox"]:checked { background-color: var(--text); border-color: var(--text); }
```

### W4. NavBadge `bg-accent`

Счётчики в сайдбаре станут чёрными (как primary) — согласовано с «чёрный solid».

### W5. Другие темы

Scoped `.t-minimal` only — aura/washi/dark не задеты. Смоук regression — ок.

### W6. Комментарий A11Y L677–678

Текст «затемняем fill до *-text» устареет для accent — обновить комментарий при правке L679.

---

## Пропущенные места

| | |
|--|--|
| `.btn-primary` | uses tokens / often `bg-accent` — попадёт под task 1 ✅ |
| washi/fuji `.nav-active` overrides | не трогать ✅ |
| `selection` accent | глобально — out of scope |

---

## Предлагаемые правки в fix-промпт

1. **B1** — полный `.nav-active` override (bg + color + lucide + border).  
2. **W1** — `animation: none` на focus-day.  
3. Задача 5 — псевдокод:

```python
elif th == 't-aura':
    fill = text_token(th, c)
elif th == 't-minimal':
    fill = resolve(th, 'text') if c == 'accent' else text_token(th, c)
```

---

## Чеклист перед CC

- [x] M1 live: t-minimal block L639–685  
- [ ] B1 nav-active full override  
- [ ] W1 focus-day animation:none  
- [ ] audit-contrast accent fill = --text for t-minimal  
- [ ] `python3 scripts/audit-contrast.py` — 0 FAIL  
- [ ] Смоук minimal: +Задача чёрная, TC чёрный, nav grey, links terracotta, focus-day quiet  
- [ ] aura / washi / dark — без регресса primary  

---

## crm-architect

- [x] CSS variables only, scoped `.t-minimal`  
- [x] A11Y white-on-fill (чёрный сильнее terracotta)  
- [x] Нет SQL / font-family на теме  
- [x] learnings: token paths  
- [ ] nav-active полный (B1)  

**Итог:** после B1 (+W1) — запускать; as-is task 3 — неполный polish нава.
