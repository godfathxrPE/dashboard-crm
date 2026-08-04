# Claude Code — S-CHAT-HUB-1d: вложения в сообщениях

**Эпик CHAT-HUB, фаза 1d.** 1a — модель, 1b — раздел `/chat`, 1c — группы. Теперь
**файлы в сообщении**: загрузка, превью картинок, скачивание, удаление.

**Ссылок на сущности CRM здесь НЕТ** — они уходят в 1e. Причина та же, по которой группы
не поехали вместе с хабом: Storage приносит **вторую, отдельную модель доступа** (политики
на `storage.objects` живут вне RLS наших таблиц), а разворачивание ссылок — чистый
рендеринг. В одном спринте это два разных класса риска и два подозреваемых на сломанном
смоке. 1e не потребует миграции вообще.

**Ветка:** `feat/chat-hub-1d` от `main`. Миграция **097** — писать и коммитить,
**НЕ применять**.

---

## РАЗВЕДКА (до правок, результаты — в отчёт)

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull --ff-only origin main
git checkout -b feat/chat-hub-1d
cat supabase/migrations/055_storage_project_files.sql
grep -n "storage\|createSignedUrl\|upload\|remove" src/lib/hooks/use-project-files.ts
grep -n "project_files" supabase/migrations/20260712230000_baseline.sql | head -3
grep -n "messages_body_check\|length(body)" supabase/migrations/094_chat_hub.sql
grep -n "isTempMessage\|useDeleteMessage\|MESSAGE_COLS" src/lib/hooks/use-messages.ts
grep -n "window.confirm\|onDelete\|composer" src/components/chat/MessageThread.tsx | head
```

**Главное, что уже установлено гейтом — не переоткрывать:** политики бакета
`project-files` (055) **own-path**: `(storage.foldername(name))[1] = auth.uid()`.
Файл читает только загрузивший. Для чата это неприменимо: вложение обязан видеть весь
канал. Бакет заводим **свой**, путь от канала, а не от пользователя.

В проде два бакета: `avatars` (public) и `project-files` (private, 50 MB). Проверь, что
`chat-files` ещё нет.

## КЛЮЧЕВЫЕ РЕШЕНИЯ (принять как есть)

1. **Бакет `chat-files`, private, 25 MB.** Путь:
   `<conversation_id>/<message_id>/<uuid>.<ext>`. Первый сегмент — канал, и именно на нём
   стоит проверка доступа. Меньше `project-files` (50 МБ) сознательно: чат — не файловое
   хранилище, тяжёлое место в `project_files`.
2. **Доступ к объекту — через `is_conversation_member`,** ту же функцию, что гейтит всё
   остальное в чате. Один источник правды: кто видит канал — видит его вложения.
   Прямо в политике `((storage.foldername(name))[1])::uuid` писать **нельзя** — битый путь
   уронит каст на `22P02` вместо отказа. Заводим хелпер
   `public.can_access_chat_file(p_name text) returns boolean` с безопасным разбором
   (`exception when invalid_text_representation then return false`).
3. **Метаданные — `message_attachments`**, как `project_files` рядом с бакетом. Storage
   хранит байты, БД — имя, размер, mime и связь с сообщением. RLS зеркалит видимость
   сообщения (EXISTS к `messages`, приём `message_reactions` из 068).
4. **`CHECK` на `body` ослабляется до `<= 4000`** (пустая строка становится валидной):
   сообщение может быть из одного файла. Инвариант «есть текст ИЛИ вложение» — **UI-уровня**,
   в БД его не выразить (это кросс-табличное условие, а CHECK видит одну строку). Тот же
   класс, что «автора не убирают из группы» в 1c — так и записать в комментарии.
5. **Порядок отправки: файлы → сообщение → строки вложений.** `message_id` клиент
   генерирует сам (`crypto.randomUUID()`) и передаёт явным `id` при вставке сообщения —
   иначе путь в Storage неоткуда взять до вставки. Если upload упал, сообщение не
   отправляется вовсе (а не отправляется без файла); если упала вставка вложений — файл
   остаётся в Storage сиротой, это допустимо и уходит в бэклог.
6. **Удаление сообщения сносит и объекты Storage.** Каскад БД уносит только строки
   `message_attachments`. Клиент перед удалением читает пути и зовёт `storage.remove()`.
   Тот же приём, что в `use-project-files.ts`. Сирота при сбое — в бэклог, чистилку
   отдельной джобой не заводим.
7. **Превью — только картинки,** по `mime_type like 'image/%'`, через `createSignedUrl`
   (60 с, как в `project-files`). Остальное — строка с иконкой, именем, размером и
   скачиванием. PDF-вьюеров и прочего не изобретаем.

## ЗАДАЧА 1 — Миграция `097_chat_attachments.sql` (НЕ применять!)

**1.1 Бакет.** `insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files','chat-files', false, 26214400) on conflict (id) do update set
public = false, file_size_limit = 26214400;` — идемпотентно, как 055.

**1.2 Хелпер доступа**
```sql
create or replace function public.can_access_chat_file(p_name text)
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_conv uuid;
begin
  begin
    v_conv := ((storage.foldername(p_name))[1])::uuid;
  exception when invalid_text_representation or others then
    return false;   -- битый путь = отказ, не исключение
  end;
  if v_conv is null then return false; end if;
  return coalesce(public.is_conversation_member(v_conv), false);
