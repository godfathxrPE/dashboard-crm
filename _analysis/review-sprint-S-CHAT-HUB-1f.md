# Ревью: S-CHAT-HUB-1f — визуальная идентичность мессенджера

**Дата:** 2026-08-02  
**Ревьюер:** Grok (верификация по коду `main` @ `60c8987` post-1e; MessageThread, globals chat-own, chat-avatars, ui-store, concept HTML)  
**Объект:** `_analysis/sprint-S-CHAT-HUB-1f.md` — токены/обои, пузыри, unread divider, FAB, композер, drafts; **миграций нет**  
**Контекст:** 1a–1e закрыты; `_analysis/chat-visual-concept.html` — согласованный макет (mask SVG + 6 приёмов). CHAT-HUB-2 (quotes/pins) out.

**Шкала:** 0–100; **≥ 85 = GO**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| No migrations / no new Supabase queries | ✅ |
| Concept HTML exists (mask pattern source) | ✅ |
| Existing chat-own tokens × 7 themes | ✅ |
| GROUP_GAP / groupStart/End / animate-appear / reduced-motion | ✅ |
| djb2 + CHANNEL_GRADIENTS for author name color | ✅ |
| variant page\|card (hub vs ProjectChat) | ✅ |
| last_read snapshot before markRead | 🟡 race — implement carefully |
| lastReadAt not on ConversationListItem yet | 🟡 expose field |
| ui-store persist vs drafts | 🟡 partialize |
| Incoming tail `rounded-bl` already on groupEnd | 🟡 already there; flip avatar only |

**Оценка: 91/100 (GO).** Сильный visual-спринт: scope честный, концепт на диске, токен-only, reuse группировки/аватаров. Главный implementation risk — snapshot `last_read_at` vs `useMarkRead`.  
- Порог: **≥ 85**.  
- Открытых B* нет.

**Рекомендация:** запускать в CC на `feat/chat-hub-1f` от `main` @ `60c8987`. Скриншоты aura / minimal / tidal + card tab обязательны.

---

## Статус (репо)

| Заход | Статус |
|-------|--------|
| HEAD | `60c8987` Merge `feat/chat-hub-1e` |
| Migrations | 097 last; 1f **must not** add 098 |
| Concept | `_analysis/chat-visual-concept.html` ✅ |
| `--chat-own-*` | 7 themes in `globals.css` ~1663–1688 |
| MessageThread | own: tokens; other: `bg-surface`/`border-border`; avatar @ **groupStart**; tail bl/br @ **groupEnd** |
| Autoscroll | `atBottomRef` <80px; own msg always scroll; reduced-motion |
| markRead | on open + last msg + visibility (1b) |
| ConversationListItem | hasUnread, **no** `lastReadAt` field |
| ui-store | persist only `sidebarOpen` |
| ProjectChat | `<MessageThread conversationId={…} />` default card |

---

## С чем согласен полностью

### 1. Identity = wallpaper, not recolor of whole app

CSS mask + token ink/opacity. No rasters. Decorative opacity OK (`pointer-events:none`).

### 2. Six tokens × 7 themes

`--chat-bg`, `--chat-pattern-ink/op`, `--chat-in-bg/border`, `--chat-chip` as derivatives of theme tokens. Dark glass: solid in-bubble (like `[data-modal]` / popover) so wallpaper doesn't double-show through.

### 3. Author name color = channel gradient palette

`gradientFor(author_id)` already in `chat-avatars.ts`; use dark end (`to`) for text on light themes. One hash source for identity.

### 4. Unread divider from snapshotted last_read

No extra fetch. Data already in conversations list query (`conversation_reads`). Never-read (`null`) → no divider at top.

### 5. Drafts per-channel, memory-only

Zustand without persist for drafts. Reload loses them — v1 OK.

### 6. Telegram patterns already half-in

GROUP_GAP grouping, day chips, animate-appear, own tails, reduced-motion hooks — 1f composes, doesn't invent.

### 7. variant page | card

Wallpaper only on hub; ProjectChat tab stays dashboard card among cards.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. Snapshot `last_read_at` **before** markRead (critical order)

`useMarkRead` runs in `useEffect` when `conversationId` / `lastPersistedId` changes and tab is visible → upsert `now` → invalidate list → `lastReadAt` becomes ~now → divider vanishes if you re-read from live list.

**Required pattern:**
```ts
// sync on conversationId change (render or layout effect before markRead):
const readAtRef = useRef<string | null>(null);
if (prevConvId !== conversationId) {
  readAtRef.current = item?.lastReadAt ?? null; // from list cache
  prevConvId = conversationId;
}
// markRead effect separate — does not rewrite readAtRef
```
Expose **`lastReadAt: string | null`** on `ConversationListItem` (already computed at use-conversations:150, just not returned). Pass into MessageThread as prop from ChatView, or read from RQ cache by id inside thread — prefer prop from ChatView to keep “no new query”.

Divider: first message with `created_at > snapshot` (strict). If snapshot null → no divider. If all messages ≤ snapshot → no divider.

