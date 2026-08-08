// supabase/functions/tg-probe/index.ts — S-TG-1, ШАГ 0 (GO/NO-GO).
//
// ⚠️ ОДНОРАЗОВАЯ. УДАЛИТЬ СРАЗУ ПОСЛЕ ОТВЕТА — вместе со строкой в config.toml.
//
// ЗАЧЕМ ОНА ЕСТЬ. Весь эпик Telegram стоит на одном непроверенном допущении:
// `api.telegram.org` достижим ИЗ РЕГИОНА SUPABASE EDGE. Из документации это не
// выводится, а `curl` с макбука отвечает на другой вопрос — у машины разработчика
// и у Supabase разные маршруты.
//
// ПОЧЕМУ ПРОБА ЛЕЖИТ В РЕПО, А НЕ ВЫПОЛНЕНА. Деплой edge-функций вне полномочий
// Claude Code (мутаторы Supabase MCP закрыты `deny`), поэтому ответить на вопрос
// в спринте физически нечем. Тот же случай уже был — «ВОПРОС №1» в шапке
// webhook-dispatch/index.ts, — и решался так же: код, дающий ответ, едет в репо,
// ответ получает гейт. Проба деплоится ПЕРВОЙ, до `telegram-send`/`telegram-webhook`
// и до apply 107.
//
// ЧТЕНИЕ РЕЗУЛЬТАТА:
//   { "ok": true, "bot": "<username>" }         → GO, продолжаем эпик;
//   { "ok": false, "kind": "network", ... }     → NO-GO: сеть/DNS/таймаут. Запасной
//                                                 путь — релей через n8n, это другая
//                                                 архитектура и другой спринт;
//   { "ok": false, "kind": "telegram", ... }    → до Telegram дошли, он отказал.
//                                                 Это НЕ NO-GO по сети: почти всегда
//                                                 неверный или незаведённый токен.
//
// `verify_jwt = true` — новых открытых миру endpoint'ов ради пробы не заводим.
// Токен наружу не отдаётся ни при каком исходе.

const REQUEST_TIMEOUT_MS = 10_000;

Deno.serve(async (): Promise<Response> => {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

  if (!botToken) {
    return Response.json(
      { ok: false, kind: 'config', error: 'TELEGRAM_BOT_TOKEN не задан в Function Secrets' },
      { status: 200 },
    );
  }

  const startedAt = Date.now();

  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const elapsedMs = Date.now() - startedAt;
    const body = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { username?: string };
    };

    if (resp.status === 200 && body.ok === true) {
      return Response.json(
        { ok: true, bot: body.result?.username ?? null, elapsedMs },
        { status: 200 },
      );
    }

    return Response.json(
      {
        ok: false,
        kind: 'telegram',
        status: resp.status,
        description: body.description ?? null,
        elapsedMs,
      },
      { status: 200 },
    );
  } catch (e) {
    // Таймаут, DNS, отказ в соединении — то самое, ради чего проба и написана.
    return Response.json(
      {
        ok: false,
        kind: 'network',
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        elapsedMs: Date.now() - startedAt,
      },
      { status: 200 },
    );
  }
});
