# Claude Code Prompt — S-CHAT-AUDIT-1: три находки аудита чата

Спринт закрывает три дефекта, найденные аудитом 2026-08-03. Все три подтверждены
чтением кода на `main` = `60848aa`.

**Что НЕ входит в этот спринт (важно):** находка про модерацию org admin в приватных
группах (`messages_delete` / `conversations_delete_group` без `is_conversation_member`)
**отклонена**. Она стояла на утверждении, что `DELETE … WHERE` без `RETURNING` не
применяет SELECT-политики. Документация Postgres (`CREATE POLICY`, «Policies Applied by
Command Type», сноска a) говорит обратное: SELECT-политики применяются, «if read access
is required … (for example, a WHERE or RETURNING clause that refers to columns from the
relation)». PostgREST не умеет DELETE без фильтра ⇒ `conversations_select` подключается ⇒
дыры нет. **Не переоткрывать и не «чинить» эти политики.**

---

## РАЗВЕДКА

```bash
# 1. Номер следующей миграции — по ПАПКЕ, а не по CLAUDE.md (он отстал на 15 штук)
ls supabase/migrations/ | grep -E '^[0-9]{3}_' | sort | tail -3

# 2. Триггеры на messages — какие уже висят и в каком порядке
grep -n "trigger.*on public.messages" -B2 -A4 supabase/migrations/094_chat_hub.sql

# 3. Хелпер разбора кода ошибки Postgres — есть ли и где
grep -rn "pgErrorCode" src/lib/ src/components/chat/ | head -5

# 4. Мутация удаления проекта — где именно вызывается delete
grep -n "async function deleteProject" -A12 src/lib/hooks/use-projects.ts

# 5. Роль пользователя в чате — как уже подключена
grep -n "useOrgRole\|isModerator" src/components/chat/MessageThread.tsx

# 6. Убедиться, что чистка Storage при удалении СООБЩЕНИЯ уже есть (эталон паттерна)
grep -n "removeChatAttachmentObjects" -B6 -A4 src/lib/hooks/use-messages.ts
```

---

## ЗАДАЧА 1 — миграция 100: `edited_at` перестаёт быть клиентским полем

### Проблема

`src/lib/hooks/use-messages.ts:167-171` — клиент сам проставляет штамп:

```ts
.update({ body, edited_at: new Date().toISOString() })
```

Колонка `edited_at` (094:179) не имеет ни DEFAULT, ни триггера. Политика
`messages_update` (094:220-229) проверяет только `org_id` и `author_id` и **не сравнивает
новое значение со старым**. Значит автор может одним запросом изменить тело и выставить
`edited_at: null` — сообщение станет неотличимо от исходного, пометка «· изм.»
(`MessageThread.tsx:756`) не появится. `activity_log` сообщения не пишет, второй копии
текста нигде нет.

Штамп подаётся пользователю как признак правки — значит он обязан ставиться сервером.

### Файл

`supabase/migrations/100_message_edited_at_trigger.sql` — **номер проверить разведкой п.1**,
взять `max + 1` по папке.

### Что написать

Шапка в стиле 094/096/099: ЗАЧЕМ → ЧТО ЗДЕСЬ → ⚠️-блоки → раздел «Откат». Содержание:

1. Триггерная функция `public.set_message_edited_at()`:
   - `BEFORE UPDATE ON public.messages FOR EACH ROW`;
   - если `NEW.body IS DISTINCT FROM OLD.body` → `NEW.edited_at := now()`;
   - иначе → `NEW.edited_at := OLD.edited_at` (правка других полей штамп не двигает);
   - **в обеих ветках значение из payload клиента затирается** — обнулить или подделать
     штамп нельзя ни при каком раскладе;
   - hardening по конвенции проекта: `SECURITY DEFINER SET search_path = public, pg_temp`.
2. ACL: функция **триггерная**, клиент её не зовёт ⇒
   `revoke all … from public, anon, authenticated;` + `grant execute … to service_role;`
   (EXECUTE проверяется при `CREATE TRIGGER`, не при срабатывании — learnings).
3. Имя триггера — `trg_set_edited_at`. Порядок важен: на `messages` уже висят
   `trg_aa_freeze_org_id` и `trg_set_org_id`; алфавитно наш встаёт между ними, ни на что
   не влияет (все три независимы). Префиксы `aa_`/`zz_` тут не нужны — обосновать это
   строкой в комментарии.
4. `comment on column public.messages.edited_at` — обновить: штамп ставит триггер 100,
   клиентское значение игнорируется.
5. Блок «Откат» — комментарием, как в 094/100-шаблоне:
   `drop trigger if exists trg_set_edited_at on public.messages;` +
   `drop function if exists public.set_message_edited_at();`

⚠️ **Миграцию НЕ применять.** Написать файл, закоммитить. Применяет гейт.

### Клиентская часть