### W2. ui-store drafts vs persist

Store uses `persist` + `partialize: { sidebarOpen }`.  
If adding `chatDraftByConversation` to **same** store: keep it **out of partialize** (default already only sidebarOpen — new keys are memory-only as long as partialize stays exclusive). Document in comment. Safer: tiny non-persist slice `useChatDraftStore`.

### W3. Avatar @ groupEnd + items-end

Today avatar on **groupStart** (611–614). Move to **groupEnd**; spacer on non-end; row `items-end`. Name stays on groupStart. Own bubbles already `rounded-br-[4px]` on groupEnd; incoming already `rounded-bl-[4px]` — verify after layout change, don't double-break radius.

### W4. Incoming bubble classes

Other: `border-border bg-surface` (+ shadow). Light themes: `--chat-in-bg: var(--surface)` fine. Glass (frost/aurora/tidal): **solid** in-bg (e.g. popover/bg-like), not translucent surface — else wallpaper bleeds.

### W5. Autoscroll + FAB

Keep existing rule: at bottom OR own message → scroll; else only FAB counter. FAB threshold ~300px ≠ atBottom 80px — two independent thresholds OK. Counter reset on FAB click and when user reaches bottom. rAF throttle on scroll.

### W6. Sticky day chip + z-index

Sticky chip needs z-index above wallpaper, below header/modals. On glass + blur(6px) test frost/tidal. Multiple day chips sticky-stack — only one visible at top is OK (document flow sticky).

### W7. Composer over scroll

Concept: composer floats over wallpaper. Risk: fixed height ChatView (`calc(100dvh-7rem)`). Prefer flex column: list `flex-1 min-h-0`, composer `shrink-0` (no absolute) if absolute breaks scroll metrics; screenshot decides. Capsule shadow: token elevation if exists (`elevation-*` / `--shadow-*`), not raw black.

### W8. Send button disabled

Today `disabled:bg-surface3`. Sprint: muted empty / accent filled. Keep real `disabled` when empty or pending (not grey-only clickable) — learnings SDP.

### W9. Theme coverage checklist

7 themes: aura, washi, fuji, frost, aurora, tidal, minimal. Screenshots: aura, minimal, tidal + **ProjectChat card** without wallpaper. contrast.py at gate.

### W10. concept SVG

Copy mask from `chat-visual-concept.html` (~line 46–47) — already bubble/clip/smile/dots/arrow. Tile 8.75rem matches sprint.

### W11. Optional: export `authorColor(authorId)` from chat-avatars

Avoid re-encoding djb2 in MessageThread; thin helper next to `gradientFor`.

---

## Пропущенные места (grep)

| Файл | Факт | 1f action |
|------|------|-----------|
| `globals.css` chat-own block | 7 themes own tokens | +6 tokens ×7 + `.chat-wallpaper` |
| `MessageThread.tsx` scroll ~420, bubbles 581–640, composer ~700+ | structure | wallpaper variant, avatar end, divider, FAB, capsule, drafts |
| `use-conversations.ts` ListItem | no lastReadAt | add field |
| `ChatView.tsx` | pass variant=page + lastReadAt | |
| `ProjectChat.tsx` | default card | no wallpaper |
| `ui-store.ts` | persist sidebar only | drafts memory |
| `chat-avatars.ts` | gradientFor/djb2 | author name color |
| `chat-visual-concept.html` | mask + layout | visual source |
| `supabase/**` | | **diff empty** |

---

## Предлагаемые правки в спринт (необяз.)

1. Explicit: add `lastReadAt` to `ConversationListItem`.  
2. Explicit effect order: snapshot sync, markRead async.  
3. Note incoming `rounded-bl` already present — focus avatar move.  
4. partialize / separate draft store.

---

## Чеклист crm-architect

- [x] No migration  
- [x] CSS variables / theme-scoped tokens  
- [x] reduced-motion  
- [x] No hard-coded UI colors except existing avatar palette for names  
- [x] Real paths; ProjectChat isolation via variant  
- [x] No new network for visual features  

---

## Чеклист перед CC

- [ ] Branch `feat/chat-hub-1f` from `60c8987`  
- [ ] Tokens + wallpaper mask (concept SVG)  
- [ ] MessageThread page variant: wallpaper, in-bubble, avatar end, sticky chip, chips  
- [ ] lastReadAt snapshot + divider + FAB without breaking autoscroll  
- [ ] Composer capsule + autosize + drafts  
- [ ] Empty state + reaction pop + reduced-motion  
- [ ] ProjectChat card unchanged (screenshot)  
- [ ] tsc/lint/test/build; no supabase in diff  
- [ ] Screenshots: aura, minimal, tidal + card tab  

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Concept / token design | 30 | 29 |
| Integration with existing MessageThread | 30 | 27 |
| Unread divider / FAB / drafts | 25 | 21 |
| Process / a11y / contrast | 15 | 14 |
| **Итого** | **100** | **91** |

**Итог: 91/100 GO** — можно в Claude Code.
