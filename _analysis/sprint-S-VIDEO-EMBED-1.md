# Claude Code Prompt — Sprint F2: S-VIDEO-EMBED-1 (v2, после ревью Grok 8/10)

**Видео-материалы проекта: embed YouTube / VK / Rutube (прочее — ссылкой)**

> **Что поправлено против v1 (ревью Grok, сверка по коду @`bb2f0b7`):**
> **B1** SELECT зеркалит `projects_select` (+ownership проекта, **без** `manager`); W1 stub `project_videos` в `supabase.gen.ts` (иначе `tsc` красный); W2 GRANT/REVOKE; W3 FK `org_id`/`created_by` + `TO authenticated`; W5 `m.youtube.com`; W7 embed через `parseVideoUrl(stored.url)` на рендере (не доверять stored provider); W6 confirm на delete.

## Контекст
- `dashboard-crm` (Next.js 15 + TS + Tailwind + Supabase, **деплой Vercel** — `netlify.toml` реликт для отката). `origin/main = bb2f0b7`, миграции по **065** → **эта 066**.
- Цель (п.8): к проекту прикрепляются видео (демо/обучение/запись встречи) — YouTube/VK/Rutube встроенным плеером; Я.Диск/GDrive/прочее — кликабельной ссылкой.
- **Migration-спринт:** CC пишет+коммитит `supabase/migrations/066_project_videos.sql`, **НЕ применяет**. Гейт Cowork применит + смок ролями + advisors. **Мёрж в main — только ПОСЛЕ apply** (иначе прод-код обратится к несуществующей таблице).

### Якоря (живой код @bb2f0b7)
| Что | Факт |
|---|---|
| Helper команды (065) | `is_project_member(p_project_id uuid) → bool` (SQL STABLE SECURITY DEFINER) |
| **Кто видит проект** (зеркалим для B1) | `projects_select`: `org AND (role∈owner/admin OR owner_id=uid OR created_by=uid)` **+** `projects_select_member`: `org AND is_project_member(id)`. **manager НЕ входит** |
| set_org_id | `trg_set_org_id BEFORE INSERT EXECUTE FUNCTION set_org_id()` — org_id НЕ передавать |
| Гейт записи | `canManageDeliveryProject` = owner/admin ∨ `owner_id`/`created_by`; `canManage` в `ProjectDetail.tsx:249` |
| Типы (паттерн quotes 053) | ручной блок таблицы в `supabase.gen.ts` + alias в `entities.ts` через `Database[...]` |
| Место в UI | `<ProjectFiles projectId=… />` в `ProjectDetail.tsx:833` (без своего canManage-гейта — видео гейтим строже) |
| CSP | `next.config.ts:13` — `object-src 'none'; base-uri 'self'; frame-ancestors 'none'` (нет `frame-src` → embed не блокируется). Дубль в `netlify.toml:25` (реликт) |
| vitest-образец | `tests/unit/parseFullName.test.ts` |

## ⚠️ ГОЧИ
1. **CC миграцию НЕ применяет.** Мёрж в main — после apply гейтом.
2. **RLS SELECT = зеркало `projects_select`** (B1): `org AND (role∈owner/admin OR EXISTS project ownership OR is_project_member)`. **Без `manager`** (его нет в projects_select — иначе видео виднее проекта). INSERT/DELETE = `org AND (role∈owner/admin OR project ownership)` (= canManage, включая created_by). Все вызовы в `(select …)`; политики `TO authenticated`. NO UPDATE.
3. **org_id не передавать** (`trg_set_org_id`); FK `org_id→organizations CASCADE`, `created_by→profiles SET NULL default auth.uid()`.
4. **W7 (безопасность) — embed из распарсенного url на рендере.** Список рендерит `const parsed = parseVideoUrl(video.url)` и берёт `parsed.embedUrl`. **НЕ доверять stored `provider`/`url` напрямую** (`if provider==='youtube' <iframe src={video.url}>` = дыра: злоумышленник с INSERT впишет `provider='youtube', url='evil.com'`). Stored `provider` — только для badge/иконки.
5. **embedUrl из id, не из сырого url** (в `parseVideoUrl`) — injection-safe. iframe: `title`, `loading="lazy"`, `referrerpolicy="strict-origin-when-cross-origin"`, `allow="accelerometer; encrypted-media; fullscreen; picture-in-picture"`, `allowfullscreen`, без жёсткого `sandbox`.
6. **provider `other`** → карточка-ссылка `target="_blank" rel="noopener noreferrer"`, не iframe.
7. **delete — через `window.confirm`** (конвенция проекта, как ProjectFiles). W6.
8. **W1 типы:** миграция не применена → `supabase.from('project_videos')` не затипится без stub. Добавить ручной блок `project_videos` в `supabase.gen.ts` (Row/Insert/Update/Relationships, как `quotes` 053) + alias `ProjectVideo`/`ProjectVideoInsert` в `entities.ts` через `Database['public']['Tables']['project_videos'][…]`. Комментарий `// stub до apply 066 + regen`.
9. **CSP (опц. hardening):** `frame-src https://www.youtube.com https://youtube.com https://vk.com https://vkvideo.ru https://rutube.ru` — в `next.config.ts` (актуальный прод Vercel). `netlify.toml` — реликт (трек 0 снести); синхронизировать опц. Embed работает и без правки.

