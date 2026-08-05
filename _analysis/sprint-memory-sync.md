# Claude Code Prompt — S-MEM-SYNC-1: синхронизация памяти проекта (скилл crm-architect)

**Этот спринт правит НЕ репозиторий, а скилл** `~/.claude/skills/crm-architect/`.
Он вне git, поэтому ревью на гейте пройдёт чтением файлов, а не диффом. Ветку
в проекте создавать не нужно; коммита в конце нет.

## Зачем

Скилл — память, из которой собирается каждый следующий спринт. Сейчас он
рассказывает про проект неправду, и это уже стоило одного ложного вывода на
гейте («долг schema.md 062–075» — которого в репо нет).

Сверка фактов (выполнена 2026-08-04, повторить в разведке):

| Утверждение скилла | Реальность репозитория |
|---|---|
| `SKILL.md`: «Migrations applied **001–075**, следующая свободная — **076**» | в `supabase/migrations/` **104** файла (последний `104_ai_runs_company.sql`) |
| `references/schema.md`: ledger до **062** | `docs/schema.md` ведёт ledger до **105**, с датами применения |
| `references/theme-system.md`: «Тем **6**» | тем **7**: aura, washi, fuji, **minimal**, frost, aurora, tidal |
| `references/learnings.md`: «copy SQL into Supabase Dashboard → SQL Editor вручную» | контракт другой и описан в самом `SKILL.md`: **apply через Supabase MCP на гейте**, CC миграции не применяет |
| `references/architecture.md` | **0** упоминаний чата (`conversations`/`messages`), webhooks, `DealStakeholders`, `QuotesTab`, recurring-задач |

**Главное архитектурное решение спринта:** схему БД в скилл больше **не
копировать**. `docs/schema.md` — 326 КБ, живёт в репозитории и проходит гейт;
вторая копия в памяти обречена разойтись (что и произошло). `references/schema.md`
становится тонким указателем.

---

## РАЗВЕДКА

```bash
# 1. Реальное состояние миграций
ls ~/Downloads/dashboard-crm/supabase/migrations/ | grep -E "^[0-9]" | tail -5
grep -oE "^# |Applied" ~/Downloads/dashboard-crm/docs/schema.md | head -3
head -40 ~/Downloads/dashboard-crm/docs/schema.md

# 2. Реальные темы
grep -oE "^\.t-[a-z]+ \{" ~/Downloads/dashboard-crm/src/app/globals.css | sort -u
grep -n "THEMES" ~/Downloads/dashboard-crm/src/lib/stores/theme-store.ts

# 3. Что скилл говорит сейчас
grep -n "001–075\|Следующая свободная\|Тем 6" ~/.claude/skills/crm-architect/SKILL.md ~/.claude/skills/crm-architect/references/theme-system.md
wc -l ~/.claude/skills/crm-architect/references/*.md

# 4. Подсистемы, которых память не знает
for k in conversations webhook DealStakeholders QuotesTab recurring CompanyHighlights; do
  printf "%-20s architecture.md: %s\n" "$k" "$(grep -ci "$k" ~/.claude/skills/crm-architect/references/architecture.md)"
done

# 5. Реальные файлы этих подсистем (для описания в architecture.md)
ls ~/Downloads/dashboard-crm/src/components/chat/ ~/Downloads/dashboard-crm/src/components/settings/webhooks/
ls ~/Downloads/dashboard-crm/src/components/companies/
```

---

## ЗАДАЧА 1: `references/schema.md` → тонкий указатель

Заменить содержимое файла на короткий документ (ориентир — **не более 60 строк**):

1. **Источник истины прямым текстом:** полная схема — `docs/schema.md` в репозитории
   (ведётся тем же гейтом, что применяет миграции); живая БД — через Supabase MCP
   read-only (`information_schema`, `pg_policies`, `pg_get_functiondef`,
   `supabase_migrations.schema_migrations`). **Ledger миграций в скилле не
   дублируется** — именно эта копия разошлась на 30 миграций и породила ложный
   вывод на гейте 2026-08-04.
2. **Что остаётся в скилле** (этого нет в `docs/schema.md`):
   - конвенции именования и порядок слоёв (Migration → Types → Validator → Hook → Component);
   - ownership через `owner_id`/`created_by`, **не** `user_id`;
   - org-граница первым конъюнктом в RLS, initplan-обёртки `( SELECT … )`;
   - hardening-конвенция новых функций (`SECURITY DEFINER SET search_path = public, pg_temp` + адресный ACL);
   - «pipelines / pipeline_stages — глобальные словари, не org-scoped».
