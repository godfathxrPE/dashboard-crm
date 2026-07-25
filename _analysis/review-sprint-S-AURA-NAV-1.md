# Ревью: S-AURA-NAV-1 — сайдбар aura (бренд + типографика) + орбы в tbody

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/chat-reactions` @ `73f739d` ≡ `main`/`origin/main`, crm-architect `architecture.md` / `learnings.md`; schema N/A)  
**Объект:** `_analysis/sprint-S-AURA-NAV-1.md` — единый бренд Torii CRM, нав без капса, фикс F-03 (орбы сквозь tbody)  
**Контекст:** client-only, без миграций; аудит aura (`improvements/CRMs/audit-aura-design.md`, F-01/F-03); pipeline: Grok → CC → визуальный смок Cowork. Ветка спринта: `feat/aura-nav` (ещё не создана).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (команды / ожидания) | ✅ Совпадает с live-кодом |
| Линейные якоря (L176–195, ~L987, L155, thead) | ✅ Точные на `73f739d` |
| Задача 1 — бренд Torii CRM | ✅ Верно; страгглеров БИТ.IIOT нет |
| Задача 2 — типографика nav | ✅ Scoped `.t-aura`; MAIN_NAV уже sentence case |
| Задача 3 — tbody / F-03 | ✅ Одна строка, симметрично thead |
| Scope / «не трогать» | ✅ isWashi, nav-ico, kanban/KPI вне scope |
| CSS: tokens + `.t-aura` only | ✅ |
| SQL / RLS / schema | ✅ N/A |
| База `main` @ ≥ `73f739d` | ✅ HEAD = `73f739d` |
| Путь к аудиту в шапке | 🟡 Файл не в `_analysis/` |
| Post-edit cleanup `isAura` | 🟡 Не прописан явно |
| Смок «ровно белая» vs zebra | 🟡 Zebra `@layer` останется |

**Оценка: 9/10.** Короткий, точный UI-спринт; разведка и правки сверены с кодом.  
**Рекомендация:** **запускать в CC** с чистого `main` @ `73f739d`; в задаче 1 явно снести неиспользуемый `isAura` и комментарий про ОП/БИТ.IIOT. Жёстких блокеров нет.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| Бренд aura: ОП / Dashboard / БИТ.IIOT | ❌ Ещё в `TextNavSidebar.tsx` L176–192 |
| Nav caps + tracking 0.12em | ❌ Ещё `globals.css` L987–990 |
| nav-vlabel 9px + lowercase + tracking-wider | ❌ Ещё L155 |
| `.t-aura table thead th { background: var(--surface) }` | ✅ L1047–1049 |
| `.t-aura table tbody { background: var(--surface) }` | ❌ Нет (F-03 open) |
| `.t-fuji .logo-icon` градиент | ✅ L548–551 — не трогать |
| metadata `title: 'Torii CRM'` | ✅ `src/app/layout.tsx` L39 |
| Ветка `feat/aura-nav` | ❌ Не создана |
| Review-файл на этот спринт | ❌ Не было (этот прогон) |

---

## С чем согласен полностью

### 1. WHY / диагноз
- Aura — единственная ветка бренда «ОП / Dashboard / БИТ.IIOT» (`TextNavSidebar.tsx` L181–192); остальные темы уже «TC / Torii CRM».
- Primary-nav caps: `.t-aura aside nav a[data-nav-item] > span` L987–990 (`uppercase` + `letter-spacing: 0.12em` + `font-weight: 500`). Лейблы в `MAIN_NAV` — sentence case («Сегодня», «Календарь»…) — caps только CSS.
- F-03: комментарий L1046 «орбы не грязнят данные» закрыт только для `thead th`; tbody/tr odd = `transparent`, even = semi-transparent mix (`@layer components` L1239–1240). Орбы alpha 0.14–0.18 (`--aura-orb-a1/a2` L893–894). Совпадает с аудитом F-03.

### 2. РАЗВЕДКА — live output

| # | Ожидание спринта | Факт |
|---|------------------|------|
| 1 | Бренд ~L176–195 | L176–192: isAura ternaries + БИТ.IIOT |
| 2 | Страгглеры БИТ/IIOT | Только `TextNavSidebar.tsx` (бренд). Прочие «Dashboard» — компонент/импорт, не бренд |
| 3 | Caps ~L987; пилюля ~L1000 | L987–990 caps; L995–1003 пилюля + weight 600 |
| 4 | nav-vlabel ~L155 | L155: `nav-vlabel text-[9px] tracking-wider lowercase` |
| 5 | thead-фикс | L1047–1049 `.t-aura table thead th { background: var(--surface); }` |
| 6 | logo-icon aura нет; fuji есть | Только `.t-fuji .logo-icon` L548 |

### 3. Задача 1 — единый бренд
После снятия isAura-веток логотип: `h-8 w-8 rounded-md bg-accent text-white text-sm` + «TC» + «Torii CRM».  
`.t-aura .bg-accent { background-color: var(--accent-text) !important }` — **L213** (не «~», точно); `--accent-text: #343840` L175 → графитовая плитка, белый TC.  
Fuji: `.t-fuji .logo-icon` gradient `!important` L548–551 — не затронут.  
`isWashi` / WashiNavLabel L146–148 — вне правок бренда.  
Страгглеров БИТ.IIOT в `src/` нет; `metadata.title` уже «Torii CRM».

