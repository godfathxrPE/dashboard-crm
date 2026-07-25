# Claude Code Prompt — Sprint S-CHAT-1.1: чат-редизайн «Telegram-lite» (v2, после ревью Grok 7.5)

**Пузыри своё/чужое + время/дата + инверсия глубины. Клиентский спринт: `ProjectChat.tsx` + точечный `globals.css`. Хук/RLS/realtime НЕ трогать.**

> **v2:** B1 — база ветки автодетектом (Grok видел main без чата — возможно нестянутый локальный main); W2 — `group-focus-within` вместо focus-visible на child (opacity родителя перемножается!); W3 — вчера через MSK; W4 — критерий анимации `id ∉ seen && !mine && !temp`; W5 — у composer только placeholder (label нет); W8 — smooth только на новое; W9 — точечный `git add`.
> Цвета зафиксированы аудитом color-architect (`contrast.py`, 6 тем) — НЕ менять.

## Контекст
- Чат S-CHAT-1 (067 + `ProjectChat.tsx` ~282 + `use-project-messages`) живёт на **`feat/chat` @ 8d3647f** и, возможно, уже в `origin/main` (мёрж Олега). База ветки — автодетект в РАЗВЕДКЕ.
- 6 тем CSS-переменных (aura/washi/fuji светлые; frost/aurora/tidal dark-glass), все `--bg` solid.

## 🎨 ЦВЕТА — ЗАФИКСИРОВАНЫ АУДИТОМ (не заменять)
1. **Текст сообщений в ОБОИХ пузырях = `var(--text)`** (`text-text-main`; 10.5–14.4:1). Смена текущего `text-text-dim` (L221) на `--text` — осознанная (контраст-апгрейд, не регрессия). ⚠️ НЕ `var(--accent-text)`: токена НЕТ в t-tidal/t-fuji, в washi 4.67 впритык.
2. **Свой пузырь**: `background: var(--accent-l)`, без бордера (различимость от полотна 1.13–1.23).
3. **Чужой пузырь**: `background: var(--surface)` + `border: 1px solid var(--border)` (+опц. `var(--shadow-xs)` на светлых). ⚠️ НЕ `--surface2/3` (1.03–1.09 к полотну — невидимы на 4 темах).
4. **Время**: `color: var(--chat-time, var(--text-dim))`; в `globals.css`: `.t-aura .chat-own { --chat-time: var(--text); }` (fail 4.23 только там; прецедент — `--aura-pill-text`).
5. Новых глобальных токенов НЕ вводить, hex НЕ хардкодить.

## 🧱 ДИЗАЙН (Telegram-lite, три слоя)
- **Инверсия глубины:** лента на `background: var(--bg)` (inset, `var(--radius-m)`, высота `min(55vh, 40rem)`, `overflow-y-auto`), пузыри поверх, composer вне скролла на `var(--surface)`.
- **Пузыри:** `max-width: 72%`; чужие слева (аватар+имя на первом в группе), свои справа (без шапки). Скругление `var(--radius-m)`, «хвостик» — меньший радиус в углу к автору на последнем в группе. Классы `chat-own`/`chat-other`.
- **Время у каждого:** `ЧЧ:ММ` в правом нижнем углу пузыря (11px, `tabular-nums`), формат `Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'})`; полная дата в `title`; после времени «изм.» при `edited_at`. `relativeTime` из ленты убрать (L16 import, L183) — в `activity-events.ts` и других компонентах НЕ трогать.
- **День-разделители:** центрированный чип «Сегодня»/«Вчера»/«15 июля» (`var(--surface2)` фон, `var(--text-mute)`, 11px), обычный текст в потоке (НЕ aria-hidden). **W3 — только MSK:** `const todayKey = mskDateKey(new Date())`; `вчера` = календарный день −1 **от MSK-ключа** (разобрать `todayKey` и вычесть день через UTC-полдень, как бакеты Ганта), НЕ `isYesterday`/browser-local.
- **Группировка:** один автор, разница ≤5 мин → шапка у первого, дальше компакт (2px внутри группы, 12px между).

## ♿ A11y
- Лента: `role="log"` + `aria-live="polite"`, `aria-label="Чат проекта"`.
- **W2 — hover-иконки правки/удаления:** контейнер иконок сейчас `opacity-0 group-hover:opacity-100` (L225). Добавить **`group-focus-within:opacity-100`** на ТОТ ЖЕ контейнер (opacity родителя перемножается — focus-visible на кнопке внутри невидимого контейнера НЕ работает; паттерн `tr:focus-within` в globals). На кнопках — обычный focus-ring.
- **W5 — composer:** сейчас только `placeholder` (L264), label НЕТ. Плейсхолдер сократить до «Сообщение команде…», хинт «Enter — отправить, Shift+Enter — перенос» → в `title` + `aria-label` textarea.