## РАЗВЕДКА (ПЕРЕД правками)
```bash
cd ~/Downloads/dashboard-crm && git switch -c feat/video-embed && git log --oneline -1
ls supabase/migrations | tail -4                              # 066 свободна
grep -n "is_project_member\|projects_select\|set_org_id\|current_org_role" supabase/migrations/065*.sql | head
# зеркало для B1 — как проект становится видимым:
grep -rn "projects_select" supabase/migrations/*.sql | head
# типы-stub образец (quotes 053)
grep -n "quotes:" src/types/supabase.gen.ts | head; grep -n "Quote\b" src/types/entities.ts | head
# UI + гейт + confirm-образец
grep -n "ProjectFiles\|canManage" src/components/projects/ProjectDetail.tsx | head
sed -n '1,40p' src/components/projects/ProjectFiles.tsx        # секция: список/добавление/confirm-delete/пустое
grep -n "canManageDeliveryProject" src/lib/utils/project-permissions.ts
sed -n '10,16p' next.config.ts                                 # CSP-строка
sed -n '1,40p' tests/unit/parseFullName.test.ts
```
**Свод:** 066 свободна; SELECT-предикат для видео = копия `projects_select` (owner/admin OR ownership OR member); stub-паттерн quotes; ProjectFiles секция + confirm-delete.

---

## ЗАДАЧА 1 — Миграция 066 + типы-stub  [риск: средний, DDL]
**Steps.**
1. `supabase/migrations/066_project_videos.sql`:
```sql
create table if not exists public.project_videos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null check (length(url) between 1 and 2048),
  provider text not null check (provider in ('youtube','vk','rutube','other')),
  title text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.project_videos enable row level security;

create trigger trg_set_org_id before insert on public.project_videos
  for each row execute function public.set_org_id();

create index if not exists idx_project_videos_project on public.project_videos(project_id, sort_order);
create index if not exists idx_project_videos_org on public.project_videos(org_id);

-- B1: SELECT = ЗЕРКАЛО projects_select (owner/admin OR project ownership OR member; БЕЗ manager)
create policy project_videos_select on public.project_videos for select to authenticated using (
  org_id = (select public.current_org_id())
  and (
    (select public.current_org_role()) in ('owner','admin')
    or exists (select 1 from public.projects p
               where p.id = project_id and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid())))
    or (select public.is_project_member(project_id))
  )
);
create policy project_videos_insert on public.project_videos for insert to authenticated with check (
  org_id = (select public.current_org_id())
  and (
    (select public.current_org_role()) in ('owner','admin')
    or exists (select 1 from public.projects p
               where p.id = project_id and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid())))
  )
);
create policy project_videos_delete on public.project_videos for delete to authenticated using (
  org_id = (select public.current_org_id())
  and (
    (select public.current_org_role()) in ('owner','admin')
    or exists (select 1 from public.projects p
               where p.id = project_id and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid())))
  )
);
grant select, insert, delete on public.project_videos to authenticated;
revoke all on public.project_videos from anon;
```
> Перед коммитом свериться разведкой: предикат SELECT = точная копия `projects_select` + `projects_select_member` (если там появился/отсутствует какой-то член — зеркалить факт, не этот текст).

2. **Типы-stub (W1):** в `src/types/supabase.gen.ts` — ручной блок `project_videos: { Row/Insert/Update/Relationships }` (как `quotes`). В `src/types/entities.ts`: `export type ProjectVideo = Database['public']['Tables']['project_videos']['Row'];` + `ProjectVideoInsert`. НЕ hand-rolled parallel interface.
3. **НЕ применять миграцию.**

**Verification.** `npx tsc --noEmit` (типы + stub). Файл `066` закоммичен, не применён.

---

## ЗАДАЧА 2 — Парсер embed (чистый + vitest)  [риск: низкий]
**Steps.** `src/lib/utils/video-embed-helpers.ts`:
- `export interface ParsedVideo { provider: VideoProvider; embedUrl: string | null }`.
- `parseVideoUrl(raw: string): ParsedVideo`:
  - YouTube (вкл. **`m.youtube.com`**, `www`, shorts, youtu.be, embed): `/(?:(?:www\.|m\.)?youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/` → `https://www.youtube.com/embed/{id}`.
  - VK: `/vk(?:video)?\.(?:com|ru)\/video(-?\d+)_(\d+)/` → `https://vk.com/video_ext.php?oid={oid}&id={id}&hd=2`.
  - Rutube: `/rutube\.ru\/(?:video|play\/embed)\/([0-9a-f]+)/` → `https://rutube.ru/play/embed/{id}`.
  - иначе → `{ provider:'other', embedUrl:null }`. embedUrl — из распарсенных id, не из `raw`.