### 4. Задача 2 — типографика
- 2.1: оставить только `font-weight: 500` — трекинг уйдёт к `.t-aura { letter-spacing: -0.006em }` L203.  
- 2.2: пилюля L995–1003 не трогать — верно. После снятия 0.12em строки **короче**, тесноты меньше, не больше.  
- 2.3: 9px → 11px закрывает F-01 **локально** для nav-vlabel; `nav-vlabel` виден только в aura (L1013), в остальных темах `display: none` (L1277) — правка className в shared-shell безопасна.  
- `.t-aura .nav-ico { display: none }` L1010 — не трогать.

### 5. Задача 3 — F-03
```css
.t-aura table tbody { background: var(--surface); }
```
рядом с thead L1047 — ровно рекомендация аудита.  
`var(--surface)` в aura = `#FFFFFF` L159.  
Hover: global `table tbody tr:hover { background: var(--accent-l) !important }` L1248 + DataTable `hover:bg-accent-l` L293 — поверх tbody.  
Selected: `bg-accent-l` на `tr` L293 — поверх tbody.  
Orbs/stacking: opaque tbody режет bleed; zebra even-строк рисуется **поверх** surface, не «сквозь» орбы.

### 6. Границы / инфраструктура
- Client-only, без миграций, schema/RLS N/A.  
- CSS только переменные и `.t-aura`-scope; 5 остальных тем не правятся.  
- Файлы коммита: `TextNavSidebar.tsx` + `globals.css` — полный inventory.  
- architecture.md: `TextNavSidebar`, `AuraOrbs`, `globals.css` — пути верны.  
- learnings: 6 тем, дефолт `t-aura`, theme class = store value `t-aura`, CSS variables only — соблюдено.

---

## Блокеры (критично — исправить до запуска)

**Жёстких блокеров нет.**

---

## Предупреждения (желательно исправить)

### W1. После задачи 1 `isAura` станет мёртвым
Сейчас `isAura` только в бренд-блоке (L81, L181–192). После унификации:
```ts
const isAura = theme === 't-aura'; // unused
```
`noUnusedLocals` в tsconfig **выключен** → `tsc`/`build` не упадут, но `next lint` / шум в diff.  
**В спринт:** явно: удалить `const isAura = …`; `theme` / `isWashi` оставить. Обновить комментарий L176 (ОП/БИТ.IIOT) и при желании L71/L153 («капс-нав»).

### W2. Смок «ровно белая» vs глобальная zebra
`@layer components` L1239–1240:
```css
table tbody tr:nth-child(even) { background: color-mix(in srgb, var(--surface2) 50%, transparent); }
table tbody tr:nth-child(odd) { background: transparent; }
```
После tbody-фона odd = чистый surface; even = лёгкая zebra **без** орбов. F-03 закрыт; «только ровный белый» — нет, если не гасить zebra в `.t-aura`.  
**Смок:** «нет цветного bleed орбов; допустима штатная zebra surface2». Гасить zebra — только если продукт так решит (отдельная строка CSS).

