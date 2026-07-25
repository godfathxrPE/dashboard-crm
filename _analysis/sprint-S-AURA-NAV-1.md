# Claude Code Prompt — Sprint S-AURA-NAV-1: сайдбар aura (бренд + типографика) + фикс орбов в таблицах

> **Тип:** client-only, БЕЗ миграции. Пайплайн: промпт → ревью Grok → CC пишет+коммитит+пушит → гейт Cowork (визуальный смок). База: `main` @ ≥ `73f739d`. Ветка: `feat/aura-nav`.
> Контекст: находки аудита aura 2026-07-19 (`_analysis/audit-aura-design.md` / Project `claude/audit-aura-design-2026-07-19.md`) + фидбек Олега по сайдбару.
> Стек неизменен. Цвета — только `var(--token)`. Правки CSS — scoped `.t-aura`, остальные 5 тем НЕ трогать.

---

## WHY

1. **Бренд:** aura — единственная тема с «ОП / Dashboard / БИТ.IIOT» в шапке сайдбара; остальные темы — «TC / Torii CRM». Никакого БИТ.IIOT быть не должно — единый бренд Torii CRM во всех темах.
2. **Типографика нав-пунктов:** aura одевает primary-навигацию в стиль meta-лейбла: `uppercase + letter-spacing 0.12em + 500`. Кириллический капс без выносных элементов теряет силуэты слов, трекинг растягивает «КАЛЕНДАРЬ» — сканирование по буквам вместо распознавания форм. Решение: обычный регистр, трекинг наследуемый. Текстовая безиконная идентичность aura и пилюля активного пункта — сохраняются (они работают).
3. **Орбы сквозь таблицы (аудит F-03, High):** tbody-строки DataTable прозрачны — орбы (alpha 0.14–0.18) подкрашивают данные (на /contacts низ таблицы бирюзовый). Комментарий в коде «орбы не грязнят данные» выполнен только для thead.

## РАЗВЕДКА

```bash
git status -sb && git log --oneline -1   # ждём main @ >= 73f739d

# 1. Бренд-блок (ждём ~L176–195: тернарники isAura 'ОП'/'TC', 'Dashboard'/'Torii CRM', БИТ.IIOT)
grep -n "isAura\|Torii\|БИТ\|Dashboard\|logo-icon" src/components/layout/TextNavSidebar.tsx

# 2. Другие вхождения БИТ.IIOT / Dashboard-бренда по проекту (страгглеры)
grep -rn "БИТ\|BIT.IIOT\|IIOT" src --include="*.tsx" --include="*.ts" | grep -vi "iiot.*pipeline\|direction" | head

# 3. Aura nav-типографика (ждём globals ~L987: uppercase + 0.12em + 500; ~L1000: пилюля 600)
grep -n -A3 "data-nav-item\] > span\|a\[data-active\] > span" src/app/globals.css

# 4. Свёрнутый вертикальный лейбл (ждём TextNavSidebar ~L155: text-[9px] tracking-wider lowercase)
grep -n "nav-vlabel" src/components/layout/TextNavSidebar.tsx src/app/globals.css

# 5. thead-фикс (образец для tbody): ждём .t-aura table thead th { background: var(--surface) }
grep -n -A2 ".t-aura table" src/app/globals.css

# 6. aura logo-icon оверрайды не существуют (есть только .t-fuji .logo-icon) — проверить
grep -n "logo-icon" src/app/globals.css
```

**⚠️ Расхождение с ожиданиями — доложи, не правь вслепую.**

---

## ЗАДАЧА 1 — Единый бренд Torii CRM (TextNavSidebar.tsx, ~L176–195)

Убрать все три isAura-ветвления бренд-блока:

```
// Было:
isAura ? 'h-7 w-7 text-[11px]' : 'h-8 w-8 rounded-md bg-accent text-white text-sm'
style={isAura ? { border: '1px solid var(--border)', borderRadius: '6px' } : undefined}
{isAura ? 'ОП' : 'TC'}
{isAura ? 'Dashboard' : 'Torii CRM'}
{isAura && <div ...>БИТ.IIOT</div>}

// Стало (единая ветка для всех тем):
'h-8 w-8 rounded-md bg-accent text-white text-sm'   // без style-ветки
'TC'
'Torii CRM'
// строка БИТ.IIOT удалена целиком
```