3. Убрать раздел «⚠️ Актуальность reference-файлов» с долгом 062–075 — он
   описывает несуществующую проблему.

Всё, что было конкретикой по таблицам и колонкам, **удаляется**: за ней ходят в
`docs/schema.md`.

---

## ЗАДАЧА 2: `SKILL.md` — таблица идентичности проекта

В таблице Project Identity исправить по фактам разведки:

- **Migrations** — вместо «001–075 … следующая свободная 076»: «полный ledger —
  `docs/schema.md` в репо; на 2026-08-04 в `supabase/migrations/` 104 файла.
  Номер следующей миграции берётся из `ls supabase/migrations/`, **не** из этой
  таблицы» (число здесь устаревает быстрее всего — не превращать его в источник истины).
- **Default theme** — «**7 тем**: aura (дефолт) / washi / fuji / **minimal** /
  frost / aurora / tidal; minimal — рабочая тема владельца».
- Проверить и поправить, если разошлось: Supabase ref, деплой (Vercel), путь репо.

Раздел «⚠️ Актуальность reference-файлов (2026-07-26)» переписать: убрать долг
062–075, оставить принцип «источник истины по схеме — `docs/schema.md` + живая БД
через MCP, не эта память».

---

## ЗАДАЧА 3: `references/theme-system.md` — 7 тем и петроль

1. «Тем 6» → «Тем 7», добавить `t-minimal` в таблицу тем: light, нейтральный
   canvas `#F6F6F7`/`#FFFFFF`, шрифт **Inter** (`--font-app`, `font-feature-settings: 'cv11'`),
   заголовки 1.25rem/600 (не крупный `aura-page-title`), primary-кнопки —
   сплошной акцент.
2. Акцент minimal — **петроль `#0E7C86`**, текстовый токен `#0A6771`
   (6.58 / 6.09 / 5.48 на surface / bg / surface3). Записать **причину** выбора:
   терракота `#C05A2E` (hue 46°) стояла в 15° от семантического `--red` (30°) и
   читалась как «опасность»; фукси BIT.IIoT (hue 1°) — Δ30°, та же болезнь.
   Свободная зона палитры одна: **175–235°**, между green (149°) и blue (260°).
   **Правило на будущее:** новый акцент любой темы проверять на Δhue ≥ 30° до
   всех семантических цветов, контрасты считать `scripts/contrast.py`, не на глаз.
3. Добавить раздел про `aside`: тема-правила навигации таргетят
   **`aside[data-app-nav]`** (атрибут на `TextNavSidebar`), drawer — `[data-drawer]`
   (после S-UI-CLARITY-1; если тот спринт ещё не принят — написать текущее
   состояние `:not([aria-label])` и пометить как временное). Прецедент: голый
   селектор `aside` красил карточку компании, чат и drawer в sumi/индиго
   с `!important`.

---

## ЗАДАЧА 4: `references/architecture.md` — четыре неизвестных подсистемы + Company 360

Дописать в файловое дерево и разделы (по факту разведки №5, пути не выдумывать):

1. **Чат** — `components/chat/*` (`ChatView`, `MessageThread` ~70 КБ, `ChannelList`,
   `GroupModal`, `TaskFromMessageCard`), хуки `use-conversations`,
   `use-messages`, `use-message-reactions`, `use-message-attachments`,
   `use-conversation-members`; миграции 094–101.
2. **Webhooks** — `components/settings/WebhooksSection.tsx` + `settings/webhooks/*`,
   `use-webhook-endpoints`, edge `webhook-dispatch`, cron-джоба; миграции 088–091.
3. **Стейкхолдеры сделки** — `components/projects/DealStakeholders.tsx`,
   `use-deal-stakeholders`, `lib/constants/stakeholders.ts`; миграция 092.
4. **КП / quotes** — `components/projects/QuotesTab.tsx`, `QuoteModal`,
   `use-quotes`, `validators/quote.ts`.
5. **Recurring-задачи** — `RecurringTemplatesModal`, `use-recurring-tasks`,
   `lib/utils/recurring.ts`; миграция 069.
