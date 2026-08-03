// supabase/functions/company-lookup/index.ts — S-INN-1
//
// Автозаполнение реквизитов компании по ИНН: прокси к DaData «Подсказки»
// (метод findById/party). Функция ТОЛЬКО читает у провайдера и возвращает данные —
// в БД не пишет ни строки.
//
// Security-контур:
//  1. Запись — не здесь. Реквизиты сохраняет пользователь обычным UPDATE из формы,
//     под своим JWT и своими RLS-политиками. Поэтому service_role тут не нужен
//     ВОВСЕ и намеренно не запрашивается: у функции нет способа обойти RLS.
//  2. Доступ — `verify_jwt = true` (config.toml): шлюз отклоняет анонимов до входа
//     в функцию. Собственной проверки прав нет и не требуется — функция не отдаёт
//     ничего из БД проекта, только публичные данные ЕГРЮЛ по ИНН.
//  3. Ключ — только `Deno.env.get('DADATA_API_KEY')`. В ответы и в текст ошибок
//     не попадает; отсутствие ключа → 500 с нейтральным текстом + console.error.
//  4. Вход — строго `{ inn: string }`, формат `\d{10}|\d{12}`, иначе 400. Мусор в
//     сторону провайдера не уходит: лимит бесплатного тарифа (10k/сутки) тратится
//     только на осмысленные запросы.
//  5. Наружу — нормализованный плоский объект, не сырой payload DaData. Текст
//     ошибки провайдера (он может содержать детали ключа и тарифа) в клиента не
//     протаскивается — только `{ error: 'lookup_failed' }` и запись в лог функции.

import { INN_RE, NOT_FOUND, normalizeDadataParty } from './normalize.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DADATA_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party';

// Провайдер иногда отвечает медленно; висящий fetch держал бы воркер до таймаута
// платформы, а пользователь всё это время смотрит на спиннер кнопки.
const TIMEOUT_MS = 8000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);

  // Security №4 — строгая валидация тела.
  let payload: { inn?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Некорректное тело запроса' }, 400);
  }
  const raw = payload?.inn;
  const inn = typeof raw === 'string' ? raw.trim() : '';
  if (!INN_RE.test(inn)) {
    return json({ error: 'ИНН должен состоять из 10 или 12 цифр' }, 400);
  }

  // Security №2 — шлюз уже отсёк анонимов (verify_jwt), но без заголовка сюда
  // попасть можно только в обход конфига: отвечаем 401, а не молча работаем.
  if (!req.headers.get('Authorization')) return json({ error: 'Требуется авторизация' }, 401);

  // Security №3 — ключ только из secrets.
  const apiKey = Deno.env.get('DADATA_API_KEY');
  if (!apiKey) {
    console.error('DADATA_API_KEY is not configured');
    return json({ error: 'Поиск по ИНН временно недоступен' }, 500);
  }

  let dadataPayload: unknown;
  try {
    const resp = await fetch(DADATA_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        Authorization: `Token ${apiKey}`,
      },
      // branch_type: 'MAIN' — только головная организация. Без него по ИНН крупной
      // компании приходят десятки филиалов, и первым в списке оказывается случайный.
      body: JSON.stringify({ query: inn, branch_type: 'MAIN' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) {
      // Тело читаем ТОЛЬКО в лог: 403 по ключу и 429 по лимиту тарифа — это наши
      // эксплуатационные проблемы, пользователю о них знать нечего.
      const detail = await resp.text();
      console.error('DaData error:', resp.status, detail);
      return json({ error: 'lookup_failed' }, 502);
    }
    dadataPayload = await resp.json();
  } catch (err) {
    console.error('DaData fetch failed:', err);
    return json({ error: 'lookup_failed' }, 502);
  }

  const result = normalizeDadataParty(dadataPayload);

  // «Не найдено» — обычный 200 с found:false, а не 404: для клиента это не ошибка
  // запроса, а факт про ИНН, и обрабатывается он тостом, а не catch-веткой.
  return json(result.found ? result : NOT_FOUND);
});
