# Sprint LEAD-HUB-2: карточка лида и рабочие поверхности — СКЕЛЕТ

⚠️ Черновик-скелет. Финализировать в полный промпт **после гейта LEAD-CORE-1**
(нужны применённые 117–119, регенерённые типы и фактический номер следующей миграции).

## Состав

**Миграция N: `entity_timeline` — ветка `lead`.**
Взять живое тело (112–115, keyset-пагинация) и добавить точечно:
`src_calls` / `src_tasks` — `or (p_entity_type = 'lead' and X.lead_id = p_entity_id)`;
`src_activity` — `al.lead_id = p_entity_id`; в `case` parent_type ветку `lead` ПЕРВОЙ
(лидовый звонок после конверсии получает contact_id — parent должен остаться лидом
только пока сущность-родитель запрошена как лид). `src_meetings`/`src_projects`/`src_ai`
для лида не расширяются (v1). Обновить клиентские `lib/timeline/rpc-adapter.ts` /
`kind-meta.ts` / `open-event.ts` — parent_type `lead` → маршрут `/leads/[id]`.

**Страница `src/app/(dashboard)/leads/[id]/page.tsx`.**
Лёгкий лейаут (НЕ клон ProjectDetail):

1. Шапка: title + степпер статусов new → contacted → qualified → converted
   (disqualified — терминальная ветка с причиной; действия те же, что на карточке канбана).
2. Фокус-панель (паттерн DealFocusPanel, InlineEdit): следующий шаг + дата /
   температура / SLA-индикатор (staleness из `lib/constants/leads.ts` + дни в статусе
   от `first_contacted_at`).
3. Квалификация: боль, бюджет, роль контакта, ЧЗ-группы + бейдж «маркировка
   обязательна через N мес.» (по `regulatory_deadline`), оценка суммы.
4. Активность: `EntityTimeline entityType="lead"` + `ActivityComposer`
   (comment_added с `lead_id`) + кнопки +Звонок (defaultLeadId) / +Задача (lead_id).
5. Для converted-лида — read-only с ссылкой «К сделке».

**Чистка `?lead=` хака.** Peek href в LeadsView → `/leads/${id}`; deep-link эффект
и `handledLeadParam`-костыль удалить; `?lead=<id>` → redirect на новую страницу
(старые ссылки не ломать). CommandPalette: лиды в поиске → страница (разведка: сейчас
лидов в палитре нет — добавить по образцу сделок, две точки правки).

**TodayView: секция «Лиды без реакции».** new старше суток ИЛИ просроченный
`next_action_date`; primary-действие «Связаться» (status contacted), secondary —
открыть карточку. Паттерн секции «Остывают» (W2b).

**Analytics: блок «Лиды».** Конверсия по источникам (converted/total на source),
медиана времени первого касания (`first_contacted_at - created_at`), причины
дисквалификации. Всё на клиенте из уже загружаемых лидов — без RPC (порог пересмотра
как у segment-eval: ~5000 строк).

**LeadConversionModal:** предзаполнить `deal_amount` из `estimated_value / 100`,
`deal_title` из `title`.

## Не забыть

- Peek живёт на `/leads` — страница [id] его не убирает, только href меняется.
- `next_action_date` — date; календарные сравнения через `mskDateKey`, не `::text`.
- Новая страница — НЕ новый раздел (сайдбар/section-colors/орбы не трогаются),
  но ContentHeader должен отдать заголовок для route `/leads/[id]` — проверить маппинг.
- `useEntityRuns`/AI для лидов — вне скоупа (транскриптов у лида нет до звонков;
  вернуться после накопления данных).
