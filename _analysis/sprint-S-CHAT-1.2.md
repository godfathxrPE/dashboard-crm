# Claude Code Prompt — Sprint S-CHAT-1.2: контраст своих пузырей + эмодзи-пикер в composer

> **Тип:** client-only, БЕЗ миграции. Пайплайн: этот промпт → ревью Grok → CC пишет+коммитит+пушит → гейт Cowork (визуальный смок 6 тем) → Vercel.
> **Стек (неизменен):** Next 15 + TS strict + Tailwind + Supabase. Цвета — только `var(--token)`, никаких Tailwind-color-классов и хардкода hex. Radix НЕ в стеке — пикер hand-rolled. Иконки — Lucide.

---

## БАЗА / ВЕТКА (подтверждает Олег до старта)

- Работаем поверх `feat/chat-ui` **или** от свежего `main` (если `feat/chat-ui` уже смёржен). Спроси/сверься — `git status -sb` покажет базу.
- **Housekeeping перед стартом** (грязь в дереве `feat/chat-ui` из handoff):
  - `tests/unit/spawn-wizard.test.tsx` — уже поправлен (null→undefined под regen-типы 2fe8806); закоммитить отдельно, ожидаемо `npx vitest run spawn-wizard` → 204/204.
  - `git diff tsconfig.json` — автор правки неизвестен, посмотреть и решить (откатить/оставить) ДО коммита спринта.
- Ветка спринта: `feat/chat-1-2` (или продолжить на `feat/chat-ui`).

---

## РАЗВЕДКА (сверить живой код ДО правок — номера строк/имена токенов в промпте могли устареть)

```bash
# Ветка и чистота дерева
git status -sb
git log --oneline -3

# 1. Свой/чужой пузырь — текущие классы (ждём: свой = bg-accent-l БЕЗ рамки; чужой = bg-surface + border-border + shadow-xs)
grep -n "bg-accent-l\|bg-surface\|border-border\|shadow-xs\|isOwn\|isMine\|own\|rounded-br" src/components/projects/ProjectChat.tsx

# 2. Composer: textarea, draft-стейт, отправка, лимит
grep -n "textarea\|draft\|setDraft\|selectionStart\|onKeyDown\|maxLength\|whitespace-pre-wrap\|value=" src/components/projects/ProjectChat.tsx

# 3. Устаревший комментарий «цвета зафиксированы аудитом — не менять» (ждём ~стр.96-98)
grep -n "зафиксирован\|не менять\|аудит\|audit" src/components/projects/ProjectChat.tsx

# 4. Существующие chat-токены (образец --chat-time) + куда их класть в theme-блоках
grep -n "\-\-chat-\|chat-time\|chat-own" src/app/globals.css

# 5. fuji-оверрайд утилиты .bg-accent-l (свой пузырь fuji фактически КРАСНЫЙ — не переключать на синий)
grep -n "bg-accent-l" src/app/globals.css

# 6. overflow-предки composer'а и текущие z-index в чате (риск клипа поповера)
grep -n "overflow\|z-\[\|position" src/components/projects/ProjectChat.tsx

# 7. Паттерн порталённого дропдауна (если поповер придётся выносить из-за overflow)
grep -rn "use-anchored-rect\|useAnchoredRect" src/lib/hooks src/components/shared | head
```

**⚠️ Перед правкой:** сверь вывод РАЗВЕДКИ с промптом. Если свой пузырь уже НЕ `bg-accent-l`, имя токена текста иное, или `--chat-time` лежит в другом месте — **доложи расхождение, не правь вслепую**.

---

## ЗАДАЧА 1 — Контраст своих пузырей (Часть A)

**WHY.** В тёмных темах свой↔чужой пузырь сейчас 1.02–1.15 по WCAG (на глаз неотличимы — различает только оттенок), а свой↔фон 1.14–1.23 везде (свой пузырь не отрывается от полотна). У чужого есть рамка+тень, у своего — ничего: конвенция перевёрнута (свой должен быть акцентным). Правим заливкой + **рамкой на своём** (главный фикс — даёт своему контур как у чужого).

