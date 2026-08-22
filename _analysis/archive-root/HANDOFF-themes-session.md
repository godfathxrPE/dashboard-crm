# Handoff: сессия по темам dashboard-crm (июль 2026)

Контекст для продолжения работы в новом чате. Проект: dashboard-crm
(Next.js 15 + Supabase, скилл crm-architect — project memory).

## Сделано и закоммичено

- **Sprint scandi-data-attrs** (`2505165`): структурные селекторы → data-атрибуты
  (`data-modal-overlay`, `data-modal`, `data-card`, `data-timeline-scroll`,
  `data-kanban-empty`, `data-tag`, `data-stats-grid`), z-index по иерархии
  (overlay 999 / modal 1000, глобально). theme-system.md в скилле обновлён.
- **Аура доведена в Claude Code** (`b21fece`, `bc626a5`, `26dae4b`):
  stage_id/phase_group аналитика, фиксы графиков, акцент янтарь→графит.

## Сделано в сессии (проверить, что закоммичено)

1. **A11y-пакет по всем темам**: блок «A11Y TEXT TOKENS» в конце globals.css —
   `.text-green/red/blue/yellow/purple/accent` → `var(--*-text, var(--*))`;
   исправлены `--text-mute` в 7 темах; добавлены недостающие `*-text` токены.
   Все текстовые пары ≥4.5:1 (проверено скриптом).
2. **Шрифты через next/font**: убран blocking Google Fonts link; Inter (Scandi),
   Manrope (base), IBM Plex Sans (Fuji), Onest+Unbounded (Aura) — переменные
   `--font-*` в layout.tsx.
3. **Глобальная анимация модалок**: keyframes `modalIn` на `[role="dialog"]`
   (было только в Scandi).
4. **Scandi P0/P1**: фикс невидимого текста CTA в dark (color: var(--bg));
   токены `--bracket-color/--ring-active/--ring-track` (были хардкоды
   #DDD5E2/#444/#e8e8e8, ломали dark); иерархия dim 0.66 > mute 0.56;
   статус-пилюли формой (● ○ −) + 11px; recharts 0.25→0.7 hover;
   focus-glow отключён; glass-card без лифта; focus-visible 1.5px у инпутов;
   accent-color чекбоксов; tabular-nums в td.
5. **Frosted Scandi**: токены `--frost-bg/--frost-blur`; стекло на dropdown'ах
   и sticky thead. С модалок снято по решению Олега (непрозрачный var(--bg)).
   ВАЖНО: не вешать backdrop-filter на [data-modal] — вложенный в фильтрованный
   оверлей ломает сэмплинг в Chromium (был баг с тёмной модалкой).
6. **Удалены темы**: claude (токены остались в :root как fallback), cupertino,
   keyswitch, nvg8. Guard в ThemeProvider сбрасывает устаревший localStorage
   на t-scandi. Осталось 9 тем: scandi, aura, frost, paper, sand, aurora,
   tidal, washi, fuji.

## Незакрытые хвосты (кандидаты на следующие сессии)

- **Working tree**: мои сессионные правки Ауры (дубликат .t-aura, регистрация
  #9a78ff) конфликтуют с закоммиченной графитовой версией — откатить 4 файла,
  если ещё не сделано.
- **Кнопки тёмных тем**: белый текст на accent проваливает AA
  (frost 3.22, aurora 3.74, tidal 2.46). Решение не принято: затемнять accent
  (#4a70cf / #8e55e3 / #328165) или тёмный текст на кнопках.
- **Washi nav-active**: красный торий на суми 2.65:1 — у Fuji та же роль
  решена золотом (6.61), перенести приём.
- **Exit-анимации** модалок/dropdown'ов: @starting-style +
  transition-behavior: allow-discrete.
- **--ease-spring** определён во всех темах, не используется нигде.
- **MeetingModal.tsx**: 6 pre-existing TS-ошибок — company_id/contact_id
  нет в types (миграции 012/013), нужен `npm run db:gen-types`.
- **token.json / backup.json** в корне репо — проверить .gitignore.
- Untracked SPRINT-*.md файлы — выполненные удалить, остальные в работу.

## Стратегический план развития (принят Олегом)

1. Гигиена: типы из Supabase, коммит wip, секреты из репо.
2. Аналитика воронки: конверсия лид→сделка по направлениям, cycle time,
   где зависают сделки (частично сделано в b21fece).
3. LLM-слой: транскрипт звонка → call + задачи + стадия
   (скилл llm-integration-architect).
4. Интеграции: календарь, Telegram-уведомления.
Не делать: мультипользовательность, новые темы без запроса.
