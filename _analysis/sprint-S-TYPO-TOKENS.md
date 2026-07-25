# Claude Code — S-TYPO-TOKENS: семантические fontSize-токены (аудит F-02)

**База:** ветку `feat/typo-tokens` от `main` (`c4c7ed0`). **Client-only, миграций нет.** 7 тем.
**Решение развилки:** **13a** — узаконить 13px примитивов отдельным токеном, 0 визуального сдвига.

---

## ПОЧЕМУ ТАК (контекст — прочитай до кода)

`fontSize` в конфиге НЕ задан → вся типографика на дефолтной Tailwind-шкале + arbitrary. В диапазоне 10–14px пять размеров (10/11/12/13/14), из них два — arbitrary без имени:
- `text-[11px]` ×84 — мета/подписи (в px → не масштабируется от системного шрифта, a11y-минус).
- `text-[13px]` + `text-[0.8125rem]` ×27 — осознанный body примитивов (Card/Table/Button/Input + ProjectDetail и др.).

Массовые `text-xs` (12px, **690×**) и `text-sm` (14px, **302×**) — де-факто body/second, **НЕ трогаем** (blast 1000+, ломает рабочее). Консолидируем только два arbitrary-размера в именованные rem-токены.

**Токены задаём ТОЛЬКО font-size, без lineHeight.** Причина: `text-[11px]` сейчас задаёт лишь размер, line-height наследуется. Токен с `lineHeight` изменил бы вертикальную метрику в 84 местах = визуальный сдвиг. 13a выбран ради 0 сдвига → lineHeight не задаём (типографический leading — отдельный осознанный проход со смоком вертикалей).

### ⚠️ ГРАБЛЯ (критично) — тема-оверрайды таргетят класс `.text-[11px]`

В `globals.css` есть a11y-контраст-фиксы, привязанные к самому классу:
```
275: .t-washi aside .text-\[11px\] { color: rgba(232,226,216,0.62) !important; }
460: .t-fuji  aside .text-\[11px\] { color: rgba(232,219,191,0.62) !important; }
```
Это подъём контраста нав-подписей сайдбара (3.9:1 → 5.16:1, WCAG). Переименование `text-[11px]` → `text-meta` в `TextNavSidebar.tsx` **обязано** сопровождаться правкой этих селекторов, иначе контраст молча откатится к fail. **Синхронно** (Задача 2b).

Прямые `font-size: 11px/13px/0.8125rem` в globals (стр. 569, 592, 1391) — это CSS-значения, НЕ Tailwind-классы, переименованием не ломаются → НЕ трогаем (вне scope).

---

## РАЗВЕДКА (выполни ПЕРВОЙ)

```
git checkout main && git pull --ff-only && git checkout -b feat/typo-tokens

grep -rc 'text-\[11px\]' src --include=*.tsx        # 84
grep -rcE 'text-\[(13px|0\.8125rem)\]' src --include=*.tsx  # 27
grep -rc 'text-\[10px\]' src --include=*.tsx         # 5 — НЕ трогаем (badge)
grep -rhoE '[a-z-]+:text-\[11px\]' src --include=*.tsx   # ожидаем пусто (нет hover:/md: модификаторов)
grep -nE 'text-\\\[11px\\\]' src/app/globals.css      # стр 275, 460 — селекторы под правку 2b
grep -nE 'fontFamily|fontSize' tailwind.config.ts     # fontSize отсутствует — вставляем
```

Если модификаторы на `text-[11px]` найдутся (не пусто) — стоп, сверься со мной (нужна форма `mod:text-meta`).

---

## ЗАДАЧА 1 — fontSize-токены в конфиг (ПЕРВОЙ, иначе классы не сгенерятся)

`tailwind.config.ts`, в `theme.extend` (рядом с `fontFamily`), добавь:
```ts
fontSize: {
  // Семантические токены мелкого текста (rem, a11y-scalable). Только размер —
  // lineHeight намеренно не задан (сохранить текущее наследование, 0 сдвига).
  meta: '0.6875rem',   // 11px — подписи, мета, второстепенное
  body: '0.8125rem',   // 13px — осознанный body примитивов (Card/Table/Button/Input)
},
```
`extend` deep-мержится с дефолтом → `text-xs/sm/base/...` остаются. Добавляются `text-meta`, `text-body`.

---

## ЗАДАЧА 2 — `text-[11px]` → `text-meta` (84 места)

### 2a. tsx (84×)
Каждое голое `text-[11px]` → `text-meta`. Значение идентично (11px), 0 сдвига, выигрыш a11y (px→rem).