**WHAT.** Вводим выделенные chat-токены `--chat-own-bg` / `--chat-own-border` в каждый из 6 theme-блоков `globals.css` (по образцу существующего `--chat-time`), и у своего пузыря в `ProjectChat.tsx` меняем заливку на них + добавляем рамку. `--accent-l`/`--accent-l2` НЕ трогаем — это общая утилита (аватары, кнопки, таблицы), и в fuji `.bg-accent-l` уже hard-overridden.

### Шаг 1.1 — токены в 6 theme-блоков `globals.css`

Для каждой темы добавь две переменные **рядом с `--chat-time`** в её блоке (`.t-aura {}`, `.t-washi {}`, … — куда РАЗВЕДКА п.4 показала `--chat-time`). Точные значения (проверены contrast.py, 36/36):

| тема | `--chat-own-bg` | `--chat-own-border` |
|------|---|---|
| `.t-aura`   | `rgba(72,77,87,0.16)`   | `rgba(72,77,87,0.28)`   |
| `.t-washi`  | `rgba(194,59,59,0.22)`  | `rgba(194,59,59,0.34)`  |
| `.t-fuji`   | `rgba(194,59,59,0.20)`  | `rgba(194,59,59,0.34)`  |
| `.t-frost`  | `rgba(91,138,255,0.30)` | `rgba(91,138,255,0.55)` |
| `.t-aurora` | `rgba(160,96,255,0.30)` | `rgba(160,96,255,0.55)` |
| `.t-tidal`  | `rgba(72,184,144,0.28)` | `rgba(72,184,144,0.55)` |

**⚠️ fuji остаётся тёпло-красным** — это identity темы (её `.bg-accent-l` уже перекрыт на красный ~globals.css:555). НЕ переключай свой пузырь на синий `--accent-l2`. Отдельные chat-токены именно для этого — не задевают прочие `.bg-accent-l` и снимают fuji-путаницу.

### Шаг 1.2 — свой пузырь в `ProjectChat.tsx`

```
// Было (свой пузырь — заливка без рамки):
bg-accent-l

// Стало (заливка выделенным токеном + рамка акцентом):
bg-[var(--chat-own-bg)] border border-[color:var(--chat-own-border)]
```

**⚠️ Проверь углы:** у своего пузыря на `groupEnd` стоит `rounded-br-[4px]` — рамка идёт по border-radius, конфликта быть не должно, но глянь визуально хвост пузыря.
**⚠️ Чужой пузырь НЕ трогаем** (`bg-surface` + `border-border` + `shadow-xs` остаётся).
**⚠️ Текст пузырей НЕ трогаем** (что бы там ни было — `--text-main`/`--text`, читаемость 10:1+, PASS). Меняем только ось разделения пузырей.

### Шаг 1.3 — переписать устаревший комментарий (~`ProjectChat.tsx:96-98`)

Старый «цвета зафиксированы аудитом — не менять» относился к читаемости ТЕКСТА (10:1+), а не к разделению пузырей — та ось раньше не мерилась. Перепиши под новый аудит, например:

```
// Пузыри: свой = --chat-own-bg + рамка --chat-own-border (акцентная, отделяет от чужого и фона,
// разделение свой↔чужой/фон подтянуто аудитом S-CHAT-1.2, contrast.py). Чужой = surface+border+shadow.
// Цвета ТЕКСТА в пузырях по-прежнему зафиксированы аудитом читаемости (10:1+) — не менять.
```

---

## ЗАДАЧА 2 — Эмодзи-пикер в composer (Часть B)

**WHY.** Быстрая вставка эмодзи в сообщение. Реакции на сообщения — это отдельный спринт S-CHAT-2 (таблица + миграция), СЮДА не входят.

