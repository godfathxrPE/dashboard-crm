# Ревью: Sprint S-CHAT-1.2 — контраст своих пузырей + эмодзи-пикер

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/chat-ui` @ `6e134b2`, live-grep/read)  
**Объект:** `_analysis/sprint-S-CHAT-1.2.md` — client-only: `--chat-own-*` токены (6 тем) + hand-rolled emoji picker в composer  
**Контекст:** S-CHAT-1 (067 + hook) + S-CHAT-1.1 (telegram-lite UI) уже в `feat/chat-ui` (`6e134b2`). Handoff: `_analysis/handoff chat s chat 1.2.md`. Реакции → S-CHAT-2 (отдельно).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (пути/символы) | ✅ якоря сходятся; 🟡 мелкий drift (`shadow-xs` vs `shadow-[var(--shadow-xs)]`, `--chat-time` не в theme-блоках) |
| Scope: client-only, без миграции | ✅ |
| Схема / RLS / hook | ✅ out-of-scope; `project_messages` (067) есть; `message_reactions` нет |
| Токены 6 тем + fuji red identity | ✅ значения согласованы с accent RGB; fuji red осознанно |
| Placement «рядом с `--chat-time`» | 🟡 **W1** — в theme-блоках `--chat-time` **нет** |
| Composer / maxLength 4000 / XSS | ✅ |
| Пикер: portal / useAnchoredRect | ✅ паттерн живой (`Combobox`/`AssigneeSelect`, zIndex 1100) |
| Constants path | ✅ `src/lib/constants/` (`ai-presets.ts`, `reconnect.ts`) |
| Housekeeping (spawn-wizard / tsconfig) | 🟡 **W2** — грязь в дереве реальна |
| crm-architect checklist | ✅ (SQL N/A; CSS vars; без `flowType`) |

**Оценка: 8.5/10.** Узкий, хорошо отграниченный client-only спринт; live-код совпадает с claims.  
**Рекомендация:** **GO for CC** после housekeeping (W2) и явной заметки по placement токенов (W1). Жёстких блокеров нет — разведка сама ловит W1.

---

## Статус (живой код)

| Заход | Факт в репо |
|-------|-------------|
| Ветка | `feat/chat-ui` → `origin/feat/chat-ui` @ `6e134b2` |
| S-CHAT-1.1 (telegram-lite) | ✅ закоммичен: `ProjectChat.tsx` + aura `--chat-time` |
| `ProjectChat.tsx` | ✅ 420 строк; таб в `ProjectDetail.tsx:893` |
| Свой пузырь | ✅ L342: `chat-own … bg-accent-l`, **без** border; `rounded-br-[4px]` на `groupEnd` |
| Чужой пузырь | ✅ L364: `chat-other … border border-border bg-surface shadow-[var(--shadow-xs)]` |
| Composer | ✅ L391–416: `draft`/`setDraft`, `maxLength={4000}`, Enter/Shift+Enter; **нет** `textareaRef` / `selectionStart` |
| Комментарий «аудит — не менять» | ✅ L97–99 (не ~96–98, drift 1 строка) |
| `--chat-time` | ✅ **только** `globals.css:1557` — `.t-aura .chat-own { --chat-time: var(--text); }` |
| `--chat-own-bg` / `--chat-own-border` | ❌ ещё нет |
| `.t-fuji .bg-accent-l` | ✅ L555: `rgba(194,59,59,0.10)` (красный override) |
| `ChatEmojiPicker.tsx` / `chat-emoji.ts` | ❌ ещё нет (новые файлы) |
| `useAnchoredRect` | ✅ `src/lib/hooks/use-anchored-rect.ts`; portal zIndex **1100** |
| Overflow composer | Composer **вне** скролла ленты (`overflow-y-auto` только L222); portal всё равно уместен (вложенность/viewport) |
| Dirty tree | `M tests/unit/spawn-wizard.test.tsx`, `M tsconfig.json` (+ куча `_analysis/*` untracked) |
| `scripts/contrast.py` | ❌ нет; есть `scripts/audit-contrast.py` |
| schema `message_reactions` | ❌ нет (S-CHAT-2) |
| architecture.md ProjectChat | ✅ секция S-CHAT-1; пикер пока не упомянут (не блокер) |

---

## С чем согласен полностью

### 1. Scope и границы
Только визуал своего пузыря + emoji в composer. **Не** реакции / unread / треды / вложения / упоминания. Миграций нет → client-флоу. S-CHAT-2 (`message_reactions` + RLS + realtime) правильно вынесен; номер миграции — сверять по живой БД, не из handoff («068»).

### 2. Почему отдельные `--chat-own-*`, а не bump `--accent-l`
`bg-accent-l` — общая утилита: аватар в чате (L84), таблицы, кнопки. Fuji уже hard-override (L555). Отдельные chat-токены не ломают остальной UI и фиксируют fuji-red identity пузыря (тема accent fuji — синий `#2B5078`, пузырь исторически красный через override).

### 3. Матрица токенов (sanity vs theme RGB)
| тема | accent RGB в CSS | proposed own-bg/border | |
|------|------------------|------------------------|--|
| aura | 72,77,87 | 0.16 / 0.28 | ✅ |
| washi | 194,59,59 | 0.22 / 0.34 | ✅ |
| fuji | red identity (override), не accent blue | 0.20 / 0.34 red | ✅ |
| frost | 91,138,255 | 0.30 / 0.55 | ✅ |
| aurora | 160,96,255 | 0.30 / 0.55 | ✅ |
| tidal | 72,184,144 | 0.28 / 0.55 | ✅ |

Числа contrast.py в промпте не пересчитывались здесь — принимаем как audit-locked; на гейте — визуальный смок 6 тем.

### 4. Класс своего пузыря
Было: `bg-accent-l` (L342). Стало: `bg-[var(--chat-own-bg)] border border-[color:var(--chat-own-border)]` — корректный Tailwind-arbitrary. Чужой и `text-text-main` не трогать — верно (XSS/readability locked).

### 5. Эмодзи-пикер — архитектура
- Константы в `src/lib/constants/chat-emoji.ts` — по конвенции.
- Компонент `src/components/projects/ChatEmojiPicker.tsx` — по фиче-папке.
- Триггер Lucide `Smile` (export есть) + эмодзи как user content — конвенция «no emoji in UI chrome» не нарушается.
- Вставка в caret + clamp 4000 + `requestAnimationFrame`/`setSelectionRange` — здравый UX-контракт.
- XSS: body остаётся текстом + `whitespace-pre-wrap` — не трогать.

### 6. crm-architect (клиент)
- РАЗВЕДКА есть и должна гоняться до правок.
- SQL/RLS/SECURITY DEFINER — N/A.
- CSS: только variables, scoped к `.t-*`.
- schema.md обновлять не нужно.
- DELETE/CASCADE — N/A.
- Коммит-список точечный (4 файла), без hook/types/migrations.

---

## Блокеры (критично — исправить до запуска)

**Нет.** Нет ложных путей, ложных таблиц, «main already has chat»-лжи (как в S-CHAT-1.1 B1). База `feat/chat-ui` с живым `ProjectChat` — ок.

---

## Предупреждения (желательно исправить / учесть в CC)

### W1. Placement «рядом с `--chat-time` в 6 theme-блоках» — факт расходится

**Claim спринта:** `--chat-time` лежит в `.t-aura {}`, `.t-washi {}`, …  
**Факт:**

```
globals.css:1557  .t-aura .chat-own { --chat-time: var(--text); }
```

В блоках `.t-frost` / `.t-aurora` / `.t-tidal` / `.t-aura` / `.t-washi` / `.t-fuji` переменной `--chat-time` **нет**. Дефолт времени — fallback в JSX: `var(--chat-time, var(--text-dim))` (ProjectChat L261).

**Что делать CC (не вслепую):**
1. Добавить `--chat-own-bg` / `--chat-own-border` **в каждый из 6** `.t-* { … }` (рядом с `--accent-l` / в конце theme-блока) — это и есть правильный образец «theme tokens».
2. **Либо** scoped: `.t-frost .chat-own { --chat-own-bg: …; --chat-own-border: …; }` рядом с секцией «Чат проекта (S-CHAT-1.1)» (~L1553) — тоже валидно.
3. **Не** искать `--chat-time` внутри theme-блоков как якорь вставки.

РАЗВЕДКА п.4 уже покажет одну строку — промпт говорит «доложи расхождение»; этого достаточно, если CC не игнорирует.

### W2. Housekeeping до коммита спринта

| Файл | Факт |
|------|------|
| `tests/unit/spawn-wizard.test.tsx` | `M`: null→undefined под regen-типы `2fe8806` — как в промпте |
| `tsconfig.json` | `M`: не только pretty-print — в `include` добавлен `.next-build/types/**/*.ts`, переставлен `next-env.d.ts` |

**Действия (как в промпте, усилить):**
1. Отдельным коммитом: spawn-wizard test (`npx vitest run spawn-wizard`).
2. `tsconfig.json`: решить **до** sprint-commit — откатить (если accidental format) или закоммитить отдельно с понятным why. **Не** мешать в `feat(chat): … S-CHAT-1.2`.
3. `git add` только 4 файла из секции КОММИТ — не `git add -A`.

### W3. Имя скрипта контраста
Промпт/VERIFICATION: `contrast.py`. В репо: `scripts/audit-contrast.py` (+ `audit-contrast-results.json`). Косметика для комментария/доков; на реализацию не влияет.

### W4. РАЗВЕДКА: `shadow-xs` vs факт
Ожидание «`shadow-xs`» — в коде чужого пузыря `shadow-[var(--shadow-xs)]` (L364). Не менять чужой пузырь.

### W5. Поповер: composer вне overflow ленты, но portal всё равно предпочтителен
Лента — `overflow-y-auto` (L222); composer — соседний flex-ряд (L390). Клип лентой **маловероятен** для absolute вверх. Клип/выход за viewport виджета/peek/страницы — реален → **prefer** `useAnchoredRect` + `createPortal` + `zIndex: 1100` (как Combobox), а не только `z-50` absolute внутри card. Промпт это допускает — зафиксировать как default path для CC.

### W6. A11y сетки эмодзи — объём недоспецифицирован
«Стрелки + Enter, focus management» без roving `tabIndex` / `aria-activedescendant` / role=grid — CC может сделать «минимально» или «полно». Для гейта: минимум Esc/outside/pick + возврат фокуса в textarea; стрелки — желательно. Focus-trap не обязателен — ок.

### W7. Категории эмодзи «…по вкусу»
Шаблон 5 категорий + «добавь ещё». Риск расхождения UI. **Правка в спринт (опц.):** зафиксировать 8 категорий и списки, либо «ровно 5 — достаточно для MVP».

### W8. architecture.md (косметика post-merge)
После спринта можно одной строкой: `ChatEmojiPicker` + chat-own tokens. Не блокер для CC.

### W9. Скрипт/комментарий «36/36 contrast.py»
Не верифицировалось в этой сессии. Визуальный смок 6 тем на гейте Cowork — обязателен (уже в промпте).

---

## Пропущенные места (grep)

| Файл | Строки / факт | Действие |
|------|----------------|----------|
| `src/components/projects/ProjectChat.tsx` | L84 avatar `bg-accent-l` | **Не трогать** (утилита) |
| `src/components/projects/ProjectChat.tsx` | L342 own bubble | Заменить fill + border |
| `src/components/projects/ProjectChat.tsx` | L364 other | Не трогать |
| `src/components/projects/ProjectChat.tsx` | L90–99 file comment | Переписать (шаг 1.3) |
| `src/components/projects/ProjectChat.tsx` | L391–407 composer textarea | +ref, selection tracking, Smile trigger, picker |
| `src/components/projects/ProjectChat.tsx` | L293 edit textarea | **Не** вешать пикер (scope = composer) |
| `src/app/globals.css` | 6× `.t-*` blocks + L1553 chat section | +`--chat-own-bg/border` (см. W1) |
| `src/app/globals.css` | L555 fuji `.bg-accent-l` | **Не трогать** |
| `src/lib/hooks/use-project-messages.ts` | — | **Не трогать** |
| `src/components/projects/index.ts` | ProjectChat не экспортируется | Ок; ChatEmojiPicker private import |

Ложных «лишних» мест для `bg-accent-l` в chat-context, которые спринт обязан менять, нет.

---

## Чеклист crm-architect (condensed)

- [x] РАЗВЕДКА перед правками  
- [x] Реальные таблицы: N/A (client-only); `project_messages` существует в schema  
- [x] Реальные пути: `ProjectChat.tsx`, `globals.css`, `src/lib/constants/`, `use-anchored-rect`  
- [x] learnings: CSS variables / theme scope; без `flowType`; без client DELETE cleanup  
- [x] Миграции: нет → CC не apply  
- [x] org_id/RLS: N/A  
- [x] SECURITY DEFINER: N/A  
- [x] schema.md update: N/A  

---

## Предлагаемые правки в спринт (опционально, не блокируют GO)

1. **W1:** заменить «рядом с `--chat-time` в theme-блоках» на:  
   «добавить `--chat-own-bg`/`--chat-own-border` в каждый `.t-* { }` (якорь: рядом с `--accent-l`); `--chat-time` живёт только как `.t-aura .chat-own` override — не путать».
2. **W2:** явно `git add` только 4 файла; spawn-wizard + tsconfig — отдельные коммиты/решение.
3. **W3:** `audit-contrast.py` в комментарии вместо `contrast.py`.
4. **W5:** default path = portal + `useAnchoredRect` + zIndex 1100.
5. **W7:** зафиксировать N категорий эмодзи.

---

## Чеклист перед CC

- [ ] `git status -sb` на `feat/chat-ui` (или свежая ветка `feat/chat-1-2` от неё)  
- [ ] Housekeeping: spawn-wizard test commit; tsconfig — revert/keep отдельно  
- [ ] Прогнать РАЗВЕДКУ; placement токенов по **W1**, не по устаревшему «рядом с chat-time в блоке»  
- [ ] 6 тем: `--chat-own-bg` + `--chat-own-border`; fuji = red  
- [ ] Own bubble: tokens + border; other + text **не** трогать  
- [ ] Comment L97–99 переписать (разделить bubble separation vs text audit)  
- [ ] `chat-emoji.ts` + `ChatEmojiPicker.tsx` + Smile в composer  
- [ ] Caret insert + maxLength 4000 + focus return  
- [ ] Portal/fixed + Esc/outside/pick; stale closure через ref  
- [ ] `rm -rf .next` → `npx tsc --noEmit` → `npm run build` (не при живом dev)  
- [ ] Визуальный смок: 6 тем, fuji red, dark contrast, picker clamp  
- [ ] Commit только: `ProjectChat.tsx`, `ChatEmojiPicker.tsx`, `chat-emoji.ts`, `globals.css`  

---

## Итог

Сильный узкий UI-спринт поверх уже смёрженного S-CHAT-1.1 на `feat/chat-ui`. Claims по пузырям, composer (4000), fuji override, constants path, portal-паттерну и scope — подтверждены live-кодом. Единственный содержательный drift — **якорь вставки chat-токенов** (W1); он закрывается разведкой, не требует переписывать задачу. Housekeeping dirty tree (W2) — обязателен до sprint-commit, чтобы не утащить `tsconfig`/spawn-wizard в chat-коммит.

**GO for Claude Code** (после W2 housekeeping; W1 держать в голове при правке `globals.css`).
