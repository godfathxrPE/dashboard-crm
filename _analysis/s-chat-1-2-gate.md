# Гейт Cowork — Sprint S-CHAT-1.2 (контраст пузырей + эмодзи-пикер)

**Дата:** 2026-07-19 · **Гейт:** Cowork · **Коммит:** `origin/feat/chat-ui @ 35835d5` (+ housekeeping `d481f51`) · ветка НЕ смёржена в main.

## Вердикт: ✅ GO для мёржа `feat/chat-ui`. Блокеров нет.

Гейты CC зелёные: `tsc 0`, `build 0`, `vitest 204/204`. Миграций нет → обычный client-флоу.

## Код-ревью (diff 35835d5 — 4 файла, +217/−5)

- **globals.css:** 6 scoped-строк `.t-X .chat-own { --chat-own-bg; --chat-own-border }` в секции «Чат проекта» (по образцу `--chat-time`, W1 закрыт правильным якорем). Значения токенов по 6 темам — точь-в-точь верифицированные (aura .16/.28 … tidal .28/.55). fuji красный (identity). `--accent-l/l2` не тронуты.
- **ProjectChat.tsx:** свой пузырь L374 → `bg-[var(--chat-own-bg)] + border`; file-комментарий переписан (bubble separation vs text audit); edit-textarea L293 не тронут. `handleEmojiPick`: selection читается с DOM, caret-вставка, **4000-guard** (программная вставка не покрыта native `maxLength` — учтено), focus+`setSelectionRange` через rAF. `emoji.length` (UTF-16) = `setSelectionRange` → off-by-one нет.
- **ChatEmojiPicker.tsx:** портал+fixed+z1100, позиция над кнопкой с клампом+fallback, `visibility:hidden` до расчёта, колбэки через ref (stale closure), Esc/mousedown-вне/выбор, стрелочная навигация ±8. `bg-popover` валиден (tailwind map L21, живая конвенция Combobox/AssigneeSelect).
- **chat-emoji.ts:** 8 категорий, типизировано, без `any`.

## Два отклонения CC — оба одобрены

1. **Пикер над триггером** (не под). Обосновано: composer у нижней кромки, под кнопкой панель ушла бы за viewport. Логика clamp+fallback корректна. Вживую — открывается над, не клиппится.
2. **`bg-popover` вместо голого `--surface`.** **Правильнее оригинала промпта:** в тёмных темах `--surface` полупрозрачный (`rgba .07`) и просвечивал бы пузыри сквозь панель; `--popover` в frost/aurora/tidal = solid hex (`#1e2233`/`#1a1e2c`/`#102119`). Вживую в frost — панель solid, без bleed-through.

## Визуальный смок (live, localhost:3000, проект «Аграрная группа»)

3 визуальных архетипа подтверждены вживую + все 6 значений токенов сверены в diff + 36/36 математика (`audit-contrast.py`):

- **aura** (светлый-нейтральный): свой пузырь — серая заливка+рамка, отделяется от белого чужого и от фона. Пикер открывается над кнопкой, категории (Смайлы/Жесты/Сердца), Esc закрывает + фокус вернулся в textarea. Эмодзи вставлен end-to-end (😀 отправлен в ленту).
- **fuji** (светлый-красный): свой пузырь красный (identity сохранена, не синий), отделяется от бежевого фона.
- **frost** (тёмный-стекло, где фикс критичнее — было own↔other 1.02): свой пузырь синий с рамкой, чётко отделяется от фона и чужого. Пикер — solid тёмная панель, без просвечивания.
- washi ≡ fuji (светлый-красный семейство), aurora/tidal ≡ frost (тёмный-стекло, `--popover` solid) — тот же механизм + верифицированные значения, покрыты математикой.

## Verification

```
Contrast:   PASS       — 36/36 audit-contrast.py + live 3 архетипа
Code:       PASS       — паттерн чистый, edge cases (caret/4000/focus/stale-closure) закрыты
Deviations: APPROVED   — оба обоснованы, второе — улучшение
Runtime:    PASS       — tsc 0 / build 0 / vitest 204/204 + live smoke
RLS:        N/A        — client-only
```

## За Олегом

- **Мёрж `feat/chat-ui` → main** (терминал, после этого гейта). Ветка = main +2 фича-коммита (`6e134b2` S-CHAT-1.1 + `35835d5` S-CHAT-1.2) + `d481f51` housekeeping.
- **Post-merge:** строка в `docs/architecture.md` (ChatEmojiPicker + chat-own токены) — косметика.
- **S-CHAT-2** (реакции на сообщения) — следующий; номер миграции сверить по живой БД через Supabase MCP, не из handoff.
