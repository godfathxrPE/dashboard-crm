# Ревью: P2 — тёмные фазовые цвета → секвенциальный ramp (D1)

**Дата:** 2026-07-20  
**Ревьюер:** Grok (верификация по коду `feat/deal-card` @ `2aa9fff`, live grep/read + контраст-пересчёт)  
**Объект:** `_analysis/sprint-p2-dark-funnel.md` — замена 12 `--track-*-current` в `.t-frost` / `.t-aurora` / `.t-tidal` на per-theme sequential ramp  
**Контекст:** CSS-only, миграций нет. P1 polish (`2aa9fff`) на HEAD. Blast-radius = все consumers `var(--track-*-current)`. Документы: `theme-system.md` (Chevron Pipeline Colors), `learnings.md` (solid hex on dark).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (ветка, HEAD, L80–83 / 113–116 / 147–150) | ✅ 1:1 |
| old-блоки str_replace (пробелы, nego-якоря) | ✅ byte-match |
| Только `-current`; `-done` / light themes | ✅ scope верный |
| Consumers / blast-radius (Charts, boards, delivery) | ✅ полный |
| Контраст ≥3:1 / монотонная светлота | ✅ пересчёт совпал |
| Solid hex (learnings / theme-system) | ✅ |
| Миграции / schema / RLS | ✅ N/A, не трогает |
| Post-check greps (scoped sed) | ✅ |
| Surface hex-формула в справке | 🟡 blended surface, не literal token |
| «Пол яркости» prep vs old | 🟡 prep чуть тусклее на frost/aurora |

**Оценка: 9/10.** Узкий, точный CSS-only sprint; claims сверены с live-кодом.  
**Рекомендация:** запускать в CC as-is.

---

## Live-разведка

| Claim | Live |
|-------|------|
| Checkout `feat/deal-card` после P1 `2aa9fff` | ✅ `feat/deal-card` @ `2aa9fff polish: minimal checkbox…` |
| `.t-frost` / `.t-aurora` / `.t-tidal` | ✅ L53 / L86 / L120 |
| frost track L80–83 | ✅ prep `#059669` · exp `#7c3aed` · nego `#F0C45E` · proj `#db2777` |
| aurora L113–116 | ✅ nego `#ffe060`, done-nego `#451a03` |
| tidal L147–150 | ✅ nego `#b8a058`, done-nego `#422006` |
| old 4-строчные блоки unique через nego | ✅ count=1 каждый |
| str_replace whitespace (двойной пробел после `#3b0764;`) | ✅ exact MATCH |
| Только `-current` меняется | ✅ new-снимпеты сохраняют `-done` |
| Light themes не в scope | ✅ aura/washi/fuji/minimal/`:root` — свои hex, не радуга dark |

### Consumers `--track-*-current` (blast-radius)

| Файл | Использование |
|------|----------------|
| `src/components/analytics/Charts.tsx` L19–23 | PHASE_COLORS funnel `/analytics` |
| `src/components/dashboard/OverviewCharts.tsx` L123–126 | phase chart `/overview` |
| `src/components/projects/PipelineBoard.tsx` L66–77 | PHASE_TINT + PHASE_HEADER_COLOR |
| `src/components/projects/StageBoard.tsx` L52–55 | phase markers |
| `src/components/projects/ProjectCard.tsx` L13–17, L133, L281 | dot + progress bar |
| `src/components/projects/StackedPipeline.tsx` L33–37 | phase colors |
| `src/lib/constants/delivery-phases.ts` L23–28 | `DELIVERY_PHASE_COLOR` |
| `src/components/projects/DeliveryPipelineBoard.tsx` | через `DELIVERY_PHASE_COLOR` |

Текст лейблов — на `*-text` (`PHASE_HEADER_TEXT`, `DELIVERY_PHASE_TEXT`), не на track-current → планка 3:1 (графика) корректна.

### Done-сегменты

`StackedPipeline.tsx` L389 и `DealProgressBar.tsx` L137: `state === 'done' ? 'var(--border2)'`.  
`--track-*-done` **нигде в TS/TSX не читаются** (только объявления в `globals.css`) — «-done не трогать» безопасно.

---

## С чем согласен полностью

### 1. Диагноз: общая «радуга» на dark

Три тёмных блока делят prep/exp/proj (`#059669` / `#7c3aed` / `#db2777`) и отличаются только nego. На упорядоченной воронке (Привлечение→Закрытие) это категориальная палитра, не sequential — color-architect вариант B уместен.

### 2. Механика правок

Три блочных `str_replace` по nego-уникальным 4-строчникам — правильный антипаттерн к global replace.  
Предупреждение не трогать `#059669`/`#7c3aed`/`#db2777` глобально — критично: в `:root` живёт `--purple: #7c3aed` (L29), вне track-токенов.

### 3. Палитра / a11y

Пересчёт WCAG relative luminance vs **claimed surfaces**:

