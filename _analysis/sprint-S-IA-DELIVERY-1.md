# Claude Code Prompt — Sprint S-IA-DELIVERY-1: IA карточки delivery думает как PM (default-таб План, error-copy по типу, edit-модалка delivery)

Контекст: по PM-ревью Grok (M2 + §3.1 + §3.2). Карточка внедрения открывается на «Активность» (лента заметок), а не на Плане; error-state всегда пишет «Сделка не найдена» даже для delivery/internal; delivery нельзя отредактировать модалкой (name/notes/company/owner) — только инлайн do_url. Для РП это «продукт всё ещё CRM сделок, delivery — надстройка». Три точечные правки, **миграций нет** (чистый клиент). Стек: Next 15 + TS strict + Tailwind + Supabase.

Файлы: `src/components/projects/ProjectDetail.tsx` (914 строк — НЕ распиливать, это отдельный W4b), `src/components/projects/ProjectModal.tsx`, `src/app/(dashboard)/projects/[id]/page.tsx`, `src/app/(dashboard)/deals/[id]/page.tsx`.

## РАЗВЕДКА (до правок)
```bash
cd ~/Downloads/dashboard-crm
sed -n '160,240p' src/components/projects/ProjectDetail.tsx   # tab useState(167), error-state(199-213), backHref(215), isDelivery(217)
sed -n '840,860p' src/components/projects/ProjectDetail.tsx   # <ProjectModal editProject=… /> (846)
grep -n "editProject\|project.type\|delivery\|internal\|client\|disabled\|company_id\|contact_id\|owner\|notes\|name" src/components/projects/ProjectModal.tsx | head -40
sed -n '27,120p' src/components/projects/ProjectModal.tsx      # props + поля формы + как грузит editProject
cat 'src/app/(dashboard)/projects/[id]/page.tsx' 'src/app/(dashboard)/deals/[id]/page.tsx'
grep -n "useSearchParams\|Suspense\|?tab=\|router.replace" src/components/projects/ProjectsSection.tsx 'src/app/(dashboard)/projects/page.tsx'  # референс ?tab=-паттерна
grep -n "useProjectMutations\|useUpdateProject\|update.*project" src/lib/hooks/use-projects.ts | head
```
Зафиксировать: (1) какие поля ProjectModal реально пишет и как гейтит по type; (2) есть ли у мутации проекта поддержка delivery (type не должен слетать); (3) точную сигнатуру `editProject`.

---

## ЗАДАЧА 1 — default-таб карточки зависит от типа (M2)

WHY: внедрение = план+даты+команда, лента вторична. Sales-сделке «Активность» по умолчанию ок; delivery — нет.

`ProjectDetail.tsx:167` сейчас: `const [tab, setTab] = useState<'activity'|'board'|'timeline'|'quotes'>('activity');`

HOW:
1. `project` грузится async (в момент init `useState` его ещё нет) → нельзя просто подставить в инициализатор. Ввести деривацию дефолта ПОСЛЕ загрузки:
   - объявить `const [tab, setTab] = useState<Tab | null>(null);` (Tab — вынести тип),
   - в `useEffect` при первом появлении `project` (или через `useMemo` + ленивую инициализацию): если `tab === null` → `setTab(project.type === 'delivery' ? 'board' : 'activity')`. Гвард `tab === null` чтобы не перебивать ручной выбор пользователя при рефетче.
   - в рендере таб-контента до установки (`tab === null`) — не мигать: показать спиннер-заглушку ИЛИ вычислять эффективный таб `const activeTab = tab ?? (project.type === 'delivery' ? 'board' : 'activity')` и рендерить по нему (проще, без вспышки).
2. **Deep-link `?tab=`** (по устоявшемуся паттерну репо — `ProjectsSection` + `projects/page.tsx`, `useSearchParams` требует `<Suspense>` в page): если `searchParams.tab` валиден для типа — использовать его как стартовый; `setTab` пишет `router.replace(?tab=…, {scroll:false})`. Позволяет слать ссылку прямо на «Гант» (`?tab=timeline`). Если добавляешь — оберни детальную page в `<Suspense>` (иначе билд-ошибка). **Если `?tab=` раздувает задачу — v1 без него** (только type-дефолт), deep-link отдельным nit; реши по объёму, не тащи Suspense-рефактор ради галочки.
3. Ярлык таба «board» для delivery — «План» (проверь текущую подпись; для delivery фазовая доска = План). Не ломать client/internal (у них дефолт `activity` как был).

