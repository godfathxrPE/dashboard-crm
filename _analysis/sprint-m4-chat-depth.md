# Claude Code Prompt — Sprint M4: Чат проекта — глубина и детализация (D2)

Диагноз (визуальный смок + код): чат плоский, в t-minimal свои пузыри вообще
без заливки. Причины по коду:
1. `.chat-own`-токены заданы для 6 тем (globals.css ~L1570–1575), **t-minimal
   отсутствует** → `--chat-own-bg` не определён, пузырь падает в прозрачный контур.
2. Fuji использует torii-КРАСНЫЙ тинт (rgba(194,59,59,…)) — это акцент washi,
   у fuji акцент индиго #2B5078. Чужая краска в теме.
3. Слои не разведены: дата-чип сливается с канвасом, у чужих сообщений нет
   имени автора, у send-кнопки нет внятного disabled.

Цветовая система согласована и проверена на контраст (chat-color-preview.html):
minimal 17.4:1 · washi 9.0 · fuji 11.2 · frost 9.6 · aurora 10.5 · tidal 7.1 — AA+.

Чекаут: feat/deal-card.

> v1.1 — по ревью Grok: B1 подтверждён (утилита text-text-main на пузыре перебьёт
> color родителя → тёмное на чёрном в minimal), но фикс Грока «text-white в JSX»
> ОТКЛОНЁН — он глобальный и убил бы читаемость на светлых тинтах washi/aura/fuji.
> Принято токен-решение --chat-own-fg с фоллбэком var(--text) (задача 1a).
> Задача 3 (имя автора) — уже реализована в live, помечена скипом.

---

## РАЗВЕДКА

```bash
git log --oneline -1
grep -n "chat-own\|chat-time" src/app/globals.css
grep -n "chat-own\|chat-other\|bg-bg\|full_name\|author" src/components/projects/ProjectChat.tsx | head -20
# есть ли имя автора над чужим пузырём и где текст сообщения берёт цвет:
sed -n '440,480p' src/components/projects/ProjectChat.tsx
```

---

## ЗАДАЧА 1: Токены пузырей (globals.css, блок ~L1570)

1a. Добавить недостающий t-minimal — свои пузыри СОЛИДНЫЕ чёрные (Linear-паттерн,
референс-превью), белый текст, время — белое 75%:

Схема цвета текста — через токен с фоллбэком (НЕ text-white в JSX: он
глобальный и сломает светлые тинты washi/aura/fuji ~1.6:1):

1. CSS (globals.css, рядом с chat-own-блоком):

```css
.chat-own { color: var(--chat-own-fg, var(--text)); }
.t-minimal .chat-own {
  --chat-own-bg: var(--text);
  --chat-own-border: var(--text);
  --chat-own-fg: #fff;
  --chat-time: rgba(255,255,255,0.75);
}
```

2. JSX (ProjectChat.tsx ~L438): убрать `text-text-main` у СВОЕГО пузыря, чтобы
утилита не перебивала токен; у чужого — оставить:

```tsx
className={cn('rounded-2xl px-3 py-2 text-sm', isMine ? 'chat-own' : 'bg-surface2 text-text-main')}
```

3. Реакции «свои» (~L372): та же замена — вместо `text-text-main` на
chat-own-фоне цвет должен идти от `.chat-own`-токена. Если чип не носит класс
chat-own — добавить `text-[color:var(--chat-own-fg,var(--text))]` точечно.

Итог по темам: minimal — белый на чёрном (17.4:1); washi/aura/fuji — тёмный
--text на светлом тинте (9–14:1); тёмные — светлый --text на солидном тёмном
(7.1–10.5:1). Ничего не хардкодим глобально.

1b. Fuji — заменить чужой красный на индиго темы (и обновить комментарий у
строки — старый упоминает «red identity», после правки он врёт):

```css
.t-fuji .chat-own { --chat-own-bg: rgba(43,80,120,0.13); --chat-own-border: rgba(43,80,120,0.28); }
```

1c. Washi — приглушить тинт (22% кричит):

```css
.t-washi .chat-own { --chat-own-bg: rgba(194,59,59,0.16); --chat-own-border: rgba(194,59,59,0.30); }
```

1d. Тёмные — заменить полупрозрачные тинты на СОЛИДНЫЕ (глубина без просветов
через glass; значения = композит текущего тинта над popover, вид не меняется,
пропадает просвечивание):

```css
.t-frost  .chat-own { --chat-own-bg: #2D3C66; --chat-own-border: rgba(91,138,255,0.45); }
.t-aurora .chat-own { --chat-own-bg: #3C2E61; --chat-own-border: rgba(160,96,255,0.45); }
.t-tidal  .chat-own { --chat-own-bg: #1D4536; --chat-own-border: rgba(72,184,144,0.45); }
```

## ЗАДАЧА 2: Слои канваса (ProjectChat.tsx)

- Канвас (~L277 `bg-bg`): добавить внутреннюю рамку `border border-border/50` —
  зона чата читается как утопленная, а не как дыра в карточке.
- Дата-чип (~L422, `bg-surface2`): → `bg-surface border border-border/60` —
  чип лежит НА канвасе, а не растворяется в нём.

## ЗАДАЧА 3: Имя автора у чужих — УЖЕ РЕАЛИЗОВАНО (скип)

Live L460–462: `groupStart` + `full_name` уже рендерятся. Ничего не делать,
в отчёте отметить «уже есть».

## ЗАДАЧА 4: Композер

- Send-кнопка (~L531, сейчас только `disabled:opacity-50`): заменить на
  `disabled:bg-surface3 disabled:text-text-mute` (opacity на интерактиве —
  против правила P0). Активная — как есть, bg-accent (в minimal после M1.1 = чёрная).
- Emoji-кнопка: высоты уже выровнены (обе 42px, live) — no-op, отметить.

## ЗАДАЧА 5: Empty-state чата

Если сообщений нет — вместо пустого канваса по центру:
иконка MessageSquare 20px muted (`aria-hidden="true"` — декоративная) +
«Пока тихо. Напиши первое сообщение команде» (text-xs text-text-mute).
Без CTA-кнопки — инпут и так на экране. MessageSquare уже импортирован (L4).

## СМОК

Чат проекта во всех 7 темах (Аграрная группа → таб Чат):
- minimal: свои — чёрные с БЕЛЫМ текстом (тело И реакции — обязательная
  визуальная проверка, это B1 ревью), чужие — белые с тенью;
- washi/aura/fuji: текст своих пузырей остался ТЁМНЫМ на тинте (фоллбэк
  --chat-own-fg → --text отработал; если где-то белый — регресс токен-схемы);
- fuji: свои — индиго-тинт (НЕ красный); washi: torii-тинт тише;
- тёмные: пузыри солидные, фон не просвечивает;
- дата-чип отделён, у чужих имя+аватар, send disabled — серый;
- реакции (use-message-reactions) кликаются и читаются во всех темах.
tsc 0.

## КОММИТ

```bash
git add src/app/globals.css src/components/projects/ProjectChat.tsx
git commit -m "feat(chat): глубина чата — токены пузырей 7 тем (fix minimal/fuji), слои канваса, автор, disabled send"
```

НЕ пушить без подтверждения. Миграций нет.
