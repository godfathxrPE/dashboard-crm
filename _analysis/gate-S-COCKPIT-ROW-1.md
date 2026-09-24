# Гейт S-COCKPIT-ROW-1 — PR #121 (`1411db5`)

**24.09.2026.** Работа `293b9f4` от `b87c08e`, squash → `1411db5`. Спринт —
`_analysis/sprint-S-COCKPIT-ROW-1.md` (вход пересверен #120). Миграций нет.

## Итог

Принято.

## Что проверено

- Дифф (5 файлов, +664/−111): `PipelineCockpit` разведён на `LegacyRow` (лид, `gauge === null`,
  прежний код; единственное изменение — `map` узлом или функцией, обе формы обработаны) и
  `CockpitRow` (сделка). Сверка HTML лида до/после байт-в-байт в cobalt и washi — у исполнителя.
- Временная подмена нормы через query-параметр в коммит не попала: в диффе нет `searchParams`,
  `location`. `localStorage` — только в `readMapChoice`/`writeMapChoice`, оба в `try/catch`.
- `--shadow-accent`: фолбэк в базовом `:root` до блоков тем (от акцента темы), washi — внутри
  `.t-washi` после `:root`; rgba кобальта не скопирован.
- Container query: `.cockpit-row` контейнер, мини-карта скрыта по умолчанию и видна с 45rem.
  Хардкод-цветов нет (`#E7C25A` макета не перенесён).
- Линзы: базовая ✓ · design ✓ (токены, washi, лист на внедрении) · a11y ✓ (шевроны
  `aria-expanded`; мини-карта и шкала `aria-hidden` — данные есть текстом в ячейке и `metaRight`) ·
  security/api/supabase — n/a.

## Находки

- 🟡 L-1: две ветки в `PipelineCockpit` (~750 строк) — осознанная цена нулевой регрессии лида.
- 🟡 P-4 заметнее со шкалой: до загрузки настроек ячейка показывает дефолтную норму — в
  `fix-S-STAGE-PROFILE-2`.
- 🟢 ok/warn живьём не посмотреть: все 16 открытых сделок просрочены; проверено подменой нормы.
- 🟢 Supabase `Lock broken … 'steal'` и подвисания у исполнителя — та же картина, что медленный
  REST гейта #113; повторяется — кандидат в отдельный разбор.

## Verification

```
Type Safety:            PASS (tsc чистый у исполнителя, дифф прочитан)
RLS Coverage:           NOT_APPLICABLE
Backward Compatibility: PASS (лид — прежний код, HTML совпал)
Runtime Tested:         PASS у исполнителя (3 ширины, washi, лид, внедрение); прод — после деплоя
Regional Availability:  NOT_APPLICABLE
```