### W3. Путь к аудиту в шапке
Спринт: `_analysis/audit-aura-design.md` / `Project/claude/audit-aura-design-2026-07-19.md`.  
Факт: `improvements/CRMs/audit-aura-design.md` (F-03 текст совпадает). Не ломает исполнение.

### W4. Грязное дерево / не та ветка для старта
Workspace: `feat/chat-reactions` @ `73f739d`, куча untracked `_analysis/*`, modified review-файлы.  
`git switch -c feat/aura-nav` с грязного дерева утащит шум.  
**CC:** `git switch main && git status` clean → `git switch -c feat/aura-nav` → только 2 файла в commit.

### W5. architecture.md / комментарии «капс-нав»
architecture.md L45–46, L152–154: «текстовый капс-нав». После спринта формулировка устареет. Не блокер S-AURA-NAV-1; долг S-DOCS-SYNC / learnings.

### W6. Селектор `a[data-nav-item] > span` бьёт и badge
Прямые `span`-дети `a` (лейбл + NavBadge) уже получали uppercase/tracking; после правки останется `font-weight: 500` на badge — безвредно. Не менять селектор без нужды.

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| — | — | Доп. файлов под scope нет |
| `src/app/layout.tsx` | 39 | Уже «Torii CRM» — не трогать |
| `src/app/globals.css` | 548–551 | fuji logo — не трогать |
| `src/components/layout/TextNavSidebar.tsx` | 146–148 | isWashi — не трогать |
| `src/app/globals.css` | 1010–1016 | nav-ico / nav-vlabel display / nav-active — не трогать |

---

## Предлагаемые правки в спринт

1. **Задача 1 — cleanup:** «удалить `const isAura = theme === 't-aura'`; обновить JSDoc/коммент L176 → единый TC/Torii CRM».
2. **Задача 3 / ПРОВЕРКА:** заменить «ровно белая» на «без bleed орбов; hover/selected видны; штатная zebra surface2 допустима».
3. **Контекст:** аудит → `improvements/CRMs/audit-aura-design.md`.
4. **КОММИТ:** старт с чистого `main` @ `73f739d`; `git add` только два указанных файла.
5. Опционально: comment L987 «капс…» → «вес primary-nav» после 2.1.

---

## Чеклист перед CC

- [ ] `git switch main` (или sync), clean tree, `git log -1` = `73f739d` или новее
- [ ] `git switch -c feat/aura-nav`
- [ ] Разведка-6 команд — сверка без сюрпризов (ожидаемо PASS)
- [ ] Задача 1: единый TC/Torii CRM + **удалить `isAura`** + коммент L176
- [ ] Задача 2.1: caps/tracking off; weight 500; пилюля не трогать
- [ ] Задача 2.3: `nav-vlabel text-[11px]` (без lowercase/tracking-wider)
- [ ] Задача 3: `.t-aura table tbody { background: var(--surface); }` у thead-блока
- [ ] Не трогать: isWashi, nav-ico, fuji logo-icon, kanban/KPI/радиусы
- [ ] `npx tsc --noEmit`; `npm run build` (без живого dev)
- [ ] Смок aura: expanded/collapsed nav, /contacts tbody без orb-tint, hover/selected
- [ ] Смок не-aura: шапка TC/Torii CRM; fuji-плитка золотая
- [ ] Commit message как в спринте; push только после локального смока (по пайплайну)

---

## crm-architect checklist

| Пункт | Статус |
|-------|--------|
| РАЗВЕДКА в начале | ✅ |
| Реальные table/column (schema) | ✅ N/A |
| Реальные пути (architecture) | ✅ |
| learnings gotchas | ✅ CSS vars, theme class, 6 тем |
| SQL migrations separate / not applied from CC | ✅ N/A |
| org_id / RLS / current_org_role | ✅ N/A |
| SECURITY DEFINER + ACL | ✅ N/A |
| No `flowType: 'implicit'` | ✅ N/A |
| DELETE → CASCADE | ✅ N/A |
| CSS: variables, theme-scoped | ✅ |
| schema.md after migration | ✅ N/A |

---

## Итог одной строкой

Спринт **готовый к CC**: три точечные правки в 2 файлах, line numbers живые, F-03 = 1 CSS-строка; перед стартом — clean `main`, явно снести `isAura`, смок с учётом штатной zebra.
