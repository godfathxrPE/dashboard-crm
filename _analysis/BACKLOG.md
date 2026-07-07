# dashboard-crm — бэклог хвостов (обновлено 2026-07-07)

## Блокеры-ожидания
- [x] **Anthropic credits** (done 2026-07-07) — баланс пополнен, S28 живой: финальный смок
      пройден (резюме по звонкам/встречам генерируются), injection-тест расширен до
      6 сценариев и прогнан — 6/6 PASS, включая false-positive-проверку.
      Артефакт гейта: `_analysis/injection-test-s28.md`.
- [x] **Гейт-хвосты S28** (done 2026-07-07): негативные HTTP-смоки 6/6 PASS
      (`_analysis/smoke-s28-negative.sh`: no-auth 401, bad-json/entity-type/uuid 400,
      anon-not-user 401, GET 405); advisors — только известный by-design набор WARN,
      ничего нового от 028/029. Кейс user+nonexistent→404 — при e2e-инвайте (USER_JWT).
- [x] **Гейт-хвосты S29** (done 2026-07-07, SQL-сторона): `automation_runs` корректен
      (1 строка, task_id проставлен, идемпотентность выдержала пинг-понги); битое
      правило не блокирует переход, его runs-строка откатывается субтранзакцией;
      `is_active=false` молчит; тестовые данные вычищены (5 боевых правил).

## Технические хвосты
- [x] **S29.1 — чеврон детальной страницы IIoT → stage_id** (done): `StackedPipeline`
      переписан на `stage_id` (треки из `phase_group` в `pipeline_stages`, без хардкода
      названий), пишет только `stage_id`, гейт-баннер S27 переиспользован, бейдж
      стадии/probability на детальной — из `stage_id`. Гейт S27 и автоматизация S29
      теперь работают и на детальной IIoT. tsc/build чистые.

- [ ] **Легаси-читатели `projects.stage` (переключить на stage_id, S30+)** — после
      S29.1 чеврон IIoT больше не пишет legacy `stage`, поэтому у сделок, двигаемых
      чевроном, legacy застывает. Читатели, которые ещё держатся за него (риск
      застаревания UI-меток; не переключал вслепую — точечная работа):
      - `ProjectsTable.tsx` — track-фильтры `track_prep/exp/proj` + колонка «трек»
        через `getTrack(p.stage)` (legacy-only, треков 3 vs 4 phase_group в БД).
      - `ContactDetailHub.tsx` — фильтр `p.stage !== 'lost'` + метки стадии
        (`STAGE_CONFIG[p.stage]`).
      - `CommandPalette.tsx` — sub-строка результата = `p.stage`.
      - `ProjectCard.tsx` / `ProjectPeekContent.tsx` — метка/probability/цвет фазы
        с **fallback** на legacy (primary уже stage_id — низкий приоритет).
      - `ProjectDetail.tsx` — чек-лист готовности `{ key:'stage', filled:!!project.stage }`
        (заменить на `!!project.stage_id`); dead `handleAdvance/handleRevert`
        (пишут legacy `stage`, в рендере не вызываются — удалить при выносе).
- [ ] **Полный вынос legacy `stage` + 3-track хардкода** (после переключения всех
      читателей): убрать записи legacy из ERP-`DealProgressBar`/`ProjectModal`/
      lost-handling (сейчас пишут `stage` в синхроне со `stage_id`), затем
      DROP-кандидат колонки `projects.stage` + enum `deal_stage` + `STAGE_CONFIG`/
      `stage-mapping` утиль. Реверс-маппинг `stage → stage_id` в БД не делаем.
- [ ] **Meetings: description не попадает в AI-контекст** (S28, минорно —
      функция берёт только notes).
- [ ] **Real e2e инвайта** (S26): пригласить реальный второй аккаунт через
      Team-страницу, пройти signup → membership. Смоки эмулировали
      apply_pending_invites напрямую, полный путь auth.users-триггера жив,
      но живым юзером не проверен.

## Принятые риски / отложено
- **Leaked password protection** — Pro-only, принятый риск до апгрейда.
  Митигация: password min length 12 (Authentication → Password requirements,
  Free) + фактически invite-only signup. При выходе к внешним клиентам → Pro
  (бэкапы/PITR важнее тумблера).
- **Активности как тип гейт-требования** (S27 v2).
- **Email 2-way sync** — S30+, вместе с Telegram; после первых пользователей.
- **file-требование гейта не различает label** (любой файл сделки удовлетворяет
  и «КП», и «Договор») — v2: категория файла в project_files.