Backward-compat: client/internal стартуют как раньше; меняется только delivery.

---

## ЗАДАЧА 2 — error-copy и «назад» по типу сущности (§3.1)

WHY: `/projects/{bad-id}` или удалённый delivery → «Сделка не найдена» + «к воронке». Подрывает routing-контракт client/delivery/internal.

Проблема: в ветке `if (error || !project)` тип неизвестен (fetch упал). Но известен **роут**: ProjectDetail монтируется на `/projects/[id]` (delivery/internal) и `/deals/[id]` (client) — оба сейчас `<ProjectDetail projectId={id} />` без контекста.

HOW:
1. Добавить проп `context: 'deal' | 'project'` в `ProjectDetail` (или `origin`). Прокинуть из страниц: `deals/[id]/page.tsx` → `context="deal"`, `projects/[id]/page.tsx` → `context="project"`.
2. В error-state использовать `context`, не хардкод:
   - `context==='deal'` → «Сделка не найдена» + «← Вернуться к воронке» → `/deals`.
   - `context==='project'` → «Проект не найден» + «← Вернуться к проектам» → `/projects` (на /projects тип delivery/internal неизвестен без фетча — обобщённое «Проект», это норм).
3. Заодно: `backHref`/`backLabel` (215–216) уже по `project.type` — оставить (там project есть). Меняем только error-ветку, где project null.

Backward-compat: happy-path не трогаем; чинится только текст ошибки + маршрут «назад» при ненайденном.

---

## ЗАДАЧА 3 — edit-модалка для delivery (§3.2)

WHY: delivery правится только инлайн (deadline/do_url). Нет одного экрана для name, notes, company/contact, owner. При опечатке в названии из spawn — трение.

`ProjectDetail.tsx:423` — карандаш под `{!isDelivery && (…)}`; ProjectModal (846) заточен под client/internal (`editProject`).

HOW (по РАЗВЕДКЕ решить объём — минимальный достаточный):
1. **Открыть карандаш для delivery:** снять гейт `!isDelivery` у edit-кнопки (423) — показывать и для delivery.
2. **ProjectModal должен принять delivery в режиме edit** без слома инвариантов:
   - `editProject.type` может быть `delivery` → форма показывает поля, релевантные delivery: **name, notes, company/contact, owner** (assignee/owner-селект как в других местах). НЕ показывать sales-специфику (стадия воронки/pipeline/direction/budget-как-сделка) — у delivery их нет/не редактируются тут. do_url/deadline остаются инлайн на карточке (не дублировать).
   - Мутация обновления НЕ должна ронять `type`/delivery-поля (`parent_deal_id`, `progress_*`, `delivery_kind`, `stage_id`). Обновлять только изменённые пользователем поля (partial update); проверить, что `useUpdateProject`/`useProjectMutations` не перетирает delivery-инварианты. Если мутация сейчас client-заточена — расширить аккуратно (assumptions явно, `NOT_VERIFIED` где рискованно).
   - Если ProjectModal внутри жёстко строит форму под client/internal (стадии, воронка) — добавить ветку по `editProject.type === 'delivery'` с нужным подмножеством полей, не ломая существующие ветки.
3. Комментарий-заглушку у кнопки (421–422 «delivery не редактирует») убрать/актуализировать.

Edge: delivery без company/contact (спавн мог не проставить) → поля пустые, не падать. Owner-смена под ролью — `canManageDelivery`/RLS уже гейтят на бэке; UI не должен показывать owner-селект тем, кто не может (свериться с существующим паттерном owner-гейта).

---

