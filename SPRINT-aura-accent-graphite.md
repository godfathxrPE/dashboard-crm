# Claude Code Prompt — Sprint: Aura accent → Графит (орб остаётся янтарным)

Контекст: тема `t-aura` (Torii CRM). Меняем **функциональный акцент** (кнопки, ссылки, текст, focus-ring, pipeline-трек «Подготовка») с янтаря на **графит**. **Атмосферный орб Дашборда остаётся янтарным** — это осознанное решение (тёплая атмосфера + спокойный нейтральный UI). Per-section цвета других разделов (фиолет/синий/бирюза) НЕ трогаем.

Все правки — ТОЛЬКО внутри `.t-aura` в `src/app/globals.css`. Другие 9 тем не трогать. Контрасты ниже проверены `scripts/contrast.py` — все ≥4.5 AA, многие ≥8:1.

---

## РАЗВЕДКА (выполнить первыми)

```bash
cd ~/Downloads/dashboard-crm

# 1. Текущие янтарные accent-токены (строки ~223-253)
grep -nE "#C77A1E|199, ?122, ?30|#935A00|#FCEBD4|track-prep|--accent" src/app/globals.css | sed -n '1,30p'

# 2. Орб и pill-text Дашборда (ОСТАЮТСЯ ЯНТАРНЫМИ — не трогать)
grep -nE "aura-orb-1|aura-pill-text|data-section=\"leads\"|data-section=\"projects\"" src/app/globals.css

# 3. Орб-палитра в JS (ОСТАЁТСЯ — не трогать)
grep -nE "dashboard:|leads:|projects:" src/components/layout/AuraOrbs.tsx

# 4. baseline
npx tsc --noEmit 2>&1 | tail -3
```

---

## ЧТО МЕНЯЕМ vs ЧТО ОСТАЁТСЯ

| Токен | Было (янтарь) | Стало (графит) |
|-------|---------------|----------------|
| `--accent` | `#C77A1E` | `#484D57` |
| `--accent-l` | `rgba(199,122,30,0.09)` | `rgba(72,77,87,0.09)` |
| `--accent-l2` | `rgba(199,122,30,0.16)` | `rgba(72,77,87,0.16)` |
| `--accent-text` | `#935A00` | `#343840` |
| `--track-prep-done` | `#FCEBD4` | `#EBEDF1` |
| `--track-prep-current` | `#C77A1E` | `#484D57` |

**ОСТАЮТСЯ ЯНТАРНЫМИ (НЕ ТРОГАТЬ):**
- `--aura-orb-1: 199, 122, 30` на `.t-aura [data-section]` и на `[data-section="leads"]/[data-section="projects"]`
- `dashboard/leads/projects` орб-палитра в `AuraOrbs.tsx` (`[[0.78,0.48,0.12], ...]`)
- `--aura-pill-text` — остаётся `var(--accent-text)`. ВАЖНО: теперь это графит на янтарной подложке пилюли → проверено 10.09:1 ✓ (даже лучше прежнего янтаря 4.87:1).

---

## ЗАДАЧА 1: Заменить accent-токены в `.t-aura`

В `src/app/globals.css`, блок `.t-aura { ... }` (~стр.223-231):

```
// БЫЛО:
  --accent: #C77A1E;  --accent-l: rgba(199,122,30,0.09);  --accent-l2: rgba(199,122,30,0.16);
  ...
  --accent-text: #935A00;  /* H69  5.67:1 / 4.94:1 */

// СТАЛО:
  --accent: #484D57;  --accent-l: rgba(72,77,87,0.09);  --accent-l2: rgba(72,77,87,0.16);
  ...
  --accent-text: #343840;  /* графит H265 C0.015 — text/бел 11.76:1, text/page 10.25:1 */
```

> Комментарии-«сироты» про янтарные ratio (`/* H69 5.67 ... */`) обновить на графитовые значения, чтобы не вводить в заблуждение будущий аудит.

---

## ЗАДАЧА 2: Pipeline-трек «Подготовка» → графит-pastel

В `.t-aura` (~стр.253):

```
// БЫЛО:
  --track-prep-done: #FCEBD4; --track-prep-current: #C77A1E;

// СТАЛО:
  --track-prep-done: #EBEDF1; --track-prep-current: #484D57;
```

> Напоминание: в `StackedPipeline.tsx` (после прошлого спринта) prep-трек уже использует `--accent-text` для done-текста. Графит-текст `#343840` на графит-pastel `#EBEDF1` = 10.03:1 ✓. Менять компонент не нужно — он подхватит токены.

---

## ЗАДАЧА 3 (проверочная, без правок): убедиться, что орб не задет

После правок выполнить:
```bash
grep -nE "aura-orb-1: 199" src/app/globals.css   # должно остаться 2 вхождения (data-section + leads/projects)
grep -nE "0.78, 0.48, 0.12" src/components/layout/AuraOrbs.tsx  # dashboard/leads/projects орб цел
```
Если орб-значения изменились — откатить, они НЕ входят в скоуп.

---

## Контраст-матрица (проверено scripts/contrast.py)

```
text #343840 / белый ............. 11.76:1  AAA
text #343840 / страница #EFEFF3 ... 10.25:1  AAA
белый / fill #484D57 (кнопка) ..... 8.49:1   AAA
графит-текст / янтарная пилюля ..... 10.09:1  AAA  (орб остаётся янтарным!)
графит-текст / графит-pastel done .. 10.03:1  AAA
текст на accent-l тинте ............ 9.15:1   AAA
```

---

## КОММИТ

```bash
npx tsc --noEmit 2>&1 | tail -3   # чисто
git add src/app/globals.css
git commit -m "feat(aura): акцент янтарь→графит (орб Дашборда остаётся янтарным)"
```

> Скоуп: только `src/app/globals.css`. `AuraOrbs.tsx` НЕ коммитить (он не должен меняться). После коммита — проверка рендера в браузере (Дашборд: янтарный орб + графитовые кнопки/KPI-trend; Проект: графитовый prep-трек; тёмная тема — не сломалось).
