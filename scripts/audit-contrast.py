#!/usr/bin/env python3
"""Contrast audit for dashboard-crm themes (из визуального аудита 12.07.2026).

Запуск из корня репо:  python3 scripts/audit-contrast.py
Парсит блоки переменных всех тем из src/app/globals.css, считает WCAG 2.2
ratio + APCA Lc (SAPC-4g) для целевых пар. Обе реализации провалидированы
на канонических значениях (#767676/#fff = 4.54; APCA #888/#fff = 63.06).

ВАЖНО: скрипт считает по токенам. CSS opacity на контейнерах он не видит —
эффективный цвет текста под opacity = fg*op + bg*(1-op) (см. SPRINT п.1.4).
Для компонентных проверок использовать live-замер в DevTools.

Результат: audit-contrast-results.json + сводка FAIL в stdout.
"""
import re, json, math, sys, os

CSS_PATH = os.path.join(os.path.dirname(__file__), '..', 'src', 'app', 'globals.css')
CSS = open(CSS_PATH).read()

# ---------- color parsing ----------
def parse_color(s):
    s = s.strip()
    m = re.match(r'#([0-9a-fA-F]{6})$', s)
    if m:
        h = m.group(1)
        return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), 1.0)
    m = re.match(r'#([0-9a-fA-F]{3})$', s)
    if m:
        h = m.group(1)
        return (int(h[0]*2,16), int(h[1]*2,16), int(h[2]*2,16), 1.0)
    m = re.match(r'rgba?\(([^)]+)\)$', s)
    if m:
        p = [float(x) for x in m.group(1).split(',')]
        return (p[0], p[1], p[2], p[3] if len(p) > 3 else 1.0)
    if s == 'white': return (255,255,255,1.0)
    if s == 'black': return (0,0,0,1.0)
    return None

def composite(fg, bg):
    """fg rgba over opaque bg rgb -> opaque rgb"""
    a = fg[3]
    return tuple(fg[i]*a + bg[i]*(1-a) for i in range(3))

def rel_lum(rgb):
    def f(c):
        c /= 255.0
        return c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
    r,g,b = rgb[:3]
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b)

def wcag(fg_rgb, bg_rgb):
    l1, l2 = rel_lum(fg_rgb), rel_lum(bg_rgb)
    hi, lo = max(l1,l2), min(l1,l2)
    return (hi+0.05)/(lo+0.05)

# ---------- APCA (SAPC-4g / APCA-W3 0.0.98G-4g) ----------
def apca_lc(txt, bgd):
    """txt, bgd: opaque sRGB tuples 0-255. Returns Lc."""
    def scrn(rgb):
        return 0.2126729*(rgb[0]/255.0)**2.4 + 0.7151522*(rgb[1]/255.0)**2.4 + 0.0721750*(rgb[2]/255.0)**2.4
    Ytxt, Ybg = scrn(txt), scrn(bgd)
    # soft clamp black
    blkThrs, blkClmp = 0.022, 1.414
    def clamp(Y):
        return Y if Y > blkThrs else Y + (blkThrs - Y)**blkClmp
    Ytxt, Ybg = clamp(Ytxt), clamp(Ybg)
    deltaYmin, scale = 0.0005, 1.14
    loConThresh, loConFactor, loConOffset = 0.035991, 27.7847239587675, 0.027
    if abs(Ybg - Ytxt) < deltaYmin:
        return 0.0
    if Ybg > Ytxt:  # normal polarity (dark text on light bg)
        sapc = (Ybg**0.56 - Ytxt**0.57) * scale
        out = 0.0 if sapc < 0.001 else (sapc - loConOffset if sapc >= loConThresh else sapc - sapc*loConFactor*loConOffset)
    else:  # reverse polarity
        sapc = (Ybg**0.65 - Ytxt**0.62) * scale
        out = 0.0 if sapc > -0.001 else (sapc + loConOffset if sapc <= -loConThresh else sapc - sapc*loConFactor*loConOffset)
    return out * 100.0

