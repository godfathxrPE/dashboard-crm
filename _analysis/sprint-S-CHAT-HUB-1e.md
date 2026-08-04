# Claude Code — S-CHAT-HUB-1e: аватары каналов, переход в проект, чипы сущностей

**Эпик CHAT-HUB, фаза 1e — косметика и контекст. Миграций НЕТ, БД не трогается вообще.**
Если по ходу покажется, что нужна колонка или политика — стоп, это ошибка скоупа, а не
повод для 098. 1a–1d закрыты: модель, хаб, группы, вложения (001–097 в проде).

**Ветка:** `feat/chat-hub-1e` от `main`. Три независимые задачи — три коммита.

---

## РАЗВЕДКА (до правок, результаты — в отчёт)

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull --ff-only origin main
git checkout -b feat/chat-hub-1e
cat src/lib/utils/project-href.ts
grep -n "kind\|project_id\|title" src/lib/hooks/use-conversations.ts | head -20
grep -n "Hash\|Users\|ChannelRow" src/components/chat/ChannelList.tsx | head
grep -n "headerExtra\|title\|whitespace-pre-wrap" src/components/chat/MessageThread.tsx | head
ls src/app/\(dashboard\)/deals src/app/\(dashboard\)/projects src/app/\(dashboard\)/companies src/app/\(dashboard\)/contacts
grep -rn "useProjectConversation" src/components/projects/ProjectChat.tsx
```

Установлено гейтом (не перепроверять, просто использовать):
- `projectHref({id, type})` — единый резолвер: `client` → `/deals/[id]`, иначе `/projects/[id]`;
  для точек без type — `/deals/[id]`, серверный бэкстоп перенаправит.
- body сообщения рендерится «как текст» (React экранирует, `whitespace-pre-wrap`) в ДВУХ
  местах MessageThread (:563 и :596 — своё и чужое). XSS-контур менять нельзя.
- Detail-роуты: `/deals/[id]`, `/projects/[id]`, `/companies/[id]`, `/contacts/[id]`.

## ЗАДАЧА 1 — Генерируемые аватары каналов (коммит 1)

**`src/components/chat/ChannelAvatar.tsx`** — приём Telegram для чатов без фото:
детерминированный градиент из id + инициалы из названия.

- Проп: `{ id: string; title: string; kind: ConversationKind; size?: number }` (rem-ы
  через style, дефолт ~2rem).
- Градиент: хеш id (простой djb2 по строке — Math.random ЗАПРЕЩЁН, аватар обязан быть
  стабильным между рендерами и устройствами) → индекс в **фиксированной палитре 8 пар**
  градиентов. Пары подобрать из существующих section-цветов проекта (`#14B8A6`, `#8B7CF6`,
  `#F97316`, `#10B981`, `#06B6D4`, `#F43F5E`, `#6366F1`, `#F59E0B` + светлая пара к
  каждому). Белый текст поверх — контраст на тёмном конце градиента проверить глазами.
- Инициалы: первые буквы двух первых слов названия («Завод Атлант» → «ЗА», одно слово —
  две первые буквы). Кириллица — `toUpperCase()`, без транслита.
- **Особые случаи:** `general` — НЕ градиент, а нейтральный фон с иконкой `MessagesSquare`
  (общий канал один, ему не нужна различимость — нужна узнаваемость); `group` — маленький
  бейдж `Users` в углу поверх градиента, чтобы тип читался и с аватаром.
- Это `<div>` с CSS-градиентом, НЕ `<svg>` — портить существующий паттерн аватаров людей
  (AuthorAvatar в MessageThread: img + fallback-инициалы) не надо, делаем в его стиле.

**Встроить:** `ChannelList.ChannelRow` — аватар вместо голых иконок `Hash`/`Users`
(иконки убрать, их роль забрал аватар); шапка `MessageThread` — аватар рядом с названием
(размер меньше, ~1.5rem). Плюс `ProjectChat` не трогаем — там свой заголовок вкладки.

## ЗАДАЧА 2 — Переход в проект из канала (коммит 2)

`useConversations` уже тянет `project:projects(name)` — **расширь embed до
`project:projects(name, type)`** и прокинь `type` в `ConversationListItem` (нужен для
`projectHref`; `any` запрещён — расширь тип `ConversationRow`).

