# Claude Code Prompt — Sprint C7: icon-nav для всех тем кроме aura (регресс-фикс C6)

## Контекст

C6 unified shell снёс старый иконочный Sidebar; washi-фикс вернул jpLabel+Torii-текст, но НЕ
визуальный язык. Решение Олега (скрины-эталоны у него, прод Netlify = старый вид):
**вернуть иконочный вид нава во всех темах, КРОМЕ aura** (aura остаётся текстовым капс-навом).

**Зафиксированные баги локалки (эталон — прод):**
1. washi hover: текст становится чёрным (нечитаем). Корень: `hover:text-text-main` на тёмном
   sumi-сайдбаре; раньше перекрывалось `.t-washi .nav-item`-CSS — эти правила НЕ мёртвые,
   их снесли/не перенесли по ошибке классификации.
2. Пропали красные бейджи-плашки на цифрах (`NavBadge` с urgent остался в удалённом Sidebar).
3. Пропал акцент на TC-лого (был `bg-accent text-white` — в washi красный сам собой).
4. Шрифты: старый item = `text-sm` (14px) + icon 20px, gap-3, px-3 py-2; яркость пунктов выше.
5. Читаемость иероглифов хуже (следствие 1+4 + dim).

## ЕДИНСТВЕННОЕ АРХИТЕКТУРНОЕ ОГРАНИЧЕНИЕ (не нарушать!)

Скелет остаётся ОДИН — TextNavSidebar. НИКАКОГО второго компонента и НИКАКОГО ветвления
JSX-структуры по persisted-теме (это вернёт hydration 2.8). Иконки рендерятся ВСЕГДА в DOM;
aura прячет их CSS-ом: `.t-aura .nav-ico { display: none; }`. Разница тем = CSS-кожа.

## РАЗВЕДКА

```bash
# Эталонные исходники (всё уже в git-истории):
git show 313d512^:src/components/layout/Sidebar.tsx        # структура item, NavBadge, logo, indicator
git show 313d512^:src/app/globals.css | grep -n -B2 -A12 "\.t-washi \.nav\|\.t-fuji \.nav\|sidebar-indicator\|\.t-washi aside\|\.t-fuji aside" | head -120
# Текущее состояние:
cat src/components/layout/TextNavSidebar.tsx
grep -n "nav-item\|nav-active\|sidebar" src/app/globals.css | head -30
```

## ЗАДАЧА 1: иконки в TextNavSidebar (все темы, aura скрывает)

- В nav-конфиг добавить `icon` из старого Sidebar (Sun/LayoutDashboard/CheckSquare/Target/
  FolderKanban/Rocket/Users/Building2/Phone/CalendarDays×2/BarChart3/Settings) + `sectionColor`.
- Разметка item: `<item.icon size={20} className="nav-ico shrink-0 …" />` перед лейблом,
  gap-3, px-3 py-2, `text-sm` (вернуть 14px как в старом; сейчас мельче — привести).
- `.t-aura .nav-ico { display:none }` — aura без иконок, как сейчас.
- Логотип: TC-квадрат `bg-accent text-white rounded-md h-8 w-8` + «Torii CRM» для НЕ-aura
  (уже есть текст — добавить акцентный квадрат; в washi акцент красный — вернётся сам).
  Для aura — текущий вид без изменений.

## ЗАДАЧА 2: NavBadge (красные плашки цифр)

Перенести `NavBadge` из `313d512^:src/components/layout/Sidebar.tsx` (компонент с count/urgent —
красная плашка при urgent, accent при обычном; сверь точный вид по исходнику). Подключить к
badgeKey ('tasks'/'leads'/'calls') как в старом MAIN_NAV. В aura — тот же бейдж (на скринах
aura цифра «5» тоже была в красной плашке — сверить по эталону Олега; если в aura был свой вид,
оставить текущий aura-вид через CSS-модификатор).

## ЗАДАЧА 3: вернуть живые nav-CSS правила тем (НЕ header!)

Из `313d512^:src/app/globals.css` вытащить и вернуть правила, таргетившие СТАРЫЙ сайдбар
(aside/nav-item/nav-active/sidebar-токены) для washi и fuji: фоны aside, цвета пунктов
(яркость/дим), hover (светлый текст на тёмном фоне — фикс бага 1), nav-active, sidebar-indicator.
⚠️ Header-правила (`.t-<theme> header`) НЕ возвращать — их снос (3ffbcac) был правильным.
⚠️ Селекторы адаптировать к разметке TextNavSidebar (klass nav-item/nav-active навесить на Link,
data-active уже есть — сверь).
Для frost/aurora/tidal: старый Sidebar красился их токенами (bg-surface/text-dim) — проверить
живьём, что hover/active читаемы; при необходимости добавить аналогичные правила.

## ЗАДАЧА 4: washi scramble сохранить

WashiNavLabel/useTextScramble уже перенесены — не сломать: иероглиф + иконка + бейдж в одном
item. Проверить взаимодействие scramble с hover-фиксом (цвет по восстановленным правилам).

## Верификация (гейт Cowork + скрины Олега как эталон)

1. tsc/build/vitest/contrast-audit зелёные.
2. Live все 6 тем: aura — текстовый нав БЕЗ иконок (не изменился); washi — иконки + иероглифы +
   scramble на hover + красный TC + красные плашки + hover НЕ чёрный; fuji/frost/aurora/tidal —
   иконки + русские лейблы + читаемый hover/active.
3. Консоль: 0 hydration-warnings (иконки в DOM всегда — ветвления нет).
4. Сравнение с прод-Netlify (старый вид) по скринам тем.

## КОММИТ
```
fix(themes): icon-nav для всех тем кроме aura — иконки/NavBadge/лого-акцент/живые nav-CSS washi+fuji возвращены в единый TextNavSidebar (C7, регресс C6)
```