**Почему это сработает в aura без новых стилей:** `.t-aura .bg-accent { background-color: var(--accent-text) !important }` (globals ~L213) — плитка автоматически станет графитовой `#343840` с белым TC (11.8:1). fuji уже имеет свой `.logo-icon`-оверрайд (золотой градиент) — не трогать.

**⚠️** Если разведка п.2 найдёт БИТ.IIOT ещё где-то (metadata, ContentHeader, login) — заменить на Torii CRM там же, доложить списком.

## ЗАДАЧА 2 — Типографика нав-пунктов aura (globals.css, только `.t-aura`-правила)

2.1. Развёрнутый сайдбар (~L987):

```css
/* Было */
.t-aura aside nav a[data-nav-item] > span {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 500;
}
/* Стало — обычный регистр, трекинг наследуется от .t-aura (-0.006em) */
.t-aura aside nav a[data-nav-item] > span {
  font-weight: 500;
}
```

Лейблы в данных уже «Сегодня»/«Обзор»/… (sentence case в MAIN_NAV) — капс давал только CSS, данные не трогать.

2.2. Активная пилюля (~L995–1003) — **НЕ трогать** (фон-пилюля + section-цвет + 600 работают). Проверить визуально, что после снятия капса пилюля не стала тесной — при необходимости `padding-inline` пилюли +2px, больше ничего.

2.3. Свёрнутый вертикальный лейбл (TextNavSidebar ~L155) — микрокегль из аудита F-01:

```
// Было:  className="nav-vlabel text-[9px] tracking-wider lowercase"
// Стало: className="nav-vlabel text-[11px]"
```

(lowercase и tracking-wider снять — тот же принцип, что 2.1; 9px → 11px = минимум meta.) Проверить, что вертикальные лейблы не переполняют свёрнутую ширину `w-14` — если тесно, допустимо `text-[10px]`, но не ниже.

## ЗАДАЧА 3 — Орбы не грязнят данные таблиц (аудит F-03, одна строка)

В aura-секцию globals.css, рядом с существующим `.t-aura table thead th { background: var(--surface); }`:

```css
.t-aura table tbody { background: var(--surface); }
```

**⚠️ Проверить после:** hover-строки (`hover:bg-accent-l`) и selected (`bg-accent-l`) по-прежнему видимы (tr красится поверх tbody-фона); зебры быть не должно — только ровный белый.

---

## ГРАНИЦЫ SCOPE

- Только aura (`.t-aura`-scoped CSS) + бренд-блок TextNavSidebar (общий, но остальные темы получают ровно то, что уже имели). isWashi-ветка лейблов, иконки других тем, `.nav-ico`-скрытие aura — НЕ трогать.
- НЕ канбан-карточки / KPI-цвета / радиусы / тени / типо-шкала — это отдельные спринты по аудиту.

## ПРОВЕРКА

```bash
rm -rf .next
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -8        # не при живом dev
```

**Визуальный смок:** aura — сайдбар развёрнут (обычный регистр, пилюля ок, TC/Torii CRM графитовая плитка) и свёрнут (вертикальные лейблы читаемы, не вылезают); /contacts — таблица ровно белая, hover/selected работают; остальные 5 тем — шапка сайдбара без изменений (TC/Torii CRM как было), fuji-плитка золотая.

## КОММИТ

```bash
git switch -c feat/aura-nav
git add src/components/layout/TextNavSidebar.tsx src/app/globals.css
git commit -m "feat(aura): единый бренд Torii CRM + нав без капса + фикс орбов в tbody (S-AURA-NAV-1, аудит F-03)"
```

## VERIFICATION (сборка промпта, Cowork)

```
Live-code sync:  PASS — бренд-тернарники L176–195, nav-капс globals ~L987, nav-vlabel L155, thead-фикс — сверено по main@73f739d через мост
Дизайн-решение:  капс не сохраняем (родовая болезнь кириллического all-caps в primary-nav), идентичность aura (текст без иконок + пилюля) сохранена
Type Safety:     NOT_VERIFIED (правки тривиальны: строки/классы)
RLS/DB:          NOT_APPLICABLE
Backward Compat: WARNING — бренд-блок общий для 6 тем; смок обязан подтвердить не-aura темы (ожидаемо: ровно прежний вид)
Runtime Tested:  NOT_VERIFIED — смок на гейте
```
