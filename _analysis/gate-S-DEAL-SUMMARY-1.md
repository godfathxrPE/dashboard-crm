# Гейт S-DEAL-SUMMARY-1 — PR #130 (`d6bcc07`)

**26.09.2026.** Работа `aedf4ea` + fix `3886eb2` (гейт до мержа, `_analysis/fix-S-DEAL-SUMMARY-1.md`,
#131), squash → `d6bcc07`. Прод-деплой `dpl_HqvRRFWjHCdz7xFmMFYYNdeFVoUT` (READY), откат —
`dpl_5a1P9V78z8ZXEji5qjsVpGQPx55j`. Спринт-файл переписан 26.09 (#129). Миграций нет.

## Что сделано

- Строки «Сводки» по W9: **ИНН** (есть компания; `CopyButton`; пусто — ссылка в карточку
  компании; до ответа — `…`), **ЛПР** (первый `decision_maker` по `created_at`, «+N»; пусто —
  скролл к стейкхолдерам; жёлтая точка — только если ЛПР обязателен в воронке, тем же
  `resolveRoleSlots`, текст — из `roleCoverageSignal`), **просрочка дедлайна** чипом «−N дн.»,
  **«N дн. в работе»** у даты создания.
- Бейдж полноты → донат 22×22; счётчик прежний (Р-1), дуга = filled/total под подписью.
- `lib/domain/deal-summary.ts`: `daysInWork`, `deadlineOverdueDays`, `pickDecisionMaker` на
  `mskDateKey`/`diffDaysKey`; 13 тестов (граница суток МСК, битые даты).
- `useUpdateCompany` инвалидирует `company-legal` и `company-chz`.
- Fix до мержа: закрытая сделка (won/lost, `useIsProjectActive`) — без красного дедлайна, чипа,
  дней в работе и точки у ЛПР; `DealHeader` `text-yellow-text` (класса нет) → `text-warning-text`.

## Отступления — приняты

1. **ИНН через `useCompanyLegal`, а не переименованный `use-company-card`.** Ошибка спринт-файла:
   разведка гейта не нашла уже существующий хук реквизитов (S-DEAL-HEADER-1) — переименование
   дало бы второй запрос за тем же ИНН на одной карточке. Решение исполнителя лучше плана.
2. **Fix задача 2 (стейкхолдеры у внедрения) сетевой экономии не дала** — виджет стейкхолдеров
   на внедрении грузит тот же ключ сам. Задание гейта было неточным; вреда нет.

## Проверка

Дифф обоих коммитов прочитан целиком. Данные прода: из 9 закрытых сделок у 7 дедлайн в прошлом
— отсюда 🔴 первого захода (ложная тревога на закрытых), закрыт fix-ом.

| Где | Итог |
|---|---|
| исполнитель, localhost | ЭЙЧ ЭНД ЭН (washi), Хлебпродукт-2 (открытая просрочка «−5 дн.», «46 дн. в работе»), Дмитровские колбасы (lost — без тревоги), Зерде Фито (без компании — нет строки ИНН), внедрение «Стратек» (нет ЛПР) |
| прод после мержа | ЭЙЧ ЭНД ЭН: «7/8 полнота», ИНН 7714626332 + «копировать», ЛПР «+ Указать», «74 дн. в работе» |

**Превью упало на `next/font`** (`Cannot read properties of null (reading '1')` в Google-лоадере)
на мерж-коммите `b608bac` от `update-branch` — транзиентный сбой загрузки шрифтов, не код.
Redeploy тем же коммитом через Vercel MCP (`dpl_2cdHCNgYFw7SdKzdeQs4Kt6bSvT9`) — READY, чек
позеленел, мерж прошёл.

Линзы: базовая ✓ · design ✓ (токены, `danger-*`, `warning-text`) · a11y ✓ (aria-label/expanded
доната, SVG aria-hidden) · supabase-patterns ✓ (новых запросов у сделки нет, инвалидация) ·
security/api — n/a.

## Verification

```
Type Safety:            PASS (tsc у исполнителя и в CI)
RLS Coverage:           NOT_APPLICABLE
Backward Compatibility: PASS (счётчик полноты и его потребители не тронуты)
Runtime Tested:         PASS (localhost 5 сделок + прод)
Regional Availability:  NOT_APPLICABLE
```