6. **Company 360** (спринты S-R2-CO360-1 / S-FIX-CO360-1) — секции
   `components/companies/`: `CompanyHighlights`, `CompanyDealsCard`,
   `CompanyDeliveriesCard`, `CompanyContactsCard`, `CompanySidebar`;
   домен `lib/domain/relationship-strength.ts`; хуки `use-company-team-touch`,
   `use-contact-strength`; общее — `lib/utils/avatar.ts`,
   `components/shared/ChzBadge.tsx`.
   Отдельно записать контракт: **`EntityTimeline` принимает 5 опциональных props**
   (`kindFilter`, `splitUpcoming`, `filter`, `onFilterChange`, `showFilters`), все
   выключены по умолчанию — страницы, которые их не передают, рендерятся как раньше;
   экспортируется `TimelineFilterChips` для размещения чипов вне компонента.

Правило для этого файла: **описывать связи и назначение, а не пересказывать код.**
Файловое дерево — только до уровня, который помогает найти нужное.

---

## ЗАДАЧА 5: `references/learnings.md` — снять противоречие и записать уроки сессии

1. **Удалить** запись «Never use `supabase db push` … copy SQL into Supabase
   Dashboard → SQL Editor → Run manually»: она противоречит действующему контракту
   (CC пишет миграцию и коммитит, apply делает гейт через Supabase MCP). Оставить
   запрет CLI-инструментов, заменив «руками в SQL Editor» на «apply — операция
   гейта через MCP».
2. Добавить уроки 2026-08-04 (каждый — коротко, с прецедентом):
   - **Тема-правила на голом теге ломают чужие компоненты.** `.t-washi aside` /
     `.t-fuji aside` / `.t-aura aside` красили любой `<aside>` в sumi/индиго
     с `!important`, включая текст. Правило: тема-селектор обязан целиться в
     конкретный элемент через data-атрибут, а не в тег.
   - **Акцент темы проверять на конфликт hue с семантикой.** Терракота стояла в
     15° от `--red`; интерфейс выглядел тревожным, а причина считалась
     «вкусовщиной». Проверка — `scripts/contrast.py` + Δhue ≥ 30°.
   - **Новый React-Query ключ = новая запись в инвалидации.** `['company-team-touch']`
     и `['contact-strength']` не инвалидировал никто: лента после звонка
     обновлялась, виджеты над ней — нет. Заводя ключ, сразу проходить по мутациям,
     которые меняют его данные.
   - **Шаблонная строка съедает `null`.** `` `${first_name} ${last_name}` `` при
     пустой фамилии печатает «Svetlana null» — React в JSX рендерил бы пустоту.
     Склейка имён — только через `filter(Boolean).join(' ')`.
   - **Путь теста сверять с `vitest.config.ts`.** Include — только `tests/unit/**`;
     тест, положенный в `src/`, молча не запускается, а прогон рапортует «passed».
3. Проверить остальные записи файла на устаревание относительно `docs/schema.md`
   и репо; всё, что противоречит фактам, — править, а не оставлять «на всякий случай».

---

## ПРОВЕРКА

```bash
# ни одного упоминания несуществующего долга и старых чисел
grep -rn "001–075\|062–075\|Следующая свободная — 076\|Тем 6" ~/.claude/skills/crm-architect/ || echo "OK: устаревшие утверждения вычищены"

# схема больше не дублируется
wc -l ~/.claude/skills/crm-architect/references/schema.md   # ориентир ≤ 60

# подсистемы описаны
for k in conversations webhook DealStakeholders QuotesTab recurring CompanyHighlights data-app-nav minimal; do
  printf "%-20s %s\n" "$k" "$(grep -rci "$k" ~/.claude/skills/crm-architect/references/)"
done

# темы и акцент
grep -rn "0E7C86\|Тем 7\|t-minimal" ~/.claude/skills/crm-architect/references/theme-system.md | head
```

## КОММИТА НЕТ

Скилл вне git. В отчёте перечислить: какие файлы изменены и на сколько строк,
что удалено, что добавлено, результат всех проверок выше.

**Вопрос на решение владельца** (не выполнять, только вынести в отчёт): держать
скилл вне git — значит править память без ревью и без истории. Стоит ли класть
копию в репозиторий (`crm-architect/` — пустая папка там уже есть) и
раскатывать её в `~/.claude/skills/` одной командой, чтобы изменения памяти
проходили тот же гейт, что и код? У решения есть цена — две копии и риск
рассинхрона между ними.
