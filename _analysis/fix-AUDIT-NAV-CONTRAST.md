# Claude Code Prompt — fix: `audit-contrast.py` не проверяет активный пункт нава у 6 тем из 8

**Ветка:** `fix/audit-nav-contrast`
**Размер:** один файл, один цикл. Разметку и темы НЕ трогать.

## Почему

При визуальной приёмке t-lime (PR #45) нашлось глазами то, что обязан был поймать скрипт:
активный пункт навигации рисовался лаймовой иконкой на лаймовой пилюле — **1.29:1**.

Причина в самом аудите. Пара `nav-active / sidebar-bg` считается только для `t-washi`
и `t-fuji` — у них цвет активного пункта захардкожен в скрипте (`#E8E2D8` / `#C4AA78`).
У остальных шести тем пара не считается вообще, и «0 FAIL» для них означает
«эту пару не проверяли», а не «она проходит».

`.nav-active` есть у всех восьми тем: layered-дефолт в `@layer components`
(`background: var(--accent-l)`, `color: var(--accent)`, `.lucide { color: var(--accent) }`),
поверх него unlayered-переопределения у `t-minimal` и `t-lime`.

## РАЗВЕДКА

```bash
git status --short && git log --oneline -1

# 1. Текущая ветка про nav-active в скрипте
grep -n -B6 -A6 "nav-active" scripts/audit-contrast.py

# 2. Layered-дефолт .nav-active
grep -n -A3 "Sidebar active" src/app/globals.css

# 3. Кто из тем переопределяет актив нава unlayered
grep -n "aside\[data-app-nav\] .nav-active" src/app/globals.css

# 4. Токены, из которых темы берут актив
grep -n "sidebar-indicator\|sidebar-active-text" src/app/globals.css

# 5. Базовая линия: сколько пар и FAIL сейчас
python3 scripts/audit-contrast.py 2>&1 | grep "==="
```

Ожидание: у `t-minimal` и `t-lime` есть unlayered-правила `aside[data-app-nav] .nav-active`,
у остальных шести актив берётся из layered-дефолта; все восемь тем сейчас `0 FAIL`.

## ЗАДАЧА: считать пару для всех восьми тем

Файл `scripts/audit-contrast.py`, участок, где сейчас добавляется
`add('nav-active / sidebar-bg', …)` только для washi и fuji.

Разрешение цветов **по фактическому каскаду**, а не по одному токену:

- **фон активного пункта** — `--sidebar-indicator`, если тема его задаёт непрозрачным;
  иначе layered-дефолт `--accent-l` (композитить альфу на фон сайдбара);
- **фон сайдбара** — как сейчас (`--sidebar-bg`, при отсутствии — `--surface`);
- **текст и иконка активного пункта** — `--sidebar-active-text`, при отсутствии —
  layered-дефолт `--accent`;
- хардкод `#E8E2D8` / `#C4AA78` для washi/fuji **сохранить**: там цвет задан
  компонентным правилом, а не токеном, — но оформить как явное исключение
  с комментарием, а не как единственную ветку.

Считать **две** пары на тему: `nav-active-text / nav-active-bg` (порог 4.5)
и `nav-active-bg / sidebar-bg` (порог 3.0, `kind='ui'` — это граница элемента,
а не текст).

Прогнать. **Все восемь тем должны остаться `0 FAIL`.** Если какая-то падает —
не глушить проверку и не подгонять порог: сообщить, какая тема и на какой паре,
и остановиться. Реальный провал здесь — находка, а не помеха.

### Verification

```bash
python3 scripts/audit-contrast.py 2>&1 | grep "==="
python3 -c "
import json; d=json.load(open('scripts/audit-contrast-results.json'))
for t,v in d.items():
    n=[p['pair'] for p in v['pairs'] if 'nav-active' in p['pair']]
    print(t, n)
"
```

Ждём: у каждой из восьми тем в списке по две пары `nav-active`.

## ТЕСТЫ

Тестов нет: `audit-contrast.py` — сам по себе проверочный инструмент, его
результат и есть тест. Критерий приёмки — вывод обеих команд из Verification.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
python3 scripts/audit-contrast.py 2>&1 | grep "==="
git diff --stat   # ровно один файл: scripts/audit-contrast.py
```

## КОММИТ

```bash
git add scripts/audit-contrast.py scripts/audit-contrast-results.json
git commit -F - <<'MSG'
fix(audit): контраст активного пункта нава считается у всех восьми тем

Пара nav-active / sidebar-bg считалась только для washi и fuji, где цвет
захардкожен в скрипте. У остальных шести «0 FAIL» означало «не проверяли»:
именно так лаймовая иконка на лаймовой пилюле (1.29:1) прошла аудит t-lime
и нашлась глазами при визуальной приёмке PR #45.

Цвета разрешаются по фактическому каскаду — токены темы с падением на
layered-дефолт .nav-active; хардкод washi/fuji оставлен явным исключением.
MSG
```