| тема | surface (claimed) | prep | exp | nego | proj | mono L↑ |
|------|-------------------|------|-----|------|------|---------|
| frost | `#1E2130` | 4.03 (≈4.0) | 5.39 (≈5.4) | 7.14 (≈7.1) | 9.49 (≈9.5) | ✅ |
| aurora | `#171B27` | 4.14 (≈4.1) | 5.34 (≈5.3) | 6.90 (≈6.9) | 9.32 (≈9.3) | ✅ |
| tidal | `#0C1813` | 4.85 (≈4.8) | 6.45 (≈6.5) | 8.35 (≈8.3) | 10.83 (≈10.8) | ✅ |

Все solid hex — соответствует learnings («Semi-transparent fills bleed through on dark»).

Бонус a11y: старый exp `#7c3aed` на frost effective surface ≈ **2.80:1** (&lt;3:1); новый ramp чинит это (≥5.3:1).

### 4. Hue-арки vs accent

- frost accent `#5b8aff` → blue/cyan ramp  
- aurora accent `#a060ff` → violet/magenta  
- tidal accent `#48b890` → teal/aqua  

Согласовано с identity тем.

### 5. Scope / DoD / commit

Один файл `src/app/globals.css`, без миграций, `tsc` sanity, smoke по трём dark + одной light, commit message адекватен. «Не пушить без подтверждения» — ок.

---

## Блокеры (критично — исправить до запуска)

**Нет.**

---

## Предупреждения (желательно, не блокируют)

### W1. Surface hex = blended effective, не literal token

Справка: frost `#1E2130` / aurora `#171B27` / tidal `#0C1813`.  
Live: `--surface` — rgba поверх `--bg` (`#0d1020` / `#0a0e1a` / `#080f0d`); popover — `#1e2233` / `#1a1e2c` / `#102119`.

Пересчёт: claimed hex **точно** = `bg ⊗ surface alpha` (frost/aurora white 7%/5.5%, tidal green 7%). Контраст-таблица валидна; формулировку «фактические поверхности» можно уточнить как *effective surface*, чтобы CC не искал token.

### W2. «Пол ≈ нынешней яркости» — prep чуть ниже old

| | old prep `#059669` L | new prep L | Δ |
|--|---------------------|------------|---|
| frost | 0.229 | 0.215 | −6% |
| aurora | 0.229 | 0.203 | −11% |
| tidal | 0.229 | 0.230 | ~0 |

Ранняя фаза (точка-маркер) на frost/aurora чуть тусклее, но ≥4:1. Exp/nego/proj в целом ярче/ровнее. Smoke «ранняя фаза видна» — смотреть глазами; при желании поднять frost/aurora prep на 1–2 L-шага (не блокер).

### W3. `--track-*-done` остаются «радужными» orphans

После спринта `-current` — monochrome ramp, `-done` — green/purple/amber/pink darks, **не используются** в UI. Оставить out-of-scope ок; отдельный cleanup later.

### W4. Post-check: не grep'ать `#7c3aed` по всему файлу

После замены `#7c3aed` останется в `:root --purple`. Спринт правильно scope'ит `sed -n '80,83p;…'`. CC не должен расширять проверку до whole-file.

### W5. Aura funnel charts

`Charts.tsx` для `t-aura` использует hard-coded `AURA_PHASE` gradients, не track-токены — light smoke «не изменилось» всё равно валиден; dark path идёт через `PHASE_COLORS` → track.

---

## Пропущенные места

| Файл / зона | Строки | Действие |
|-------------|--------|----------|
| — | — | CSS-only; consumers только читают vars — правок в TS не нужно |
| `DeliveryPipelineBoard` / `DealProgressBar` | — | уже в blast-radius через tokens / smoke delivery-карточки; опционально явно в СМОК |

---

## Предлагаемые правки в спринт

1. *(опц.)* В справке: «effective surface = bg⊗surface, ≈ `#1E2130` / …»  
2. *(опц.)* В post-check явно: «`:root --purple #7c3aed` остаётся — это OK»  
3. *(опц.)* В СМОК: `/deals` PipelineBoard + delivery board (`DELIVERY_PHASE_COLOR`)  
4. **Не обязательно править перед CC** — as-is достаточно

---

## Чеклист crm-architect

- [x] РАЗВЕДКА перед правками  
- [x] Реальные пути (`src/app/globals.css`)  
- [x] learnings: solid opaque hex on dark; CSS variables only  
- [x] SQL/миграции: нет  
- [x] org_id / RLS: N/A  
- [x] CSS: vars only, scoped to theme class (`.t-frost` / `.t-aurora` / `.t-tidal`)  
- [x] schema.md: N/A  
- [x] Не трогать light themes / `-done` / text-токены  

---

## Чеклист перед CC

- [ ] На `feat/deal-card` @ `2aa9fff` (или новее с тем же `globals.css` track-блоками)  
- [ ] РАЗВЕДКА: `sed -n '80,83p;113,116p;147,150p'` = expected rainbow  
- [ ] Три str_replace **блоками**, не global hex  
- [ ] Post: scoped sed → 0 старых rainbow; `grep -c` новых prep hex → 3  
- [ ] Smoke frost/aurora/tidal: `/analytics`, `/overview`, ProjectCard marker, pipeline/stage board  
- [ ] Smoke 1 light theme: track без изменений  
- [ ] `npx tsc --noEmit`  
- [ ] Commit только `src/app/globals.css`; **не push** без ОК  

**Итог:** GO — можно отдавать в Claude Code.