## EDGE CASES / TESTS (сценарии, не полный suite)
- Delivery-карточка открывается на «План» (board), client/internal — на «Активность» (как раньше). `?tab=timeline` (если внедрён) открывает Гант напрямую.
- `/projects/{несуществующий}` → «Проект не найден» + «к проектам»; `/deals/{несуществующий}` → «Сделка не найдена» + «к воронке».
- Delivery edit: правка name/notes/owner сохраняется; `type` остаётся `delivery`, `progress_*`/`parent_deal_id`/`stage_id` не слетают (проверить рефетчем); отмена/isDirty как в остальных модалках.
- client/internal edit — без регресса (та же модалка).

## VERIFICATION LABELS (ожидаемые)
```
Type Safety:            WARNING (проверить типы ProjectModal под delivery-ветку)
RLS Coverage:           NOT_APPLICABLE (клиент; мутация под существующей RLS проектов)
Backward Compatibility: WARNING (client/internal таб+модалка не должны регрессить — проверить смоком)
Runtime Tested:         NOT_VERIFIED (Chrome-смок)
```

## КОММИТ
Миграций нет — чистый клиент, Netlify задеплоит с пушем.
```
git add -A && git commit -m "S-IA-DELIVERY-1: default-таб delivery=План, error-copy по типу сущности, edit-модалка delivery"
```
Смок после деплоя (или локально): delivery-карточка на План; error-тексты по роуту; delivery-edit сохраняет и не роняет delivery-поля; client/internal без регресса.

---

## ПОПРАВКИ ПО РЕВЬЮ GROK (8.5/10 — учесть при исполнении, блокеров нет)

**W3 — поля `notes` НЕТ, есть `pinned_note`.** В схеме/типах колонка называется `pinned_note` (не `notes`). В задаче 3: либо поле «Заметка» → `pinned_note`, либо **v1 без заметки** (только name/company/contact/owner). Не выдумывать `notes`.

**W2 — submit строго PARTIAL (критично, иначе submit упадёт).** Zod `superRefine` (`validators/project.ts` L171–184) требует `parent_deal_id` + `delivery_kind` для type=delivery, а их в форме НЕТ → полный `...values` payload завалит валидацию/мутацию. Для delivery-edit слать ТОЛЬКО изменяемое:
```ts
await updateProject.mutateAsync({
  id: editProject.id,
  name: values.name,
  company_id: values.company_id,
  contact_id: values.contact_id,
  owner_id: values.owner_id ?? null,
  // pinned_note — если поле в форме
});
// НЕ слать type / stage_id / pipeline_id / parent_deal_id / delivery_kind / progress_*
```
`useUpdateProject` уже partial (`{id, ...updates}`) — payload просто не должен включать delivery-инварианты. Альтернатива (хуже): reset заполняет hidden parent_deal_id+delivery_kind, чтобы superRefine прошёл — но partial безопаснее.

**W1 — явная ветка `isDelivery` в ProjectModal.** Сейчас `isInternal = type==='internal'`, delivery проваливается в client-like UI (`!isInternal`) → покажет direction/стадию/бюджет как у сделки + title «Редактировать сделку».
```ts
const isDelivery = (editProject?.type ?? watch('type')) === 'delivery';
// title: «Редактировать внедрение», лейбл «Название проекта *» (как internal)
// СКРЫТЬ: direction, pipeline/stage, budget (W8!), next_step, won/loss, переключатель type
// ПОКАЗАТЬ: name, company, contact, owner (+ optional pinned_note)
```
Create-path delivery из модалки НЕ открывать (спавн только через RPC, как сейчас).

**W5 — таб через derived, без effect.** `const activeTab = tab ?? (project.type === 'delivery' ? 'board' : 'activity')`; все `tab === …` → `activeTab`. Без `useState(null)`+useEffect (нет лишнего рендера/race). Quotes-таб только для client — для delivery дефолт никогда не quotes.

**W6 — не `git add -A`.** Явно: `ProjectDetail.tsx`, `ProjectModal.tsx`, `deals/[id]/page.tsx`, `projects/[id]/page.tsx` (+ `validators/project.ts` если правится superRefine).

**W8 — budget скрыть в delivery-ветке** (иначе случайная запись бюджета).

**Проверка перед CC (Grok):** delivery-карточка стартует на board; error-copy по context; edit name сохраняет и НЕ роняет type/progress/parent; client/internal без регресса.
