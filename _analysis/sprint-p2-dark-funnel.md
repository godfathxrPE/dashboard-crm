# Claude Code Prompt — Sprint P2: Тёмные фазовые цвета → секвенциальный ramp (D1)

Тёмные темы (frost/aurora/tidal) делят одну «радугу» на фазовых токенах
`--track-*-current`: зелёный `#059669` / фиолет `#7c3aed` / жёлтый / розовый
`#db2777` — мимо палитры каждой темы и категориально там, где стадии
воронки **упорядочены** (Привлечение→Закрытие). Меняем на секвенциальный
ramp в тоне акцента каждой темы (вариант B color-architect: светлота + дрейф
тона по «своей» дуге). Значения по OKLCH, каждое проверено ≥3:1 против
фактической тёмной поверхности, монотонная светлота, пол ≈ нынешней яркости
точек (регрессии по одиночным маркерам нет).

**Только `--track-*-current` в трёх тёмных блоках. `-done` не трогать
(done-сегменты берут `var(--border2)`). Светлые темы (aura/minimal/washi/fuji
и др.) не трогать.**

> Блэйст-радиус шире воронки. `--track-*-current` — это фазовый цвет-ЗАЛИВКА
> по всему приложению: воронки /analytics и /overview, точки-маркеры на
> ProjectCard/PipelineBoard/StageBoard/StackedPipeline, delivery-фазы. Текст
> лейблов НЕ трогается — он давно на отдельных `*-text`-токенах
> (`--accent-text` и т.д.), поэтому планка тут 3:1 (графобъект), не 4.5:1.
> Смок обязан пройтись по этим поверхностям, не только по /analytics.

Чекаут: `feat/deal-card` (после P1 `2aa9fff`). Миграций нет.

---

## РАЗВЕДКА

```bash
git log --oneline -1
# подтвердить блоки и ТОЧНЫЙ текущий текст (для str_replace — важен пробельный формат):
grep -n '^\.t-frost {\|^\.t-aurora {\|^\.t-tidal {' src/app/globals.css
sed -n '80,83p'   src/app/globals.css   # frost  track-current
sed -n '113,116p' src/app/globals.css   # aurora track-current
sed -n '147,150p' src/app/globals.css   # tidal  track-current
```

Ожидаемое (все три блока имеют одинаковые prep/exp/proj-current и различаются
только nego — поэтому заменяем блок ЦЕЛИКОМ, не отдельный хекс):

```
frost  L80-83 : prep #059669 · exp #7c3aed · nego #F0C45E · proj #db2777
aurora L113-16: prep #059669 · exp #7c3aed · nego #ffe060 · proj #db2777
tidal  L147-50: prep #059669 · exp #7c3aed · nego #b8a058 · proj #db2777
```

> ⚠️ НЕ делать глобальный replace по `#059669`/`#7c3aed`/`#db2777` — они
> байт-в-байт одинаковы во всех трёх тёмных блоках, но новые значения РАЗНЫЕ
> per-theme. Каждый 4-строчный блок уникален через свою nego-строку — по ней
> и матчить. Если live-пробелы отличаются от сниппетов ниже (напр. двойной
> пробел после `#3b0764;`) — брать точный текст из РАЗВЕДКИ.

---

## ЗАДАЧА: заменить 12 `--track-*-current` (3 блока × 4)

Три str_replace — по одному на тему, каждый матчит весь 4-строчный блок
(меняется только значение `-current`, `-done` сохраняется).

### FROST (индиго→циан)

old:
```css
  --track-prep-done: #14532d; --track-prep-current: #059669;
  --track-exp-done: #3b0764;  --track-exp-current: #7c3aed;
  --track-nego-done: #78350f; --track-nego-current: #F0C45E;
  --track-proj-done: #500724; --track-proj-current: #db2777;
```
new:
```css
  --track-prep-done: #14532d; --track-prep-current: #5381C4;
  --track-exp-done: #3b0764;  --track-exp-current: #339CEB;
  --track-nego-done: #78350f; --track-nego-current: #08BAF8;
  --track-proj-done: #500724; --track-proj-current: #5CD7F4;
```

