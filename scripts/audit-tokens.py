#!/usr/bin/env python3
"""Контракт токенов dashboard-crm — сторож в CI (S-TOKENS-CONTRACT-1).

Запуск из корня репо:
    python3 scripts/audit-tokens.py            # сводка, exit 1 при находках
    python3 scripts/audit-tokens.py --report   # все находки без обрезки

Зачем. Правило «никаких хардкод-цветов, только токены темы» до сих пор жило
только в памяти агента (crm-architect/references/theme-system.md) и проверялось
глазами. Дефект Fuji это показал: позиционный селектор
`.t-fuji .flex.gap-1.border-b > button:nth-child(5)` прятал пятую вкладку ЛЮБОЙ
полосы с теми же классами, месяц никто не замечал, нашлось случайно.

Семь правил — R1..R7, см. RULES ниже. Раздел памяти:
crm-architect/references/theme-system.md → «Контракт токенов».

Зависимостей нет намеренно: скрипт бежит в CI, где ставится только npm-окружение.
"""

from __future__ import annotations

import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'src')
CSS_PATH = os.path.join(SRC, 'app', 'globals.css')

# ═══════════════════════════════════════════════════════════════════════
# Реестр законных исключений
# ═══════════════════════════════════════════════════════════════════════
# Не «отключить проверку», а СПИСОК С ОБОСНОВАНИЕМ: почему хардкод именно
# здесь законный. Запись без внятной причины превращает сторожа в декорацию —
# если цвет описывает интерфейс, а не данные/чужую тему, его надо чинить, а не
# вносить сюда. Тот же список таблицей — в theme-system.md, «Контракт токенов»;
# держать синхронно.
#
# Формат: (путь от корня репо, правило, причина)
ALLOWLIST = [
    ("src/lib/constants/themes.ts", "R1",
     "свотчи тем: цвет ЧУЖОЙ темы нельзя выразить токеном текущей — "
     "getComputedStyle отдаёт только активную. Единственный источник свотчей"),
    ("src/components/layout/TextNavSidebar.tsx", "R1",
     "sectionColor: словарь цветов разделов, единый для всех семи тем "
     "(навигация опознаётся цветом одинаково в любой теме)"),
    ("src/components/projects/PipelineBoard.tsx", "R1",
     "канжи фаз Washi: тема-специфичный словарь; rgba для них запрещена отдельно"),
    ("src/components/dashboard/DashboardHome.tsx", "R1",
     "WASHI_KPI_META — тот же словарь канжи Washi, что в PipelineBoard; "
     "рендерится только при theme === 't-washi'"),
    ("src/components/widgets/TasksSidebar.tsx", "R1",
     "WASHI_KPI — тот же словарь канжи Washi, только при theme === 't-washi'"),
    ("src/components/analytics/Charts.tsx", "R1",
     "AURA_DONUT/AURA_PHASE — палитра данных (серии), не темы. Плюс "
     "floodColor='#1a1a2e' у aura-glow: SVG-фильтр, var() в presentation-"
     "атрибуте не гарантирован"),
    ("src/components/analytics/CallsChart.tsx", "R1",
     "AURA_DONE/AURA_PENDING — серии чарта, палитра данных"),
    ("src/lib/constants/chat-avatars.ts", "R1",
     "CHANNEL_GRADIENTS: цвет = ИДЕНТИЧНОСТЬ канала, аватар обязан опознаваться "
     "одинаково в любой теме; контрасты посчитаны и подписаны в самом файле"),
    ("src/components/shared/StageTimeRing.tsx", "R1",
     "'#000' — стоп CSS-маски (radial-gradient в mask): значение важно только "
     "альфой, цветом на экране не становится ни в одной теме"),
    ("src/lib/watermark-gradients.ts", "R1",
     "градиенты водяных знаков виджетов — декоративная палитра, не токены темы"),
]

# ═══════════════════════════════════════════════════════════════════════
# Правила
# ═══════════════════════════════════════════════════════════════════════
RULES = {
    "R1": "хардкод #rrggbb / #rgb в src/**/*.{ts,tsx} вместо токена темы",
    "R2": "Tailwind-палитра (bg-gray-100 и т.п.) вместо токена темы",
    "R3": "альфа-модификатор на -l/-l2-токене (он уже полупрозрачен → процент от процента)",
    "R4": "hover:elevation-N — утилита elevation не реагирует на hover:",
    "R5": "ручная сборка листа вместо класса .sheet",
    "R6": "позиционный :nth-child в тема-фиксе без именованного якоря [data-*]",
    "R7": "прямой font-family на тема-селекторе вместо --font-app",
}