**WHAT.** Кнопка-триггер (Lucide `Smile`) в composer → hand-rolled поповер с курированной сеткой эмодзи → вставка **в позицию курсора** в draft. Ноль runtime-зависимостей, полностью на theme-токенах.

> **⚠️ Про конвенцию «no emoji in UI — SVG icons only»:** она про UI-хром (иконки навигации/кнопок). Здесь триггер — это Lucide `Smile` (SVG, конвенцию соблюдает), а сами эмодзи попадают в **текст сообщения** (пользовательский контент) — это НЕ нарушение. Не подменяй эмодзи-данные иконками.

### Шаг 2.1 — данные: `src/lib/constants/chat-emoji.ts`

Статический массив категорий (по конвенции constants: `ai-presets.ts`, `reconnect.ts` лежат там же). 8–10 категорий, частые эмодзи. Типизировано, без `any`:

```ts
export interface EmojiCategory { key: string; label: string; emojis: string[]; }
export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { key: 'smileys', label: 'Смайлы', emojis: ['😀','😁','😂','🤣','😊','😍','😉','😎','🙂','😌','😔','😢','😭','😤','😡','🥳','🤔','😅','🙃','😴'] },
  { key: 'gestures', label: 'Жесты', emojis: ['👍','👎','👌','🙏','👏','🙌','💪','🤝','✌️','🤞','👋','🫡','🤙','☝️'] },
  { key: 'hearts',  label: 'Сердца', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💯'] },
  { key: 'work',    label: 'Работа', emojis: ['✅','❌','⚠️','📌','📎','📁','📅','⏰','🔥','⭐','🚀','💡','📊','📈','📉','🎯','✍️','🔔'] },
  { key: 'objects', label: 'Объекты', emojis: ['💻','📱','📞','✉️','💰','🧾','🛠️','⚙️','🔒','🔑','📦','🏷️'] },
  // …добавь ещё по вкусу: символы, флаги-минимум, еда/напитки для неформального
];
```

### Шаг 2.2 — компонент: `src/components/projects/ChatEmojiPicker.tsx`

Отдельный компонент (по конвенции — по фиче-папке `projects/`). Пропсы примерно: `{ onPick: (emoji: string) => void; onClose: () => void; anchorRef: RefObject<HTMLButtonElement> }`.

Требования:
- **Позиционирование без клипа.** Composer/лента — скролл-контейнеры; `overflow-x/y` режет обычный `absolute`-поповер (грабли Ганта). Позиционируй через `position: fixed` относительно кнопки-триггера, **или** портал по паттерну `use-anchored-rect` (как `Combobox`/`AssigneeSelect`). z-index: дропдаун-тир (`z-50`); если портал — как порталённые дропдауны (`z-1100`). Поповер не должен вылезать за вьюпорт виджета на узком экране — клампи позицию.
- **Закрытие:** Esc, клик вне, выбор эмодзи. Обработчики click-outside/Esc в `useEffect` читают актуальное состояние **через `useRef`** (иначе stale closure — известные грабли).
- **A11y/клавиатура:** сетка навигабельна стрелками + Enter; фокус-management есть (focus-trap не обязателен); после выбора фокус возвращается в textarea.
- **Стили только на токенах:** фон `--surface`, рамка `--border`, текст `--text`, hover-ячейки `--surface2`/`--surface3`. Никакого хардкода hex, единицы rem/em. Reduced-motion — уважать (проект так делает).

### Шаг 2.3 — интеграция в composer (`ProjectChat.tsx`)

- Кнопка-триггер `<button>` с `<Smile/>` (Lucide) слева от textarea / в её углу; `aria-label="Эмодзи"`. Держи `useRef` на кнопку (anchor) и на textarea.
- **Вставка в позицию курсора:** трекай `selectionStart`/`selectionEnd` textarea (обновляй в `onSelect`/`onKeyUp`/`onClick` через ref). `onPick(emoji)`:
  1. `const { selectionStart: s, selectionEnd: e } = textareaRef.current` (fallback — конец строки);
  2. `next = draft.slice(0, s) + emoji + draft.slice(e)`;
  3. `setDraft(next)`;
  4. после рендера — вернуть фокус в textarea и caret на `s + emoji.length` (`requestAnimationFrame` + `setSelectionRange`).