### AURORA (фиолет→маджента)

old:
```css
  --track-prep-done: #14532d; --track-prep-current: #059669;
  --track-exp-done: #3b0764;  --track-exp-current: #7c3aed;
  --track-nego-done: #451a03; --track-nego-current: #ffe060;
  --track-proj-done: #500724; --track-proj-current: #db2777;
```
new:
```css
  --track-prep-done: #14532d; --track-prep-current: #7E6ED3;
  --track-exp-done: #3b0764;  --track-exp-current: #A974F7;
  --track-nego-done: #451a03; --track-nego-current: #D283FF;
  --track-proj-done: #500724; --track-proj-current: #F1A4F7;
```

### TIDAL (бирюза→аква)

old:
```css
  --track-prep-done: #14532d; --track-prep-current: #059669;
  --track-exp-done: #3b0764;  --track-exp-current: #7c3aed;
  --track-nego-done: #422006; --track-nego-current: #b8a058;
  --track-proj-done: #500724; --track-proj-current: #db2777;
```
new:
```css
  --track-prep-done: #14532d; --track-prep-current: #3B9373;
  --track-exp-done: #3b0764;  --track-exp-current: #23AD90;
  --track-nego-done: #422006; --track-nego-current: #15C5B1;
  --track-proj-done: #500724; --track-proj-current: #62DAD6;
```

Проверка после замены:
```bash
# должно остаться 0 старых значений в тёмных блоках:
sed -n '80,83p;113,116p;147,150p' src/app/globals.css | grep -c '#059669\|#7c3aed\|#db2777'   # → 0
# новые на месте (по одному на тему):
grep -c '#5381C4\|#7E6ED3\|#3B9373' src/app/globals.css   # → 3
```

---

## СПРАВКА: итоговая палитра (OKLCH-secuential, всё ≥3:1 / монотонно)

| тема | Привлечение | Проработка | Согласование | Закрытие |
|------|------------|-----------|--------------|----------|
| frost  | `#5381C4` 4.0:1 | `#339CEB` 5.4:1 | `#08BAF8` 7.1:1 | `#5CD7F4` 9.5:1 |
| aurora | `#7E6ED3` 4.1:1 | `#A974F7` 5.3:1 | `#D283FF` 6.9:1 | `#F1A4F7` 9.3:1 |
| tidal  | `#3B9373` 4.8:1 | `#23AD90` 6.5:1 | `#15C5B1` 8.3:1 | `#62DAD6` 10.8:1 |

Контраст против фактических поверхностей frost `#1E2130` / aurora `#171B27` /
tidal `#0C1813`. Все solid hex — на dark не просвечивает.

---

## СМОК

На каждой из трёх тёмных тем (frost, aurora, tidal):

- **/analytics** — воронка «Сделки по фазам»: 4 бара идут ramp'ом в тоне темы
  (муть→ярко), НЕ радуга; frost синий, aurora фиолет, tidal бирюза;
- **/overview** — фазовый чарт (OverviewCharts) читается тем же ramp'ом;
- **карточка delivery-проекта** (напр. «Аграрная группа») — точка-маркер фазы
  окрашена из нового набора, ранняя фаза видна (не тусклее прежней);
- **pipeline/stage board** — точки-маркеры заголовков фаз в тон темы;
- лейблы фаз (текст) — прежний цвет (на `*-text`-токенах), не изменились.

Одна светлая тема (напр. aura или minimal) — фазовые цвета НЕ изменились
(правки только в тёмных блоках).

```bash
npx tsc --noEmit   # 0 (CSS-only, TS не затронут)
```

## КОММИТ

```bash
git add src/app/globals.css
git commit -m "feat(themes): тёмные фазовые цвета → секвенциальный ramp в тоне акцента (frost/aurora/tidal), уходим от общей радуги"
```

НЕ пушить без подтверждения. Миграций нет.