RE_HEX = re.compile(r'(?<![0-9a-zA-Z_])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')

RE_TW_PALETTE = re.compile(
    r'\b(?:bg|text|border|ring|from|to|via)-'
    r'(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|'
    r'teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b'
)

RE_ALPHA_ON_L = re.compile(
    r'-(?:accent|red|green|yellow|blue|purple|teal|danger|success|warning|info)-l2?/\d+'
)

RE_HOVER_ELEVATION = re.compile(r'hover:elevation-\d')

RE_MANUAL_SHEET = re.compile(r'bg-surface\s+border\s+border-border\s+rounded-(?:xl|lg)')

# Часть селектора, являющаяся КОРНЕМ темы: `.t-fuji`, `html.t-aura`, `:root.t-washi`.
# Именно на корне прямой font-family перебивает html и ломает --font-app
# (см. комментарий у `.t-fuji { --font-app: ... }` в globals.css).
RE_THEME_ROOT = re.compile(r'^[a-z:\-]*\.t-[a-z0-9-]+$')


class Finding:
    __slots__ = ("rule", "path", "line", "snippet")

    def __init__(self, rule, path, line, snippet):
        self.rule = rule
        self.path = path
        self.line = line
        self.snippet = snippet.strip()[:120]


# ═══════════════════════════════════════════════════════════════════════
# Чтение исходников
# ═══════════════════════════════════════════════════════════════════════
def strip_ts_comments(text: str) -> str:
    """Гасит содержимое // и /* */ пробелами, сохраняя переводы строк.

    Номера строк не съезжают, строковые литералы (включая className и hex в
    JSX-атрибутах) остаются нетронутыми. Благодаря этому файлы, где hex живёт
    ТОЛЬКО в комментарии (WeekLanes, BoardColumn), не нужно вносить в реестр —
    сторож их просто не видит.
    """
    out = []
    i, n = 0, len(text)
    state = None  # None | 'line' | 'block' | quote char
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ''
        if state is None:
            if c == '/' and nxt == '/':
                state = 'line'; out.append('  '); i += 2; continue
            if c == '/' and nxt == '*':
                state = 'block'; out.append('  '); i += 2; continue
            if c in '\'"`':
                state = c; out.append(c); i += 1; continue
            out.append(c); i += 1; continue
        if state == 'line':
            out.append('\n' if c == '\n' else ' ')
            if c == '\n':
                state = None
            i += 1; continue
        if state == 'block':
            if c == '*' and nxt == '/':
                state = None; out.append('  '); i += 2; continue
            out.append('\n' if c == '\n' else ' '); i += 1; continue
        # внутри строкового литерала — содержимое сохраняем как есть
        if c == '\\':
            out.append(c)
            if i + 1 < n:
                out.append(text[i + 1])
            i += 2; continue
        if c == state:
            state = None
        out.append(c); i += 1; continue
    return ''.join(out)


def strip_css_comments(text: str) -> str:
    out = []
    i, n = 0, len(text)
    in_comment = False
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ''
        if not in_comment:
            if c == '/' and nxt == '*':
                in_comment = True; out.append('  '); i += 2; continue
            out.append(c); i += 1; continue
        if c == '*' and nxt == '/':
            in_comment = False; out.append('  '); i += 2; continue
        out.append('\n' if c == '\n' else ' '); i += 1; continue
    return ''.join(out)


def source_files():
    """Все .ts/.tsx под src/, кроме сгенерированных типов."""
    skip_names = {'supabase.gen.ts'}
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d not in ('node_modules', '__pycache__')]
        for fn in sorted(filenames):
            if not fn.endswith(('.ts', '.tsx')) or fn in skip_names:
                continue
            full = os.path.join(dirpath, fn)
            yield os.path.relpath(full, ROOT).replace(os.sep, '/'), full


def css_rules(text: str):
    """(селектор, номер первой строки селектора, декларации) для каждого не-@ правила.

    Разбор по скобкам, а не построчно: селектор может занимать несколько строк
    (`.t-aura h1,\\n.t-aura .aura-page-title {`), и построчный греп такой случай
    разрывает.
    """
    buf = []
    line = 1
    stack = []
    for ch in text:
        if ch == '{':
            raw = ''.join(buf)
            sel = raw.strip()
            head = raw[:len(raw) - len(raw.lstrip())]
            sel_line = line - (raw.count('\n') - head.count('\n'))
            stack.append((sel, sel_line))
            buf = []
        elif ch == '}':
            decls = ''.join(buf)
            if stack:
                sel, sel_line = stack.pop()
                if sel and not sel.startswith('@'):
                    yield sel, sel_line, decls
            buf = []
        else:
            buf.append(ch)
            if ch == '\n':
                line += 1


