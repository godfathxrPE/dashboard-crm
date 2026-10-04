# Cold review: feat/brief-in-deal-1

**Дата:** 2026-10-04
**Ревьюер:** Grok (cold — без спринт-файла)
**Дифф:** `main...feat/brief-in-deal-1`, 10 файлов, +1274/−0 строк
**Acceptance:** в подвале «Следующего шага» — кнопка «AI-бриф» со состояниями и панелью выжимки, ручной запуск, тексты очереди автосбора, раскрытие на все сделки в localStorage
**Игнор:** в `--stat` есть `_analysis/sprint-S-BRIEF-IN-DEAL-1.2.md` — тело не читал.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Поведение соответствует acceptance | 🟡 |
| Регрессы | ✅ соседний футер и ключ `ai_runs` не ломаются |
| Доступ и RLS | ✅ запуск скрыт у viewer; RPC — существующий org-first |
| Гонки и атомарность | ✅ кнопка `disabled` на время mutate; активный прогон — `useEntityRuns` |
| Edge cases | ❌ схема URL новости; текст очереди при выключенном автосборе; календарная дата новости |

**Оценка: 78/100 (FIX).** Кнопка, панель, состояния и хранилище сходятся с acceptance; в мерж мешают сырой `href` новости и ложный текст «в очереди» при выключенном автосборе.

---

## Находки

### F1 · 🔴 · src/components/projects/DealBriefPanel.tsx:304

**Что:** новость всегда становится `<a href={news.url}>` без фильтра схемы — в том числе `javascript:`, `data:`, `ftp:` и адрес без схемы.

**Цитата:**
```diff
+              <a
+                href={news.url}
+                target="_blank"
+                rel="noopener noreferrer"
+                className="flex min-w-0 items-baseline gap-1.5 hover:underline"
+              >
+                <span className="truncate">{news.title}</span>
```

**Отказ:** `recent_news[].url = "javascript:alert(1)"` (или `"ftp://files.example/x"`, или `"example.com/n"` без схемы) → заголовок кликабелен с этим `href`. Acceptance п.3: ссылкой становится только http/https. Тот же URL в `CompanyBriefRenderer` через `safeHref` ссылкой не становится.

**Проверка:** открыть сделку с брифом, в `result.recent_news` подставить `url: "javascript:alert(1)"` (или в юните отрисовать `DealBriefPanel`); в DOM — `<a href="javascript:alert(1)">`. Сравнить с `CompanyBriefRenderer` / `safeHref('javascript:alert(1)') === undefined`.

---

### F2 · 🟡 · src/lib/domain/company-brief.ts:542

**Что:** у устаревшего брифа текст «стоит в очереди автосбора» смотрит только на `auto.reason === 'stale'` и не учитывает выключенный лимит, в отличие от веток `queued` / `failed`.

**Цитата:**
```diff
+    case 'stale': {
+      const base = 'Бриф старше 90 дней: руководство и новости могли смениться.';
+      return auto?.reason === 'stale' ? `${base} Обновление стоит в очереди автосбора.` : base;
+    }
```

**Отказ:** `organizations.settings.brief_auto_daily_limit = 0`, у компании `done`-бриф старше 90 дней. `company_brief_candidates()` всё ещё отдаёт `reason = 'stale'` (лимит в очереди не фильтруется), RPC: `reason=stale, daily_limit=0`. Панель: «Обновление стоит в очереди автосбора». Тик: `v_take := least(2, 0 − used) ≤ 0` — прогона не будет. Acceptance п.4 для отсутствия брифа в этом состоянии пишет «выключен в организации».

**Проверка:** `briefNote({ kind: 'stale', runs: runsOf({ latestDone: done91d }), auto: auto({ reason: 'stale', daily_limit: 0 }) })` содержит «очереди автосбора». Сверить с `briefNote` для `kind: 'queued'` при `daily_limit: 0` — там «выключен».

---

### F3 · 🟡 · src/components/projects/DealBriefPanel.tsx:179

**Что:** дата новости (`YYYY-MM-DD` без времени) парсится как UTC-полночь и печатается локальной зоной — западнее UTC уезжает на сутки. Грабля `learnings.md` (блок «Календарная дата ВЫВОДИТСЯ через `formatCalendarDate`»).

**Цитата:**
```diff
+function newsDate(date: string | null): string {
+  if (!date) return 'без даты';
+  const d = new Date(date);
+  return isNaN(d.getTime()) ? 'без даты' : d.toLocaleDateString('ru-RU');
+}
```

**Отказ:** `news.date = "2026-09-20"`, TZ браузера `America/Los_Angeles` → на экране «19.09.2026». Ожидание: «20.09.2026». В MSK/UTC совпадает, поэтому на проде в Москве не видно.

**Проверка:** `TZ=America/Los_Angeles node -e "console.log(new Date('2026-09-20').toLocaleDateString('ru-RU'))"` → `19.09.2026`. `formatCalendarDate('2026-09-20')` в той же зоне → `20.09.2026`.

---

## Что проверил и счёл верным

- Кнопка в левой группе футера сразу после «Шаг сделан»; без шага — после даты, просрочки и «перенесён N раз»; без `company_id` нет ни кнопки, ни панели; правая группа (касание + чип) на месте.
- Восемь `BriefKind`: `running` важнее готового; stale строго `> 90d`; `new` строго `< 14d` и `seenRunId !== id`; `lowData` при `sources.length ≤ 1`; `queued` только при `auto.reason`; сбой RPC → `auto = null` → `none`/`failed` без текстов очереди.
- `briefNote` для `queued`: лимит 0 → «выключен»; `used_today >= daily_limit` → «N из M» и «завтра»; иначе «в течение часа». Для `failed` — `retrySoon` vs «завтра».
- Раскрытие панели — один ключ `deal-brief:open`; «увиденное» — `deal-brief:seen:<companyId>`; чтение/запись в try/catch; при смене сделки без размонтирования `seen` перечитывается.
- Пока `kind === 'queued'`, интервал 60 с инвалидирует `['ai_runs','company',id]`; активный прогон уже поллит `useEntityRuns` каждые 3 с.
- `canRun`: роль известна и не `viewer`; ошибка запуска — `toast.error`; после mutate инвалидируются прогоны и auto-state; на время запроса кнопка `disabled`.
- «Весь бриф» открывает `AiRunResultModal` с `latestDone`, без смены маршрута.
- Сводка `line-clamp-3`, две первые зацепки, маркер-точка без `border-l`; разделитель — `.glass-sheet .glass-divider` с `--sheet-plate-border` (специфичность выше `.t-frost *`).
- Прогоны идут через общий ключ `['ai_runs','company',id]` с карточкой компании; `pickBriefRuns` сам сортирует и отбрасывает чужие пресеты.
- Юниты покрывают `toBriefAutoState`, пороги kind, тексты queued/failed, `pickHeadlineNews`, бросок localStorage.

---

## Чего не смог проверить

- Живой ответ `company_brief_auto_state` на проде (лимит 0 / исчерпан / `reason` NULL) — нет сессии к БД.
- Контраст разделителя `.glass-divider` во всех восьми темах в браузере.
- Что Realtime по `ai_runs` доезжает на карточке сделки; поллинг очереди — запасной путь.
- Поведение `useStartRun.isPending` при переходе на другую сделку до ответа (общий инстанс мутации в неразмонтированном `DealNextStep`).
- Прогон vitest и клик по фиче в UI в этой сессии не выполнялись.
