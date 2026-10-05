# Cold review: fix/brief-shape-backoff

**Дата:** 2026-10-05
**Ревьюер:** Grok (cold — без спринт-файла)
**Дифф:** `main...fix/brief-shape-backoff`, 6 файлов, +414/−17 строк
**Acceptance:** после двух последних ошибок класса `shape` компания 7 суток вне автоочереди; успех и чужие классы серию рвут; панель в `failed` говорит про две попытки и дату возврата, зеркало с SQL; прочие правила очереди и ACL те же.

В stat есть `_analysis/fix-BRIEF-SHAPE-BACKOFF.md` — не читал.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Поведение соответствует acceptance | ✅ |
| Регрессы | ✅ прежние фильтры очереди в теле 140 совпадают с 138 |
| Доступ и RLS | ✅ сигнатура и ACL как у 138, клиенту закрыта |
| Гонки и атомарность | ✅ очередь по-прежнему вычисляемая, идемпотентность тика не тронута |
| Edge cases | ✅ пустой `error`, один прогон, чужой пресет, `finished_at` null, истекшая пауза |

**Оценка: 90/100 (MERGE).** Правило паузы в SQL и в `pickBriefRuns`/`briefNote` одно, остальные ограничения очереди не переписаны.

---

## Находки

Находок нет.

---

## Что проверил и счёл верным

- Тело `company_brief_candidates()` в 140 совпадает с 138 кроме нового `NOT EXISTS` по двум последним `company_brief`. Причины `no_brief` / `stage` / `stale`, активный прогон, пауза 45 мин, лимит 2 автопопыток за сутки МСК — без изменений.
- «Две последние» в SQL — `ORDER BY created_at DESC LIMIT 2`; в TS `pickBriefRuns` сам сортирует по `created_at` desc и режет пресет. Ручные и авто — наравне (`auto_reason` не фильтруется).
- Класс — префикс `shape|` (`LIKE` / `startsWith`), не текст `EMPTY_SOURCES_TEXT`. `coalesce(error, '')` закрывает ложную паузу: `bool_and` иначе проглотил бы NULL. Прогон без текста, `upstream`/`access`/`network`, `done` среди двух последних — паузы нет.
- Отсчёт 7 суток: `max(coalesce(finished_at, created_at))` vs `now() - interval '7 days'` и `endedAt + 7 * DAY_MS` в `briefNote` — одно и то же сравнение на границе (строго `>`).
- `company_brief_auto_state()` не менялась: на паузе `reason` станет NULL, потому что кандидатов нет. Текст паузы считается из истории прогонов, а не из RPC — при живом `useEntityRuns` (без `limit`) двух строк хватает.
- Ветка `failed` в `briefNote` перехватывает активную паузу до `retrySoon`; истекшая пауза отдаёт прежние «примерно через час» / «завтра». `briefAction('failed')` и `canRun` не сужались — ручной повтор на месте.
- Реклейм тика пишет `upstream|Прогон прерван по таймауту.` — в серию `shape` не попадает.
- `CREATE OR REPLACE` без `DROP`; `STABLE` / `DEFINER` / `search_path = public, pg_temp`; `REVOKE` у `public, anon, authenticated`; `GRANT EXECUTE` только `service_role`.
- Юнит-тесты покрывают серию, обрыв `done`/`upstream`/пустой `error`, одну попытку, `finished_at` null, чужой пресет между двумя `shape`, живую и истекшую паузу в тексте.

---

## Чего не смог проверить

- Живую `schema_migrations` и тело `company_brief_candidates()` в проде (MCP `supabase_ro` без сессии) — что 140 действительно следующий номер и что replace не затрёт правку, которой нет в файле 138.
- Исполнение `NOT EXISTS (SELECT … HAVING …)` на Postgres 17.6: синтаксис для агрегата без `GROUP BY` стандартный, на живой БД не гонял.
- Поведение панели в браузере и фактический пропуск компании ближайшим `brief_auto_tick` после apply.