- **maxLength.** Существующий лимит (ждём 4000) — эмодзи многобайтные, счётчик по `.length` уже это учитывает; вставка не должна превышать лимит (обрежь/не вставляй, если не влезает).
- Эмодзи — обычный текст в `body` (уже `whitespace-pre-wrap`, React экранирует — **XSS-контур цел, ничего не менять** в рендере/санитайзе).

**Edge cases для проверки:** пустой draft + эмодзи (вставка в позицию 0); курсор в середине текста; вставка у лимита 4000; узкий/мобильный поповер не вылезает за виджет; повторные вставки подряд; фокус после выбора.

---

## ГРАНИЦЫ SCOPE (не выходить)

- **НЕ** реакции на сообщения — это **S-CHAT-2** (таблица `message_reactions` + RLS + realtime, миграция; номер миграции сверить по живой БД через Supabase MCP перед стартом S-CHAT-2, не доверять числу из памяти).
- **НЕ** unread / треды / вложения / упоминания.
- Только: визуал своего пузыря (chat-токены) + пикер в composer.
- **Миграции НЕТ** → обычный client-флоу (не migration-спринт).

---

## ПРОВЕРКА

```bash
# globals.css менялся → сбросить кэш Next, иначе стили не подхватятся
rm -rf .next

# TS strict без ошибок (гейт ПЕРЕД push)
npx tsc --noEmit 2>&1 | head -20

# билд (⚠️ НЕ запускать при живом dev-сервере — упадёт)
npm run build 2>&1 | tail -8
```

**Визуальный смок (обязателен, 6 тем):**
- Свой пузырь теперь с видимой акцентной заливкой + рамкой, отделяется и от чужого, и от фона — в т.ч. в тёмных frost/aurora/tidal (там рамка↔фон 2.3–3.1) и в приглушённых aura/washi/fuji (спокойно, не крикливо). fuji — свой красный, не синий.
- Пикер: открытие по `Smile`, вставка в позицию курсора в середине текста, caret стоит после эмодзи, Esc/клик-вне/выбор закрывают, фокус вернулся в textarea, поповер не клиппится лентой и не вылезает за виджет.

---

## КОММИТ

```bash
git add src/components/projects/ProjectChat.tsx \
        src/components/projects/ChatEmojiPicker.tsx \
        src/lib/constants/chat-emoji.ts \
        src/app/globals.css
git commit -m "feat(chat): контраст своих пузырей (chat-токены, 6 тем) + эмодзи-пикер в composer (S-CHAT-1.2)"
# push в ветку спринта; мёрж в main/feat-chat-ui — терминал Олега после гейта
```

---

## VERIFICATION (сборка промпта, Cowork)

```
Contrast (Часть A):     PASS         — 36/36 contrast.py: воспроизвёл «текущую» таблицу handoff + попал в целевые (свой↔чужой 1.32–1.57, рамка↔фон dark 2.32–3.12, ΔL 0.088–0.143)
Type Safety:            NOT_VERIFIED — TS пишет CC; промпт задаёт паттерн (interface, без any)
RLS Coverage:           NOT_APPLICABLE — client-only, БД не трогается
Backward Compatibility: WARNING      — аддитивно (новые токены, новый компонент/данные; чужой пузырь и текст не тронуты). Единственное изменение существующего — класс своего пузыря (визуально намеренное). Финально подтвердит визуальный смок.
Runtime Tested:         NOT_VERIFIED
Live-code sync:         NOT_VERIFIED — папка репо к Cowork не подключилась; сверка живого кода делегирована в РАЗВЕДКУ (CC читает репо напрямую)
Regional Availability:  NOT_APPLICABLE — сторонних сервисов нет (пикер hand-rolled, без либ)
```
