# Claude Code Prompt — S-REL-1: релизы, CHANGELOG, README, гигиена истории

**Контекст.** Аудит 21.08: в репо 0 тегов и нет CHANGELOG при 77% conventional commits —
история есть, но точек отката и «что вошло в версию» нет. README описывает 7 миграций
из 125 — первое, что увидит второй человек в проекте, неправда. Две git-идентичности
(godfathxrPE / Oleg) шумят в статистике.

**Зависимость:** выполнять ПОСЛЕ мержа S-CI-1 (бейдж CI уже в README, README правим здесь).

**Инструмент:** git-cliff (генерация changelog из conventional commits). Не release-please:
тот заточен под GitHub App и автоматические release-PR — для соло-проекта с ручным мержем
это лишний контур. git-cliff — локальная команда без внешних зависимостей.

## РАЗВЕДКА

```bash
git tag | wc -l                             # ожидаем 0
ls cliff.toml CHANGELOG.md 2>/dev/null      # ожидаем: нет обоих
git log --oneline -3                        # текущий HEAD
git shortlog -sne | head -5                 # какие email у godfathxrPE и Oleg — нужны для .mailmap
npx git-cliff --version 2>&1 | tail -1      # доступен ли git-cliff через npx
grep -n "SQL Editor" README.md              # устаревшая инструкция, которую убираем
```

Если `npx git-cliff` не работает (нет сети/пакета) — остановись на ЗАДАЧЕ 1 и напиши
в отчёте; остальные задачи выполняй.

## ЗАДАЧА 1: git-cliff конфиг + первый CHANGELOG

### Context
Conventional commits уже есть — changelog собирается бесплатно. Русские заголовки
коммитов — норм, git-cliff языконезависим.

### Steps
1. Создай `cliff.toml`:

```toml
[changelog]
header = "# Changelog — dashboard-crm\n\n"
body = """
{% if version %}## {{ version }} — {{ timestamp | date(format="%d.%m.%Y") }}
{% else %}## Unreleased
{% endif %}
{% for group, commits in commits | group_by(attribute="group") %}
### {{ group }}
{% for commit in commits %}- {{ commit.message | split(pat="\n") | first }}
{% endfor %}
{% endfor %}
"""
trim = true

[git]
conventional_commits = true
filter_unconventional = false
tag_pattern = "v[0-9]*"
sort_commits = "newest"

[[git.commit_parsers]]
message = "^feat"
group = "Фичи"

[[git.commit_parsers]]
message = "^fix|^hotfix"
group = "Исправления"

[[git.commit_parsers]]
message = "^refactor"
group = "Рефакторинг"

[[git.commit_parsers]]
message = "^docs|^memory"
group = "Документация"

[[git.commit_parsers]]
message = "^chore|^style|^design|^polish|^test|^debug|^wip"
group = "Прочее"

[[git.commit_parsers]]
message = ".*"
group = "Прочее"
```

2. Сгенерируй: `npx git-cliff -o CHANGELOG.md`

### Verification
```bash
head -30 CHANGELOG.md      # секция Unreleased с группами Фичи/Исправления
wc -l CHANGELOG.md         # сотни строк — вся история попала
```

## ЗАДАЧА 2: .mailmap

### Context
Две идентичности размазывают `git shortlog` и любую статистику.

### Steps
Создай `.mailmap` в корне, подставив **реальные email из разведки** (git shortlog -sne):

```
Oleg <ОСНОВНОЙ_EMAIL> godfathxrPE <EMAIL_godfathxrPE>
Oleg <ОСНОВНОЙ_EMAIL> Oleg <EMAIL_Oleg_если_другой>
```

Основной — тот, что настроен сейчас: `git config user.email`.

### Verification
```bash
git shortlog -sn | head -3   # должна остаться одна строка Oleg (+ Cowork Gate)
```

## ЗАДАЧА 3: README привести к реальности

### Context
README инструктирует «выполни 7 миграций руками в SQL Editor» — устарел на 118 миграций
и противоречит контракту (миграции применяет гейт).

### Steps
Перепиши `README.md`, сохранив бейдж CI из S-CI-1 сверху. Структура:

- Заголовок + бейдж + одна строка: что это (CRM: PM + сделки + аналитика, соло-проект)
- Стек одной строкой (Next.js 15 App Router · TS strict · Tailwind · Supabase · Vercel)
- Quick Start: `npm install` → `.env.local` из example → `npm run dev`
- Миграции: **ничего руками**; ссылка на контракт — `CLAUDE.md`, раздел «Жёсткие правила».
  Схема — `docs/schema.md`, применяет гейт
- Тесты: `npm run test` (unit), `npm run test:e2e` (playwright, нужен запущенный dev)
- Структура: 3–5 строк (src/app, src/components/{domain}, src/lib/hooks, supabase/)
- Ссылки: `CLAUDE.md` (контракт), `_analysis/` (спринты и аудиты), `improvements/` (roadmap)

Не выдумывай того, чего нет в репо. Факты бери грепом, не по памяти.

### Verification
```bash
grep -c "SQL Editor" README.md    # 0
head -8 README.md                 # бейдж на месте
```

## ЗАДАЧА 4: первый тег (подготовка, БЕЗ пуша)

### Context
Точки отката по эпикам. Схема: `vYYYY.MM.N` (calver — фазы уже месячные, semver
для внутреннего продукта — ложная точность).

### Steps
1. Только команда в отчёт — **тег ставит Олег руками после мержа**:
   ```
   git tag -a v2026.08.1 -m "voice + telegram-эпик + лента S-TL + 125 миграций"
   git push origin v2026.08.1
   ```
2. В `CLAUDE.md`, в конец раздела «Конвенции», добавь строку:
   «Тег `vYYYY.MM.N` на каждый закрытый эпик; после тега — `npx git-cliff -o CHANGELOG.md`
   тем же PR.»

### Verification
```bash
grep -n "vYYYY.MM.N" CLAUDE.md
```

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npm run lint && npx tsc --noEmit && npm run test
git status --short   # только: cliff.toml, CHANGELOG.md, .mailmap, README.md, CLAUDE.md
```

## КОММИТ

Ветка `chore/rel-1` от main:

```bash
git checkout -b chore/rel-1
git add cliff.toml CHANGELOG.md .mailmap README.md CLAUDE.md
git commit -m "chore(release): git-cliff + CHANGELOG, .mailmap, актуальный README, схема тегов (S-REL-1)"
```

**Не мержить и не пушить.**

## ОТЧЁТ

Отчёт: список созданных/изменённых файлов, первые 20 строк CHANGELOG.md,
вывод `git shortlog -sn` после .mailmap, вывод финальной проверки.

---

## Действия Олега после мержа (руками)

1. Мерж `chore/rel-1` через PR — CI из S-CI-1 должен быть зелёным.
2. Поставить и запушить тег: команды из ЗАДАЧИ 4.
3. Дальше цикл: закрыл эпик → тег → `npx git-cliff -o CHANGELOG.md` → в PR эпика.