- **Шапка треда** (`ChatView`, где groupHeader): для `kind='project'` — кнопка
  «Открыть проект» (`ExternalLink` + текст) → `router.push(projectHref({id: project_id,
  type}))`. Для групп там уже настройки, для general — ничего.
- **Строка канала** (`ChannelRow`): иконка-стрелка по ховеру справа, `<Link>` на тот же
  href, `onClick` с `stopPropagation` — клик по стрелке не должен открывать канал.
  `aria-label="Открыть проект {название}"`.
- `ProjectChat` (вкладка на карточке) кнопку НЕ получает — ты уже на карточке.

## ЗАДАЧА 3 — Чипы ссылок на сущности CRM (коммит 3)

Пользователь вставляет в сообщение внутренний URL (`https://dashboard-crm-ten.vercel.app/deals/<uuid>`
или относительный `/deals/<uuid>`) — рендерим его кликабельным чипом с названием сущности.

**`src/lib/utils/entity-links.ts`** (чистая, с юнит-тестами):
- `parseEntityLinks(body: string): Array<TextPart | EntityPart>` — сплит текста на
  фрагменты; `EntityPart = { entityType: 'deal'|'project'|'company'|'contact', id: uuid,
  href: string }`. Регэксп: (полный origin прода ИЛИ относительный путь) +
  `/(deals|projects|companies|contacts)/<uuid>`. Origin взять из
  `window.location.origin` НЕЛЬЗЯ в чистой функции — принимай `origins: string[]`
  параметром, вызывающий передаст `[window.location.origin]`.
- Никакого markdown и автолинка ВСЕХ url — только четыре типа сущностей. Прочие ссылки
  остаются текстом (авто-линкификация внешних URL — отдельное решение, не здесь).

**`src/components/chat/EntityChip.tsx`:** чип «иконка типа + название» — `<Link>`.
Название резолвится хуком `useEntityTitles(parts)` — ОДИН запрос на тип пачкой
(`.in('id', …)`, только `id, name` / для контактов `first_name, last_name`), React Query,
`staleTime` длинный. Не найдено/нет доступа по RLS → чип «Недоступно» без ссылки —
не падать. Пока грузится — чип с укороченным uuid.

**Рендер в MessageThread:** в обоих местах (:563, :596) вместо голого `{m.body}` —
`renderBody(m.body)` через `parseEntityLinks`. Текстовые фрагменты — как раньше
(React экранирует, `whitespace-pre-wrap` сохранить). **XSS-контур не меняется:**
никакого `dangerouslySetInnerHTML`, href строится только из провалидированного uuid и
белого списка типов, НЕ из исходной строки пользователя.

## EDGE CASES

- Сообщение целиком из одной ссылки — чип и ничего больше (не пустой абзац).
- Битый uuid в url — остаётся текстом, не чипом.
- Ссылка на сделку, которую юзер не видит по RLS — чип «Недоступно» (RLS вернёт пусто,
  это не ошибка).
- Ссылка в отредактированном сообщении — тот же путь рендера (проверь, что edit-режим
  показывает textarea с исходным текстом, а не с чипами).
- Название сущности с длинным именем — truncate на чипе.
- project-канал, у которого проект не подтянулся (`project: null`) — кнопки перехода нет,
  аватар по title из хука.

## ГЕЙТЫ CC

```bash
npx tsc --noEmit      # 0, no any
npm run lint          # baseline
npm test              # зелёные (+ тесты parseEntityLinks: полный/относительный/битый uuid/чужой домен/текст без ссылок)
npm run build         # exit 0
git diff --stat       # НИ ОДНОГО файла в supabase/migrations
```
Локально: скриншоты списка каналов с аватарами и треда с чипом — приложить к отчёту.

## КОММИТЫ

1. `feat(chat): ChannelAvatar — генерируемые аватары каналов`
2. `feat(chat): переход в проект из шапки треда и строки канала`
3. `feat(chat): чипы ссылок на сущности CRM в сообщениях`

## ПОСЛЕ ТЕБЯ — гейт Cowork

Ревью диффа, tsc, проверка «миграций нет», смок UI по скриншотам + ролевой смок чипа
(ссылка на сделку под manager'ом, который её не видит → «Недоступно»). Мерж — Олег.
После 1e — стоп по фичам чата: наполнение данными (назначение сделок менеджерам) и тест
командой. 1f (упоминания + Telegram-мост) — после данных.