### 2b. ⚠️ globals.css СИНХРОННО (2 селектора)
```
.t-washi aside .text-\[11px\]  →  .t-washi aside .text-meta
.t-fuji  aside .text-\[11px\]  →  .t-fuji  aside .text-meta
```
(строки ~275, ~460). Без этого контраст нав-подписей washi/fuji откатится к WCAG-fail. Значения/цвета не меняем — только имя класса в селекторе.

---

## ЗАДАЧА 3 — `text-[13px]` / `text-[0.8125rem]` → `text-body` (27 мест)

Обе формы (13px и 0.8125rem) → `text-body`. Значение идентично (13px), 0 сдвига. Места:
`ui/Card.tsx:60` · `ui/Table.tsx:14` · `ui/Button.tsx:19` · `ui/Input.tsx:12` · `tasks/TaskCard.tsx:120` · `tasks/ProjectBoard.tsx:445` · `layout/TextNavSidebar.tsx:182` · `projects/ProjectDetail.tsx` (×9: 668/706/717/729/737/753/801/836/847/1025) · `projects/ProjectTeam.tsx:94` · `projects/PipelineBoard.tsx:731` · `projects/DealFocusPanel.tsx:81,119` · `projects/StageReadiness.tsx:75` · `projects/DeliveryCompletionModal.tsx:36,126,141` · `contacts/ContactDetailHub.tsx:81,419`

**Два нюанса (Grok W1/W2 — подтверждено по коду):**
- `ContactDetailHub.tsx:419` — форма с модификатором: `placeholder:text-[0.8125rem]` → `placeholder:text-body`. Подстрочная замена `text-[0.8125rem]` → `text-body` внутри строки даёт это сама. В той же строке есть `text-sm` (размер textarea) — **НЕ трогать**, это массив.
- Заменяй **только size-класс**. Соседние `leading-*` оставляй (напр. `TaskCard.tsx:120` = `text-[0.8125rem] leading-[1.4]` → `text-body leading-[1.4]`; токен lineHeight не задаёт, `leading-[1.4]` продолжает работать).

### НЕ ТРОГАТЬ
`text-[10px]` (badge ×5) · `text-xs` (690×) · `text-sm` (302×) · прямые `font-size` в globals (569/592/1391).

---

## СМОК / VERIFICATION (обязательно перед коммитом)

```
npx tsc --noEmit                                    # 0 ошибок
grep -rn 'text-\[11px\]' src --include=*.tsx         # → 0
grep -rnE 'text-\[(13px|0\.8125rem)\]' src --include=*.tsx  # → 0
grep -nE 'text-\\\[11px\\\]' src/app/globals.css      # → 0 (селекторы переименованы)
grep -rn 'text-meta\|text-body' src --include=*.tsx | wc -l   # ~111
rm -rf .next
```

Live-смок (dev, 7 тем, вернуть aura):
- **⚠️ washi + fuji сайдбар** (грабля): нав-подписи `text-meta` — контраст НЕ должен откатиться (тёплый приглушённый, читаемый, не бледный). Это главная проверка спринта.
- **Примитивы `text-body`** (Card/Button/Input/Table): размер прежний (13px), 0 сдвига — сравни визуально с текущим.
- **Мета-текст `text-meta`**: подписи/второстепенное — размер прежний (11px).
- Общий проход: `/deals`, `/tasks`, `/overview`, карточка сделки — текст не «прыгнул», вертикальная метрика цела (lineHeight наследуется как раньше).

---

## VERIFICATION LABELS

```
Type Safety:            NOT_VERIFIED (прогони tsc — ожидаем PASS)
Backward Compatibility: WARNING (0 визуального сдвига по замыслу — но подтвердить смоком, ОСОБО washi/fuji контраст после globals-правки)
RLS Coverage:           NOT_APPLICABLE (client-only)
Runtime Tested:         NOT_VERIFIED (смок обязателен)
Regional Availability:  NOT_APPLICABLE
```

---

## КОММИТ

**Селективный стейдж (НЕ `git add -A`** — в дереве грязь `_analysis/`, `.grok/`, `scripts/audit-contrast-results.json`, не относящаяся к спринту):
```
git add tailwind.config.ts src/app/globals.css
git add $(rg -l 'text-\[11px\]|text-\[13px\]|text-\[0\.8125rem\]' -g '*.tsx' src)
git commit -m "refactor(tokens): семантические fontSize text-meta/body — консолидация text-[11px]×84 + 13px-форм×27 в rem-токены (S-TYPO-TOKENS, аудит F-02, вариант 13a); синхронно globals washi/fuji контраст-селекторы"
git push -u origin feat/typo-tokens
```
Проверь `git status` перед коммитом: в staged только `tailwind.config.ts`, `globals.css` и tsx с заменами (~35 файлов), никаких `_analysis/`/`.grok/`.

Ветку НЕ мёржи — мёрж через гейт Cowork (diff-ревью + live-смок ×7 тем, особо washi/fuji контраст + merge-совет).