`src/lib/hooks/use-messages.ts`, `useEditMessage` — убрать `edited_at` из payload:

```ts
// Было:
.update({ body, edited_at: new Date().toISOString() })
// Стало:
.update({ body })
```

Комментарий над мутацией переписать: штамп ставит триггер `trg_set_edited_at` (100),
клиент его не шлёт и не может подделать. `.select(MESSAGE_COLS).single()` оставить — из
него и приедет серверное значение `edited_at`.

⚠️ Порядок выкатки: миграция и правка хука едут **одним PR**. До применения 100 хук без
`edited_at` перестанет ставить штамп вовсе (колонка останется прежней) — это деградация
на время между мержем и apply, гейт применяет миграцию сразу. В отчёте это отметить.

---

## ЗАДАЧА 2 — `viewer` больше не упирается в 42501 после отправки сообщения

### Проблема

`MessageThread.tsx:779-804` — иконка «в задачу» показана всем, кто видит сообщение
(это осознанное решение S-CHAT-TASK-1 и оно верное для *видимости*). Но право **создать**
задачу — независимый гейт: `tasks_insert` в `20260712230000_baseline.sql:3652` требует
`current_org_role() IN ('owner','admin','manager')`. Роль `viewer` после 098 видит всю
базу, то есть заходит в систему как полноценный читатель — и упирается в `42501` уже
**после** того, как сообщение ушло в канал (по FIX S-CHAT-TASK-SLASH слэш-команда сначала
отправляет сообщение, `MessageThread.tsx:552`).

Итог для пользователя: в канале висит реплика, которую команда читает как поставленную
задачу; задачи нет; тост «Не удалось создать задачу» уже уехал. Провенанс работает в
обратную сторону.

### Правки

**2.1. `src/components/chat/MessageThread.tsx`**

`orgRole` уже подключён (`useOrgRole()`, строка ~236 — сверить разведкой п.5). Завести
рядом с `isModerator`:

```tsx
// Право СОЗДАТЬ задачу — не то же, что право ВИДЕТЬ сообщение: tasks_insert (baseline)
// пускает owner/admin/manager. viewer видит канал (он член org ⇒ член general), но его
// INSERT упадёт 42501 — а по слэш-пути сообщение к тому моменту уже в канале.
const canCreateTask = orgRole !== 'viewer' && orgRole != null;
```

⚠️ `orgRole` приезжает асинхронно: пока `undefined`/`null` — кнопку не рисуем. Показать
и отобрать хуже, чем показать на 200 мс позже.

**2.2.** Иконку «в задачу» (`ListPlus`, блок `m.body.trim() && (…)`) обернуть в
`canCreateTask &&`. `TaskCreatedLink` (ветка «задача уже есть») **оставить видимым всем** —
это не действие, а ссылка на факт.

**2.3.** Слэш-команду гейтить **до** `sendMessage.mutate` (строка ~552): если
`!canCreateTask` — `toast.error('Недостаточно прав, чтобы ставить задачи')`, `return`,
драфт **не очищать** (человек не должен терять набранный текст).

**2.4. `src/components/chat/TaskFromMessageCard.tsx`**, `onError` (~строка 301): добавить
ветку до общего `toast.error`:

```ts
if (pgErrorCode(err) === '42501') {
  toast.error('Недостаточно прав, чтобы ставить задачи');
  onClose();
  return;
}
```

Это второй эшелон: гейт по роли — клиентский, а истина живёт в RLS. Если роль сменили в
соседней вкладке, пользователь получит внятный текст вместо «Не удалось создать задачу».

⚠️ Имя хелпера `pgErrorCode` и путь импорта взять из разведки п.3, не из этого файла.

---

## ЗАДАЧА 3 — вложения не остаются в бакете при удалении группы и проекта

### Проблема

`097_chat_attachments.sql:245-247` фиксирует договорённость: «Каскад от messages уносит
строки, но НЕ объекты Storage — их удаляет клиент перед удалением сообщения». Договорённость
выполняется ровно на **одном** из трёх путей — `useDeleteMessage`
(`use-messages.ts:203-213`). Два других её не знают:

- `useDeleteGroup` (`use-conversations.ts:294-306`) — голый
  `.from('conversations').delete().eq('id', id)`, каскад `conversations → messages →
  message_attachments`;
- удаление проекта (`ProjectDetail.tsx:290` → `useDeleteProject`) — то же самое через
  канал проекта.

Хуже, чем просто мусор: после удаления канала объекты становятся **неудаляемыми из
приложения**. `can_access_chat_file` (097:71-85) берёт первый сегмент пути как
`conversation_id` и зовёт `is_conversation_member`; строки канала больше нет ⇒
`v_org_id is null` ⇒ `false`. Ни `select`, ни `delete` не проходят **ни у кого**, включая
owner организации. На запрос «удалите наши документы» ответить нечем, кроме ручного захода
в дашборд Supabase под `service_role`.