# ---------- OKLCH ----------
def srgb_to_oklch(rgb):
    def lin(c):
        c /= 255.0
        return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
    r,g,b = [lin(c) for c in rgb[:3]]
    l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
    m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
    s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b
    l_, m_, s_ = l**(1/3), m**(1/3), s**(1/3)
    L = 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_
    a = 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_
    bb = 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
    C = math.hypot(a, bb)
    H = math.degrees(math.atan2(bb, a)) % 360
    return (round(L,4), round(C,4), round(H,1))

# ---------- parse theme blocks ----------
def extract_block(selector):
    # match `selector {` then capture until matching close at same nesting (blocks are flat)
    m = re.search(re.escape(selector) + r'\s*\{(.*?)\n\}', CSS, re.S)
    return m.group(1) if m else None

def parse_vars(block):
    out = {}
    for m in re.finditer(r'--([\w-]+)\s*:\s*([^;]+);', block):
        out[m.group(1)] = m.group(2).strip()
    return out

# :root claude fallback vars (two :root blocks)
root_vars = {}
for m in re.finditer(r':root\s*\{(.*?)\n\}', CSS, re.S):
    root_vars.update(parse_vars(m.group(1)))

themes = {}
theme_selectors = {
    't-scandi': '.t-scandi', 't-frost': '.t-frost', 't-paper': '.t-paper',
    't-sand': '.t-sand', 't-aurora': '.t-aurora', 't-tidal': '.t-tidal',
    't-aura': '.t-aura', 't-washi': '.t-washi', 't-fuji': '.t-fuji',
}
for name, sel in theme_selectors.items():
    block = extract_block(sel)
    if block is None:
        print(f'WARN no block for {sel}', file=sys.stderr); continue
    v = dict(root_vars)  # cascade: :root fallback
    v.update(parse_vars(block))
    themes[name] = v

# scandi dark (prefers-color-scheme)
m = re.search(r'@media \(prefers-color-scheme: dark\)\s*\{\s*\.t-scandi\s*\{(.*?)\n  \}', CSS, re.S)
if m:
    v = dict(themes['t-scandi']); v.update(parse_vars(m.group(1)))
    themes['t-scandi-dark'] = v

def resolve(theme, name, depth=0):
    """resolve var name (without --) to color tuple, following var() refs"""
    v = themes[theme].get(name)
    if v is None or depth > 5: return None
    v = v.strip()
    mm = re.match(r'var\(--([\w-]+)(?:,\s*(.+))?\)$', v)
    if mm:
        r = resolve(theme, mm.group(1), depth+1)
        if r is None and mm.group(2):
            return parse_color(mm.group(2))
        return r
    return parse_color(v)

def opaque(theme, name, under='bg'):
    """resolve var to opaque rgb, compositing over theme bg if alpha<1"""
    c = resolve(theme, name)
    if c is None: return None
    if c[3] >= 1: return c[:3]
    base = resolve(theme, under)
    if base is None or base[3] < 1:
        base = (255,255,255,1)
    return composite(c, base[:3])

# text token with a11y fallback: var(--X-text, var(--X))
def text_token(theme, base):
    c = resolve(theme, base + '-text')
    if c is None:
        c = resolve(theme, base)
    return c