## 🎬 Анимация
- **W4 — критерий:** анимировать ТОЛЬКО `id ∉ seenIds && !isMine && !isTemp` и только ПОСЛЕ первого non-loading рендера (`seenIds` наполняется на первом рендере целиком — иначе стробоскоп на 50 сообщениях). Своё сообщение не анимировать (optimistic и так мгновенный).
- Рецепт: **reuse `animate-appear`** (globals ~698–712, opacity+translateY уже с reduced-motion) — если подходит, новых keyframes НЕ писать; иначе минимальный `.chat-msg-enter` + `@media (prefers-reduced-motion: reduce)` (это допустимое расширение globals-скоупа, W1).
- **W8 — автоскролл:** сейчас мгновенный (`scrollTop=`, L85, порог 80). Smooth — ТОЛЬКО при новом входящем и без reduced-motion (`matchMedia('(prefers-reduced-motion: reduce)')`); initial load — мгновенный как сейчас.

## РАЗВЕДКА (ПЕРЕД правками) — B1: автодетект базы
```bash
cd ~/Downloads/dashboard-crm && git fetch origin
# где живёт чат:
git log origin/main --oneline -5 | grep -iE "chat|8d3647f" && BASE=origin/main || BASE=feat/chat
echo "BASE=$BASE"   # если чат смёржен в origin/main — база main; иначе feat/chat (НЕ голый локальный main — там файла может не быть)
git switch -c feat/chat-ui "$BASE"

grep -n "relativeTime\|whitespace-pre-wrap\|opacity-0 group-hover\|scrollTop\|placeholder" src/components/projects/ProjectChat.tsx | head
grep -n "mskDateKey" src/lib/utils/date-helpers.ts
grep -n "animate-appear" src/app/globals.css | head -3
grep -n "aura-pill-text" src/app/globals.css | head -2   # прецедент aura-оверрайда
```

## ЗАДАЧА 1 — Слои + пузыри  [риск: средний]
Полотно `--bg` (inset/radius/высота/скролл) → группы → пузыри `chat-own`/`chat-other` строго по цвет-блоку. Composer вне скролла на `--surface`. Сохранить: send/edit/delete/confirm/toast/optimistic, автоскролл-механику, XSS-контур.
**Verification:** `npx tsc --noEmit`; dev-взгляд на aura + frost.

## ЗАДАЧА 2 — Время + день-чипы + группировка  [риск: средний]
По блокам выше (время/Intl-MSK, чипы/mskDateKey c W3-формулой вчера, группировка ≤5 мин, снять relativeTime из ленты). Aura-оверрайд `--chat-time` в globals с комментом.
**Verification:** `npx tsc --noEmit`; сообщение «вчера 23:50 МСК» — под чипом «Вчера» (не «Сегодня»).

## ЗАДАЧА 3 — A11y + анимация  [риск: низкий]
role/aria-live; **group-focus-within** на action-контейнер (проверить Tab'ом!); placeholder+title; анимация по W4-критерию (reuse animate-appear) + W8-скролл.
**Verification:**
```bash
npx tsc --noEmit && npm run build   # НЕ при живом dev
```
Смок: две вкладки — входящее анимируется и озвучивается (aria-live); **Tab доводит до иконок правки и они ВИДИМЫ** (W2); reduced-motion → без анимаций и smooth; 6 тем — пузыри различимы, aura-own время читается, glass — чужой пузырь виден бордером; первичная загрузка ленты — без стробоскопа.

### КОММИТ (W9 — точечный add, в workspace грязь)
```bash
npx tsc --noEmit && npm run build && \
git add src/components/projects/ProjectChat.tsx src/app/globals.css && \
git commit -m "feat(chat): telegram-lite UI — пузыри, время+день-чипы (MSK), инверсия глубины, aria-live, focus-within, reduced-motion" && \
git push -u origin feat/chat-ui
```

## Для гейта Cowork
Миграций нет. Chrome-смок 6 тем + Tab-доступ иконок + aria-live. Мёрж: если BASE был `feat/chat` — PR в него/в main по состоянию веток (сказать в отчёте, какой BASE выбран!).

## Не выходить за скоуп
`ProjectChat.tsx` + точечные строки `globals.css` (aura-оверрайд + опц. enter-анимация). НЕ трогать: `use-project-messages` (хук/realtime/optimistic), RLS, unread (F1.2), треды/вложения, `relativeTime` вне чата, порог автоскролла.