# ═══════════════════════════════════════════════════════════════════════
# Проверки
# ═══════════════════════════════════════════════════════════════════════
def scan_sources():
    """R1..R5 — по .ts/.tsx (комментарии погашены)."""
    found = []
    line_rules = (
        ("R1", RE_HEX),
        ("R2", RE_TW_PALETTE),
        ("R3", RE_ALPHA_ON_L),
        ("R4", RE_HOVER_ELEVATION),
        ("R5", RE_MANUAL_SHEET),
    )
    for rel, full in source_files():
        with open(full, encoding='utf-8') as f:
            code = strip_ts_comments(f.read())
        for lineno, raw in enumerate(code.split('\n'), 1):
            for rule, rx in line_rules:
                if rx.search(raw):
                    found.append(Finding(rule, rel, lineno, raw))
    return found


def check_r6(rules):
    """Позиционный селектор в тема-фиксе без именованного якоря.

    Номер допустим только внутри `[data-*]`: `.t-fuji [data-activity-tabs] >
    button:nth-child(5)` привязан к конкретной полосе, а тот же селектор по
    классам ловит ЛЮБУЮ полосу — ровно так и потерялась пятая вкладка Fuji.
    """
    out = []
    for sel, line, _decls in rules:
        if '.t-' not in sel:
            continue
        if ':nth-child(' not in sel and ':nth-of-type(' not in sel:
            continue
        if '[data-' in sel:
            continue
        out.append(Finding("R6", "src/app/globals.css", line, ' '.join(sel.split())))
    return out


def check_r7(rules):
    """Прямой font-family на КОРНЕ темы вместо объявления --font-app.

    Проверяется именно корень (`.t-fuji`, `html.t-aura`): на нём прямой
    font-family перебивает `html { font-family: var(--font-app) }` и ломает
    единственную точку смены шрифта. Скоупленное правило вида
    `.t-aura h1 { font-family: Unbounded }` — законный дисплейный шрифт
    заголовков, оно корень не перебивает.
    """
    out = []
    for sel, line, decls in rules:
        parts = [p.strip() for p in sel.split(',') if p.strip()]
        if not parts or not all(RE_THEME_ROOT.match(p) for p in parts):
            continue
        if re.search(r'(?<!-)\bfont-family\s*:', decls):
            out.append(Finding("R7", "src/app/globals.css", line, ' '.join(sel.split())))
    return out


def scan_css():
    if not os.path.exists(CSS_PATH):
        return []
    with open(CSS_PATH, encoding='utf-8') as f:
        text = strip_css_comments(f.read())
    rules = list(css_rules(text))
    return check_r6(rules) + check_r7(rules)


# ═══════════════════════════════════════════════════════════════════════
# Реестр и вывод
# ═══════════════════════════════════════════════════════════════════════
def allowed(finding):
    for path, rule, _reason in ALLOWLIST:
        if finding.path == path and finding.rule == rule:
            return True
    return False


def main(argv):
    report = '--report' in argv
    findings = scan_sources() + scan_css()

    kept, waived = [], []
    for f in findings:
        (waived if allowed(f) else kept).append(f)

    limit = None if report else 5
    print("Контракт токенов — scripts/audit-tokens.py")
    print("Раздел памяти: crm-architect/references/theme-system.md → «Контракт токенов»")
    print()
    for rule in sorted(RULES):
        hits = [f for f in kept if f.rule == rule]
        waived_n = len([f for f in waived if f.rule == rule])
        tail = f"  (в реестре исключений: {waived_n})" if waived_n else ""
        mark = "FAIL" if hits else "ok  "
        print(f"{mark} {rule}  {len(hits):3d}  {RULES[rule]}{tail}")
        shown = hits if limit is None else hits[:limit]
        for f in shown:
            print(f"        {f.path}:{f.line}  {f.snippet}")
        if limit is not None and len(hits) > limit:
            print(f"        … ещё {len(hits) - limit} (--report покажет все)")

    print()
    print(f"Итого: {len(kept)} находок вне реестра, "
          f"{len(waived)} в реестре ({len(ALLOWLIST)} записей).")
    if kept:
        print("Хардкод цвета вместо токена ломает переключение тем. Если случай "
              "законный — внеси его в ALLOWLIST с причиной, а не отключай правило.")
        return 1
    print("Контракт соблюдён.")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