**Verification.** `tests/unit/video-embed-helpers.test.ts`: youtube watch/`m.youtube.com`/youtu.be/embed/shorts (все → один embed id), vk `video-123_456`, rutube, `other` (Я.Диск/GDrive/мусор→other/null), инъекция (`"><script>`→other/null, не в embedUrl). `npx vitest run video-embed-helpers`.

### КОММИТ 1
```bash
npx tsc --noEmit && npx vitest run video-embed-helpers && git add -A && git commit -m "feat(video-embed): миграция 066 project_videos (RLS зеркалит projects_select, GRANT) + парсер + типы-stub + vitest"
```

---

## ЗАДАЧА 3 — Хук use-project-videos  [риск: низкий]
`src/lib/hooks/use-project-videos.ts` (паттерн use-project-columns): `useProjectVideos(projectId)` (`queryKey ['project_videos', projectId]`, order `sort_order`); `useAddVideo(projectId)` (insert `{project_id,url,provider,title,sort_order}`, org_id НЕ передавать; optimistic+invalidate); `useDeleteVideo(projectId)` (delete by id; optimistic+invalidate). Без realtime.
**Verification.** `npx tsc --noEmit`.

---

## ЗАДАЧА 4 — Компонент + монтаж  [риск: средний]
**Steps.** `src/components/projects/ProjectVideos.tsx` → `ProjectVideos({ projectId, canManage })`:
1. `useProjectVideos(projectId)`; заголовок «Видео» (как ProjectFiles).
2. **Список (W7 — безопасность):** по каждой записи `const parsed = parseVideoUrl(video.url)`. Если `parsed.embedUrl` — `aspect-video` + `<iframe src={parsed.embedUrl} title={video.title||'Видео'} loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; fullscreen; picture-in-picture" allowfullscreen className="w-full h-full rounded-lg border border-border">`. Иначе (`other`) — карточка-ссылка `<a target="_blank" rel="noopener noreferrer">`. **embed берётся из `parsed.embedUrl`, не из `video.url`/stored provider.** Заголовок + `Trash2` (`text-red`, только `canManage`) → `window.confirm('Удалить видео?')` → `useDeleteVideo`.
3. Добавление (`canManage`): input URL → `parseVideoUrl` live-preview (провайдер + мини-плеер) + опц. «Название» → «Добавить» → `useAddVideo({url, provider: parsed.provider, title, sort_order: videos.length})`. Невалидный/`other` без embed — предупредить, но разрешить (ссылкой). Ошибка → `toast.error`.
4. Пустое состояние: `canManage` → приглашение; иначе «Видео пока нет».
5. Монтаж в `ProjectDetail.tsx` рядом с `<ProjectFiles>` (L833; **все** типы проектов): `<ProjectVideos projectId={projectId} canManage={canManage} />`.
6. **(опц., W9-hardening) CSP:** `frame-src` whitelist в `next.config.ts` (см. гоча 9).

**Verification.**
```bash
npx tsc --noEmit
npm run build   # НЕ при живом dev
```
Ручной смок (**после** apply 066 гейтом): секция «Видео» → добавить youtu.be/VK/Rutube → плеер 16:9; Я.Диск → карточка-ссылка; удалить (confirm, canManage); без canManage — только просмотр.

### КОММИТ 2
```bash
npx tsc --noEmit && npm run build && git add -A && git commit -m "feat(video-embed): хук + секция «Видео» (embed через parseVideoUrl на рендере, confirm-delete, гейт canManage) + CSP frame-src"
git push -u origin feat/video-embed
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА
`npx tsc --noEmit` (0) · `npx vitest run` · `npm run build` (не при живом dev) · push → PR. **Мёрж в main — ПОСЛЕ apply 066 гейтом.**

## Для гейта Cowork
1. `list_migrations` → `apply_migration('066_project_videos', …)` → `get_advisors` (RLS-покрытие, unindexed FK, TO authenticated).
2. **RLS-смок симуляцией JWT (матрица):**
   - **владелец проекта, org-member, НЕ в project_members** — SELECT видит ✅ (B1-кейс), INSERT ✅;
   - участник (member) — SELECT видит ✅, INSERT в чужой проект (не владелец) → **42501**;
   - посторонний (не член, не owner/admin, не владелец) — SELECT **0**;
   - org owner/admin — INSERT/DELETE ✅.
   Транзакция+rollback.
3. Только после apply — мёрж feat/video-embed → main. Обновить `docs/schema.md` + crm-architect schema (W9).

## Не выходить за скоуп
Только видео проекта. НЕ трогать: `ProjectFiles`/storage, realtime, загрузку видео-файлов (embed/ссылки only), плейлисты/таймкоды. Hard delete, без soft-delete. Провайдеры сверх youtube/vk/rutube → `other` (ссылка).