### Решение — повторяем существующий паттерн, а не заводим новый

Клиентская чистка перед удалением, как в `useDeleteMessage`. Отдельная DEFINER-RPC с
таблицей-очередью и cron надёжнее в теории, но: (а) удаление строки `storage.objects` не
стирает байты — всё равно нужен Storage API, то есть Edge Function, то есть третий
механизм ради оставшихся процентов; (б) в проекте уже есть **один** принятый способ, и
третий источник правды дороже, чем остаточный риск. Хвост про фоновую чистилку сирот —
в бэклог, не сюда.

⚠️ Порядок операций обязателен: **сначала собрать пути, потом удалить объекты, потом
удалить канал/проект**. После удаления канала RLS закроет и чтение путей, и удаление
объектов — вернуть их будет уже нечем.

**3.1. `src/lib/hooks/use-conversations.ts`, `useDeleteGroup`**

Перед `.from('conversations').delete()`:

```ts
// Пути читаем ДО удаления: каскад унесёт строки message_attachments, а после исчезновения
// канала can_access_chat_file (097) вернёт false и объекты станут неудаляемыми вообще —
// первый сегмент пути это conversation_id, которого больше нет.
const { data: paths } = await supabase
  .from('message_attachments')
  .select('storage_path')
  .in('message_id', /* id сообщений канала */);
```

Список `message_id` — подзапросом не получится (PostgREST), поэтому двумя шагами:
`.from('messages').select('id').eq('conversation_id', id)` → затем `.in('message_id', ids)`.
⚠️ Пустой `.in()` роняет PostgREST (грабля W3 из 068) — при пустом списке запрос **не
отправлять**. Ошибку чтения путей глотать (`catch → undefined`), как в `useDeleteMessage`:
худший исход здесь сирота в бакете, а не заблокированное удаление группы.

Затем `await removeChatAttachmentObjects(paths).catch(() => undefined)` и только потом
delete канала.

**3.2. Удаление проекта** — та же логика в мутации из разведки п.4. Канал проекта ищется
по `conversations.project_id = <id>`; если канала нет (`null` — проект создан до бэкфилла
094), шаг чистки пропускается без ошибки.

⚠️ Если в удалении проекта окажется, что мутация живёт в отдельной функции `deleteProject`
вне хука — правку класть туда же, не дублировать логику в компоненте.

**3.3.** Вынести общую часть в хелпер, чтобы не было третьей копии: например
`collectConversationAttachmentPaths(conversationId): Promise<string[]>` рядом с
`removeChatAttachmentObjects` в `src/lib/hooks/use-message-attachments.ts`. Обе мутации
зовут его.

---

## ЗАДАЧА 4 — `docs/schema.md`

Добавить блок про миграцию 100 со статусом **«НЕ ПРИМЕНЕНА, лежит на гейте»**. Timestamp
не выдумывать — его впишет гейт из `supabase_migrations.schema_migrations`.

⚠️ `CLAUDE.md` в этом спринте **не трогать** — он отстал на 15 миграций, но его правка это
отдельный заход (там же `ai-run v4` и ложное утверждение про `schema.md`). Не смешивать.

---

## ПРОВЕРКА

```bash
# Типы
npx tsc --noEmit 2>&1 | head -20

# Хелпер: edited_at больше не уходит с клиента (должно быть 0 вхождений)
grep -rn "edited_at:" src/lib/hooks/use-messages.ts

# Гейт роли в чате
grep -n "canCreateTask" src/components/chat/MessageThread.tsx

# Чистка Storage на всех трёх путях (ожидание: 3 вызова)
grep -rn "removeChatAttachmentObjects" src/ | grep -v "export"

# Hardening новой функции
grep -n "SECURITY DEFINER\|search_path\|grant execute" supabase/migrations/100_*.sql

# Юнит-тесты — если раннер поднимается
npm test 2>&1 | tail -15
```

⚠️ `npm run build` гонять последним и не при живом `next dev`.

---

## ЧЕГО НЕ ДЕЛАТЬ

- Не применять миграцию. Не трогать прод-БД. `apply_migration` — операция гейта.
- Не править `src/types/supabase.gen.ts` и `database.ts` руками. Триггер колонок не
  добавляет ⇒ реген в этом спринте вообще не нужен.
- Не заменять `window.confirm` в этом спринте — это отдельный долг на 27 вызовов.
- Не трогать `messages_delete` / `conversations_delete_group` (см. шапку файла).

---

## КОММИТ

```bash
git add .
git commit -m "S-CHAT-AUDIT-1: edited_at ставит триггер (100), viewer не упирается в 42501, чистка вложений при удалении группы и проекта"
```

⚠️ Сообщение коммита должно соответствовать дифу. Трижды за прошлые спринты заявленное в
коммите опережало сделанное — перед `git add` прогнать `git status --short` и `git diff --stat`
и сверить с текстом.