end $$;
```
ACL по конвенции: `revoke all … from public, anon`, `grant execute … to authenticated`.

**1.3 Политики `storage.objects` для `chat-files`.** Каноничные имена
`chat_files_select` / `_insert` / `_delete`, каждой предшествует `drop policy if exists`
(идемпотентность, приём 055). SELECT и INSERT — `bucket_id = 'chat-files' and
public.can_access_chat_file(name)`. DELETE — то же (модерация сообщения проверяется на
уровне таблицы; в Storage достаточно членства в канале).

**1.4 `message_attachments`**
```sql
create table if not exists public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  message_id   uuid not null references public.messages(id)      on delete cascade,
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) between 1 and 255),
  file_size    bigint,
  mime_type    text,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
```
Индексы: `(message_id)`, `(org_id)`. `trg_set_org_id` + `trg_aa_freeze_org_id`.
`unique` на `storage_path` — защита от двух строк на один объект.

Политики (зеркало 068, EXISTS к `messages` под её RLS):
- SELECT: org + `exists (select 1 from messages m where m.id = message_attachments.message_id)`;
- INSERT: org + `created_by = auth.uid()` + тот же EXISTS **плюс** проверка, что сообщение
  своё (`m.author_id = auth.uid()`) — вложение к чужому сообщению не цепляют;
- DELETE: org + (`created_by = auth.uid()` or `current_org_role() in ('owner','admin')`);
- UPDATE-политики НЕТ.
Grants: `revoke all from anon`, `grant select, insert, delete to authenticated`.
Realtime: добавить в публикацию (guard как в 068/092/094/096) — вложение должно доезжать
вместе с сообщением.

**1.5 Ослабление CHECK на `messages.body`**
```sql
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 4000);
```
⚠️ **Имя констрейнта возьми из живой схемы** (`\d messages` / `pg_constraint`), а не из
головы — в 094 оно сгенерировано Postgres'ом. Если имя другое — дропай фактическое.
Комментарий: почему пустое тело валидно и что инвариант «текст или вложение» держит UI.

Шапка миграции: зачем / что / чем этот бакет отличается от `project-files` (own-path
против членства в канале) / откат.

## ЗАДАЧА 2 — Типы и хуки

**Типы:** стаб `ChatFilesStub` (таблица) + `ChatFilesFnStub` (функция
`can_access_chat_file`) — приём 1a/1c. Помни: под RPC-стаб приходится вынимать `Functions`
из `Omit` (см. историю `git show 31965bb~1:src/types/database.ts`). **Снятие стабов делает
гейт** — в сообщение коммита реген это не пиши.

**`src/lib/hooks/use-message-attachments.ts` (новый):**
- `useMessageAttachments(messageIds: string[])` — вложения пачкой по ленте
  (`.in('message_id', …)`, `enabled: messageIds.length > 0` — грабля W3 из 068: пустой
  `.in()` роняет PostgREST). Возврат `Map<messageId, Attachment[]>`;
- `useAttachmentUrl()` — `createSignedUrl(path, 60)` по требованию, с кэшем в React Query
  (`staleTime` 50 с — меньше срока жизни ссылки);
- `useUploadAttachments()` — принимает `{ conversationId, messageId, files: File[] }`,
  грузит в `chat-files`, возвращает массив метаданных для вставки.

**`use-messages.ts`:** `useSendMessage` расширяется опциональным `files: File[]`.
Порядок — решение 5: `crypto.randomUUID()` → upload всех файлов → `insert messages` с
явным `id` → `insert message_attachments`. При падении upload'а сообщение НЕ отправляется,
optimistic-строка откатывается, тост с ошибкой.
`useDeleteMessage`: до `delete` прочитать пути вложений и позвать
`supabase.storage.from('chat-files').remove(paths)`.

## ЗАДАЧА 3 — UI

**Composer в `MessageThread`:** кнопка скрепки (`Paperclip`) рядом с эмодзи, `<input
type="file" multiple>` скрытый. Выбранные файлы — чипами над полем ввода, с крестиком на
каждом и суммарным размером. Ограничения на клиенте: 25 МБ на файл, до 5 файлов за
сообщение (сообщение с двадцатью вложениями — это не сообщение). Drag-and-drop **не
делаем** в 1d, зафиксируй в отчёте как сознательный пропуск.

**Пузырь сообщения:** под текстом — вложения. Картинка (`mime_type like 'image/%'`) —
превью с ограничением по высоте, клик открывает подписанную ссылку в новой вкладке.
Остальное — строка «иконка · имя · размер» со скачиванием. Пустое тело (`body === ''`)
рендерить без текстового блока, только вложения — не пустой пузырь.

**Прогресс загрузки:** пока файлы летят, optimistic-строка показывает «Отправка…» и
composer заблокирован. Отдельного прогресс-бара по байтам не делаем.

## EDGE CASES

- Файл больше лимита — не отправляем, тост с именем и размером; остальные файлы из партии
  тоже не уходят (частичная отправка хуже отказа).
- Один файл из пяти упал при upload'е — откатываем всё: уже загруженные удаляем из
  Storage, сообщение не создаём.
- Подписанная ссылка протухла (вкладка висела) — рефетч по клику, не «битая картинка».
- Вложение у чужого сообщения: SELECT его отдаст (видно всем в канале), DELETE — нет.
- Сообщение удалено, пока грузилось превью: строк нет, картинку не рисуем.
- Имя файла с кириллицей и пробелами: в `storage_path` уходит `<uuid>.<ext>`, исходное имя
  живёт только в `file_name`. Ключ хранилища никогда не строится из имени пользователя.

## ГЕЙТЫ CC

```bash
npx tsc --noEmit      # 0, no any
npm run lint          # без новых против baseline
npm test              # зелёные
npm run build         # exit 0
git diff --stat       # 097, типы-стаб, 2 хука, MessageThread; миграция одна
```
Runtime до apply 097 не проверяется — так и напиши.

## КОММИТЫ

1. `feat(chat): 097 бакет chat-files, message_attachments, хелпер доступа (не применена)`
2. `feat(chat): типы-стаб + хуки вложений`
3. `feat(chat): скрепка в composer, превью и скачивание вложений`

## ПОСЛЕ ТЕБЯ — гейт Cowork

Apply 097 → advisors → смоки: участник канала читает чужое вложение, **чужак не читает
объект Storage** (главная проверка спринта — политика бакета, а не таблицы), битый путь
даёт отказ а не `22P02`, вложение к чужому сообщению не вставляется, удаление сообщения
уносит и объект, пустое тело с вложением проходит CHECK → реген типов, снятие стабов
(делает гейт) → `docs/schema.md`. Мерж — Олег.
