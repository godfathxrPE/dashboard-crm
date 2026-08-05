# Claude Code Prompt — S-HANDOFFS-1: архив хендоффов под git

Чистый housekeeping. **Ни одного файла в `src/`, `supabase/`, `crm-architect/`,
`scripts/`.** Кода не пишется, миграций нет, сборка не запускается.

Сейчас в `_analysis/` три состояния сразу: 19 хендоффов удалены с верхнего уровня,
рядом лежит непокоммиченная папка `_analysis/handoffs/` с 29 файлами, и часть новых
файлов в git не была никогда. Пока это висит в рабочем дереве, любой `git add -A`
в другом спринте затянет мусор и дубли.

**Ветка:** `chore/handoffs-archive` от свежего `main`.

---

## ЗАДАЧА 0 (ПЕРВОЙ, до всего): вернуть источник памяти

`crm-architect/` физически отсутствует в рабочем дереве — папку перенесли в
`~/.claude/skills/`, а не скопировали. В git она есть (коммиты `221474a` + `22530c2`),
но незакоммиченное удаление обязано быть снято до любого `git add`.

```bash
git status --porcelain crm-architect/     # ожидание сейчас: шесть строк " D "
git checkout -- crm-architect/
git status --porcelain crm-architect/     # ожидание после: пусто
ls crm-architect crm-architect/references
```

⚠️ Если после `checkout` вывод не пуст — **остановиться и сообщить**, дальше не идти.
Раскатка в `~/.claude/skills/` делается только через `./scripts/skill-deploy.sh`;
копировать файлы туда-сюда руками в этом спринте запрещено.

---

## РАЗВЕДКА

```bash
git status --porcelain | grep "^ D _analysis/" | wc -l    # ожидание 19
ls _analysis/handoffs/ | grep -v DS_Store | wc -l          # ожидание 29
grep -n "DS_Store\|_analysis" .gitignore
```

Установленный факт (проверять заново не нужно, но и не противоречить): все 19
удалённых файлов лежат в `_analysis/handoffs/` **побайтно идентичными** копиями.
Значит это перемещение, и git обязан оформить их как rename, а не как
«удалили 19 + добавили 19».

---

## ЗАДАЧА 1: убрать дубли до коммита

Два файла — точные копии того, что уже есть в `handoffs/` (md5 совпадают):

1. `_analysis/HANDOFF-crm-redesign-2026-07-19.md` — дубль
   `_analysis/handoffs/HANDOFF-crm-redesign-2026-07-19.md`.
2. `_analysis/handoffs/handoff-gantt-v0 copy.md` — дубль
   `_analysis/handoffs/handoff-gantt-v0.md` (артефакт Finder’а).

Перед удалением **подтвердить идентичность**, а не поверить этому файлу:

```bash
md5 _analysis/HANDOFF-crm-redesign-2026-07-19.md _analysis/handoffs/HANDOFF-crm-redesign-2026-07-19.md
md5 "_analysis/handoffs/handoff-gantt-v0.md" "_analysis/handoffs/handoff-gantt-v0 copy.md"
```

Хеши совпали — удалить оба дубля. Разошлись — **не удалять**, оставить как есть
и написать об этом в отчёте: два разных документа с похожими именами хуже потерянного.

---

## ЗАДАЧА 2: имена под конвенцию

Шесть файлов пришли из веб-интерфейса с пробелами в именах:

```
Handoff session 2026 07 27 r2 p1 entry.md
Handoff session 2026 07 28 r2 p1 closed.md
Handoff session 2026 07 31 b2 closed.md
Handoff session 2026 08 03.md
Handoff session 2026 08 04 company ai.md
Handoff-session-2026-07-26.md
```

Привести к тому же виду, что у остальных 23 — `handoff-<дата>-<тема>.md`, kebab-case,
дата `YYYY-MM-DD`:

```
handoff-2026-07-26.md
handoff-2026-07-27-r2-p1-entry.md
handoff-2026-07-28-r2-p1-closed.md
handoff-2026-07-31-b2-closed.md
handoff-2026-08-03.md
handoff-2026-08-04-company-ai.md
```

Переименование — `git mv` уже **после** `git add` перемещённых файлов (Задача 3),
либо обычным `mv` до него: важно, чтобы в итоговом дереве не осталось имён с пробелами.
Содержимое файлов не трогать вовсе.

Ещё два файла — `handoff7.md` и `handoff8.md` — переименовать **только если** внутри
есть дата или тема (посмотреть первые 15 строк каждого). Нет — оставить как есть
и отметить в отчёте: выдуманное имя хуже невнятного.

---

## ЗАДАЧА 3: коммит перемещения

`.DS_Store` уже в `.gitignore` (строка 15) — проверить, что в индекс он не лезет.

```bash
git checkout -b chore/handoffs-archive
git add -A _analysis/handoffs/ _analysis/*.md
git status --porcelain _analysis/ | head -40
```

**Контроль до коммита:**

```bash
# rename распознан, а не «удалили+добавили»
git diff --cached --find-renames --stat | tail -5
git diff --cached --name-status | grep -c "^R"     # ожидание ~19
# мусор не попал
git diff --cached --name-only | grep -c "DS_Store"  # ожидание 0
git diff --cached --name-only | grep " " || echo "OK: имён с пробелами нет"
```

Если `grep -c "^R"` заметно меньше 19 — значит переименования Задачи 2 сделаны до
`git add` и сбили сопоставление. Это не ошибка, но в отчёте написать честно: сколько
файлов git увидел как rename, сколько как delete+add.

```bash
git commit -m "chore(docs): хендоффы 40+ спринтов в _analysis/handoffs/, дубли убраны, имена в kebab-case"
```

---

## ЗАДАЧА 4: индекс архива

`_analysis/handoffs/README.md`, ≤ 40 строк. Через месяц никто не вспомнит, что внутри
`handoff7.md`.

- одна строка сверху: что это за папка и что эти файлы — **хроника, не источник истины**
  (источник — `crm-architect/` и `docs/schema.md`);
- таблица `Файл | Дата | О чём` — по одной строке на каждый, тема берётся из первого
  заголовка внутри файла, **не выдумывается**; не удалось определить — ставить `—`;
- последняя строка: новые хендоффы класть сюда сразу, а не в корень `_analysis/`.

```bash
git add _analysis/handoffs/README.md
git commit -m "docs(handoffs): индекс архива"
```

---

## ЗАДАЧА 5: отдельным коммитом — roadmap и спринт-файлы

`improvements/roadmap.md` и `_analysis/sprint-skill-in-git.md` не хендоффы, в один
коммит с архивом им нельзя. Плюс `_analysis/sprint-memory-sync.md` изменён — посмотреть
дифф и решить: правка осмысленная — коммитить, случайная — откатить.

```bash
git diff _analysis/sprint-memory-sync.md
git add improvements/roadmap.md _analysis/sprint-skill-in-git.md _analysis/chore-handoffs-archive.md
git status --porcelain
git commit -m "docs: roadmap архитектуры ценности 2026-08-05 + спринт-файлы"
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
git status --porcelain            # ожидание: пусто (кроме ignored)
ls crm-architect crm-architect/references
./scripts/skill-verify.sh || echo "расхождение памяти — раскатать skill-deploy.sh"
git log --oneline -4
```

В отчёте: сколько файлов git увидел как rename, что удалено по Задаче 1 с хешами,
итоговый список имён после Задачи 2, судьба `handoff7/8.md`, что решено по
`sprint-memory-sync.md`, вывод `skill-verify.sh`.
