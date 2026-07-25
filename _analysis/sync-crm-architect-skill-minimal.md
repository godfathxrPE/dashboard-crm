# Sync crm-architect skill — 7-я тема Minimal (после M1/M2)

**Дата:** 2026-07-19 · **Повод:** M1 (`t-minimal`) + M2 запушены в `feat/deal-card`
(`c4763dd`). Скилл всё ещё говорит «тем 6» → врёт будущим сессиям. Ниже точные
правки. Источник скилла — `~/.claude/skills/crm-architect/` (в репо не вендорится,
`docs/` держит только schema.md).

Три файла: `SKILL.md`, `references/theme-system.md`, `references/learnings.md`.
Правки чисто документационные, кода не касаются.

---

## 1. `SKILL.md` — строка Project Identity

**old:**
```
| Default theme | **t-aura** (Scandi удалён); **6 тем** — aura/washi/fuji/frost/aurora/tidal, см. theme-system.md |
```
**new:**
```
| Default theme | **t-aura** (Scandi удалён); **7 тем** — aura/washi/fuji/frost/aurora/tidal/minimal, см. theme-system.md |
```

---

## 2. `references/theme-system.md`

### 2.1 Заголовок счётчика тем

**old:** `**Тем 6** (AUDIT C удалил `scandi`/`paper`/`sand`, ~8 спринтов назад).`
**new:** `**Тем 7** (AUDIT C удалил `scandi`/`paper`/`sand`; **M1 добавил `t-minimal`**).`

### 2.2 Таблица тем — добавить строку последней

```
| `t-minimal` | «Minimal» | `#C05A2E` | **Новая (M1, 2026-07-19).** Light, нейтральный canvas (Linear/Attio class). Шрифт → Inter (`--font-app`). Без орбов / glass / watermark — «тихая» тема. Иконочный nav как washi/fuji |
```

### 2.3 Абзац про светлые непрозрачные

**old:** `t-washi`/`t-fuji` — светлые непрозрачные.
**new:** `t-washi`/`t-fuji`/`t-minimal` — светлые непрозрачные (`--glass-blur: none`).

### 2.4 Text-nav shell — уточнить, что minimal иконочный

В абзаце «Text-nav shell: только `t-aura`... Остальные 5 тем — icon-`TextNavSidebar`»
заменить **«Остальные 5 тем»** → **«Остальные 6 тем»** (washi/fuji/frost/aurora/tidal/minimal).

### 2.5 FOUC-гард — whitelist

**old:** `whitelist `['t-aura','t-washi','t-fuji','t-frost','t-aurora','t-tidal']``
**new:** `whitelist `['t-aura','t-washi','t-fuji','t-frost','t-aurora','t-tidal','t-minimal']``
(и в п.3 того же раздела: неизвестное/legacy → `t-aura`, без изменений)

### 2.6 Секция Fonts — добавить строку

После `- `t-fuji` → IBM Plex Sans (`--font-app: var(--font-plex)`)`:
```
- `t-minimal` → Inter (`--font-app: var(--font-inter)`)
```
И в `layout.tsx` теперь 5 next/font: Manrope, IBM Plex, Onest, Unbounded, **Inter**.

### 2.7 CSS Variable Map — счётчик селекторов

**old:** `**6 тема-селекторов**`
**new:** `**7 тема-селекторов**`

---

## 3. `references/learnings.md` — блок CSS & Themes

**old:**
```
### ℹ️ Тем 6, дефолт `t-aura` (AUDIT C)
`scandi`/`paper`/`sand` **удалены**. Живые темы (`THEMES` в `lib/stores/theme-store.ts`):
`t-aura` (дефолт, light, орбы), `t-washi`, `t-fuji`, `t-frost`/`t-aurora`/`t-tidal` (dark glass).
Persisted/неизвестное legacy-значение → миграция на `t-aura`. Подробности — `theme-system.md`.
```
**new:**
```
### ℹ️ Тем 7, дефолт `t-aura` (AUDIT C + M1)
`scandi`/`paper`/`sand` **удалены**. Живые темы (`THEMES` в `lib/stores/theme-store.ts`):
`t-aura` (дефолт, light, орбы), `t-washi`, `t-fuji`, `t-minimal` (light, нейтральный, Inter),
`t-frost`/`t-aurora`/`t-tidal` (dark glass).
Persisted/неизвестное legacy-значение → миграция на `t-aura`. Подробности — `theme-system.md`.
```

---

## 4. Если ведёшь bundle `_analysis/crm-architect.skill`

Перегенерировать/переэкспортировать после правок 1–3 (там конкатенация SKILL.md +
references). Свежий audit-contrast.py уже знает `t-minimal` — гейт-инвентарь актуален.

## 5. Проверка после применения

```bash
grep -rn "Тем 6\|6 тем\|Остальные 5 тем" ~/.claude/skills/crm-architect/   # должно быть пусто
grep -rn "t-minimal" ~/.claude/skills/crm-architect/                        # ≥5 упоминаний
```