results = {}
for th in themes:
    T = {}
    bg = opaque(th, 'bg')
    surface = opaque(th, 'surface', 'bg')
    surface2 = opaque(th, 'surface2', 'bg')
    surface3 = opaque(th, 'surface3', 'bg')
    text = opaque(th, 'text', 'bg')
    tdim = opaque(th, 'text-dim', 'bg')
    tmute = opaque(th, 'text-mute', 'bg')
    border = opaque(th, 'border', 'bg')
    border2 = opaque(th, 'border2', 'bg')
    accent = opaque(th, 'accent', 'bg')
    pairs = []
    def add(label, fg, bgc, kind='text', size='normal'):
        if fg is None or bgc is None:
            pairs.append({'pair': label, 'ratio': None, 'note': 'unresolved'})
            return
        r = wcag(fg, bgc)
        lc = apca_lc(fg, bgc)
        req = 3.0 if (kind=='ui' or size=='large') else 4.5
        pairs.append({'pair': label,
                      'fg': '#%02x%02x%02x' % tuple(round(x) for x in fg),
                      'bg': '#%02x%02x%02x' % tuple(round(x) for x in bgc),
                      'ratio': round(r,2), 'apca': round(lc,1),
                      'req': req, 'pass': r >= req, 'kind': kind})
    # core text pairs
    for surf_name, surf in [('bg',bg), ('surface',surface), ('surface2',surface2), ('surface3',surface3)]:
        add(f'text / {surf_name}', text, surf)
        add(f'text-dim / {surf_name}', tdim, surf)
        add(f'text-mute / {surf_name}', tmute, surf)
    # semantic text tokens (as used by .text-X class) on bg & surface
    for c in ['accent','green','red','blue','yellow','purple']:
        tok = text_token(th, c)
        if tok is not None:
            toko = composite(tok, bg) if tok[3] < 1 else tok[:3]
            add(f'text-{c} (resolved) / bg', toko, bg)
            add(f'text-{c} (resolved) / surface', toko, surface)
            # badge: text-X on X-l tint over surface
            tint = resolve(th, c + '-l')
            if tint is not None:
                tint_o = composite(tint, surface) if tint[3] < 1 else tint[:3]
                add(f'text-{c} / {c}-l badge', toko, tint_o)
    # solid buttons: text on solid fill.
    # Компонентная модель overrides из globals.css:
    #  - aura: bg-X перекрашен в X-text, текст остаётся белым;
    #  - frost/aurora/tidal: текст перекрашен в цвет фона темы (visual-audit P0 1.3);
    #  - scandi/scandi-dark: кнопки outline (прозрачный фон, color: var(--text)) —
    #    пара «white/bg-X» не применима, помечаем override (НЕ FAIL).
    DARK_BTN_TEXT = {'t-frost': (13,16,32), 't-aurora': (10,14,26), 't-tidal': (8,15,13)}
    for c in ['accent','green','red','blue','purple']:
        if th in ('t-scandi', 't-scandi-dark'):
            pairs.append({'pair': f'white / bg-{c} solid (button)', 'ratio': None,
                          'note': 'override: scandi buttons are outline (color: var(--text)) — N/A'})
            continue
        if th == 't-aura':
            fill = text_token(th, c)
        else:
            fill = resolve(th, c if c != 'accent' else 'accent')
        btn_text = DARK_BTN_TEXT.get(th, (255,255,255))
        if fill is not None:
            fillo = composite(fill, bg) if fill[3] < 1 else fill[:3]
            label = 'dark' if th in DARK_BTN_TEXT else 'white'
            add(f'{label} / bg-{c} solid (button)', btn_text, fillo)
    # UI non-text: border vs surface
    add('border / surface (ui)', border, surface, kind='ui')
    add('border2 / surface (ui)', border2, surface, kind='ui')
    add('accent / bg (ui: focus ring, icons)', accent, bg, kind='ui')
    # sidebar frames (washi/fuji)
    sb = opaque(th, 'sidebar-bg')
    if sb is not None and th in ('t-washi','t-fuji'):
        sbt = resolve(th, 'sidebar-text')
        if sbt: add('sidebar-text / sidebar-bg', composite(sbt, sb), sb)
        sbd = resolve(th, 'sidebar-text-dim')
        if sbd: add('sidebar-text-dim / sidebar-bg', composite(sbd, sb), sb)
        # nav-active
        act = resolve(th, 'accent') if th=='t-washi' else parse_color('#C4AA78')
        if act: add('nav-active / sidebar-bg', composite(act, sb) if act[3]<1 else act[:3], sb)
    T['pairs'] = pairs
    # OKLCH of key colors
    T['oklch'] = {}
    for c in ['accent','green','red','blue','yellow','purple']:
        col = opaque(th, c, 'bg')
        if col: T['oklch'][c] = srgb_to_oklch(col)
    results[th] = T

out_path = os.path.join(os.path.dirname(__file__), 'audit-contrast-results.json')
json.dump(results, open(out_path,'w'), indent=1, ensure_ascii=False)

# summary: failures only
for th, T in results.items():
    fails = [p for p in T['pairs'] if p.get('ratio') is not None and not p['pass']]
    print(f'\n=== {th}: {len(fails)} FAIL of {len([p for p in T["pairs"] if p.get("ratio")])} ===')
    for p in fails:
        print(f"  {p['pair']}: {p['fg']} on {p['bg']} = {p['ratio']}:1 (req {p['req']}) APCA {p['apca']}")
