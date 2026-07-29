import { describe, it, expect, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  checkWebhookUrl,
  classifyStatus,
  isPrivateIp,
  MAX_ATTEMPTS,
  nextRetryAt,
  nextRetryDelayMs,
  parseRetryAfterMs,
  RESPONSE_BODY_LIMIT_BYTES,
  signPayload,
  truncateBody,
} from '../../supabase/functions/webhook-dispatch/transport';
import { checkWebhookUrlShallow } from '../../src/lib/validators/webhook';

// ═══════════════════════════════════════════════════════
// S-R2-WEBHOOK-TRANSPORT — юниты 1–5 из текста спринта.
//
// Модуль транспорта чистый специально ради этих тестов: index.ts трогает
// Deno.env на верхнем уровне и из vitest не импортируется вовсе.
//
// jsdom-окружение vitest не всегда даёт globalThis.crypto.subtle — подставляем
// webcrypto из node:crypto. signPayload читает crypto ВНУТРИ функции, поэтому
// подмена работает.
// ═══════════════════════════════════════════════════════

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

const OPEN = { allowlistRequired: false } as const;

// ═══ 1. Валидатор URL ═══

describe('checkWebhookUrl — схема, хост, порт', () => {
  it('пропускает обычный https без порта', () => {
    const r = checkWebhookUrl('https://example.com/hooks/torii', OPEN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.host).toBe('example.com');
  });

  it('пропускает явный порт 443', () => {
    expect(checkWebhookUrl('https://example.com:443/x', OPEN).ok).toBe(true);
  });

  it.each([
    ['http://example.com/x', 'scheme_not_https'],
    ['ftp://example.com/x', 'scheme_not_https'],
    ['file:///etc/passwd', 'scheme_not_https'],
    ['gopher://example.com', 'scheme_not_https'],
    ['https://10.0.0.5/x', 'ip_literal_forbidden'],
    ['https://127.0.0.1/x', 'ip_literal_forbidden'],
    ['https://[::1]/x', 'ip_literal_forbidden'],
    ['https://169.254.169.254/latest/meta-data/', 'ip_literal_forbidden'],
    ['https://example.com:22/x', 'port_forbidden'],
    ['https://example.com:5432/x', 'port_forbidden'],
    ['https://user:pass@example.com/x', 'credentials_forbidden'],
    ['не-url', 'not_a_url'],
  ])('отбивает %s', (url, reason) => {
    const r = checkWebhookUrl(url, OPEN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });

  it('высокий пользовательский порт тоже запрещён — путь B уже́ арх-дока', () => {
    // §4.1 допускал «443 и высокие пользовательские», спринт сузил до 443:
    // без DNS-резолва высокие порты открывают сканирование внутренней сети.
    const r = checkWebhookUrl('https://example.com:8443/x', OPEN);
    expect(r.ok).toBe(false);
  });
});

describe('checkWebhookUrl — allowlist', () => {
  const hosts = ['hooks.example.com', 'N8N.Example.COM'];

  it('пропускает хост из списка, регистр не важен', () => {
    expect(checkWebhookUrl('https://n8n.example.com/w', { allowedHosts: hosts, allowlistRequired: true }).ok)
      .toBe(true);
  });

  it('отбивает хост вне списка', () => {
    const r = checkWebhookUrl('https://evil.example.com/w', { allowedHosts: hosts, allowlistRequired: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('host_not_allowlisted');
  });

  it('пустой список запрещает всё, когда allowlist обязателен (путь B)', () => {
    const r = checkWebhookUrl('https://example.com/w', { allowedHosts: [], allowlistRequired: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('host_not_allowlisted');
  });

  it('пустой список НЕ блокирует, когда работает резолв (путь A)', () => {
    expect(checkWebhookUrl('https://example.com/w', { allowedHosts: [], allowlistRequired: false }).ok)
      .toBe(true);
  });
});

describe('isPrivateIp — второй рубеж, уже после резолва', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1',
  ])('приватный: %s', (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700::1111'])(
    'публичный: %s',
    (ip) => expect(isPrivateIp(ip)).toBe(false),
  );

  it('неразобранное считает приватным — при сомнении не отправляем', () => {
    expect(isPrivateIp('')).toBe(true);
    expect(isPrivateIp('не-адрес')).toBe(true);
  });

  it('ведущий ноль не проходит как IPv4 — классический обход блоклиста', () => {
    // '010.0.0.1' часть резолверов читает как восьмеричное 8.0.0.1.
    expect(isPrivateIp('010.0.0.1')).toBe(true);
  });
});

describe('checkWebhookUrlShallow — валидатор формы совпадает с серверным', () => {
  it('те же вердикты на тех же адресах', () => {
    expect(checkWebhookUrlShallow('https://example.com/x')).toBeNull();
    expect(checkWebhookUrlShallow('http://example.com/x')).toBe('scheme_not_https');
    expect(checkWebhookUrlShallow('https://127.0.0.1/x')).toBe('ip_literal_forbidden');
    expect(checkWebhookUrlShallow('https://[::1]/x')).toBe('ip_literal_forbidden');
    expect(checkWebhookUrlShallow('https://example.com:22/x')).toBe('port_forbidden');
    expect(checkWebhookUrlShallow('нет')).toBe('not_a_url');
  });
});

// ═══ 2. Расписание ретраев ═══

describe('nextRetryDelayMs — 1 м / 5 м / 30 м / 2 ч / 6 ч / 24 ч, потом null', () => {
  it.each([
    [1, 60_000],
    [2, 5 * 60_000],
    [3, 30 * 60_000],
    [4, 2 * 3_600_000],
    [5, 6 * 3_600_000],
    [6, 24 * 3_600_000],
  ])('после попытки %i ждём %i мс', (attempt, expected) => {
    expect(nextRetryDelayMs(attempt)).toBe(expected);
  });

  it('после седьмой попытки ретраев нет', () => {
    expect(nextRetryDelayMs(MAX_ATTEMPTS)).toBeNull();
    expect(nextRetryDelayMs(8)).toBeNull();
  });

  it('мусорный номер попытки не даёт ретрая', () => {
    expect(nextRetryDelayMs(0)).toBeNull();
    expect(nextRetryDelayMs(-1)).toBeNull();
    expect(nextRetryDelayMs(1.5)).toBeNull();
  });

  it('nextRetryAt считает от переданного now, а не от системного времени', () => {
    const now = Date.parse('2026-07-29T10:00:00.000Z');
    expect(nextRetryAt(1, now)).toBe('2026-07-29T10:01:00.000Z');
    expect(nextRetryAt(4, now)).toBe('2026-07-29T12:00:00.000Z');
    expect(nextRetryAt(7, now)).toBeNull();
  });
});

describe('parseRetryAfterMs', () => {
  const now = Date.parse('2026-07-29T10:00:00.000Z');

  it('секундами', () => expect(parseRetryAfterMs('120', now)).toBe(120_000));
  it('HTTP-датой', () =>
    expect(parseRetryAfterMs('Wed, 29 Jul 2026 10:02:00 GMT', now)).toBe(120_000));
  it('дата в прошлом — ждать нечего', () =>
    expect(parseRetryAfterMs('Wed, 29 Jul 2026 09:00:00 GMT', now)).toBe(0));
  it('нет заголовка либо мусор — работает обычное расписание', () => {
    expect(parseRetryAfterMs(null, now)).toBeNull();
    expect(parseRetryAfterMs('  ', now)).toBeNull();
    expect(parseRetryAfterMs('скоро', now)).toBeNull();
  });
  it('обрезает по суткам — «в разумных пределах» из §5', () => {
    expect(parseRetryAfterMs('999999999', now)).toBe(24 * 3_600_000);
  });
});

// ═══ 3. Классификация ответа ═══

describe('classifyStatus', () => {
  it.each([200, 201, 202, 204, 299])('%i → доставлено', (s) =>
    expect(classifyStatus(s)).toBe('delivered'),
  );

  it.each([301, 302, 307, 308])('%i → ошибка, НЕ успех: редиректы не выполняем', (s) =>
    expect(classifyStatus(s)).toBe('failed'),
  );

  it.each([400, 401, 403, 404, 422])('%i → окончательный отказ без ретраев', (s) =>
    expect(classifyStatus(s)).toBe('failed'),
  );

  it.each([408, 429])('%i → ретрай', (s) => expect(classifyStatus(s)).toBe('retry'));

  it.each([500, 502, 503, 504])('%i → ретрай', (s) => expect(classifyStatus(s)).toBe('retry'));
});

// ═══ 4. Подпись ═══

describe('signPayload — фиксированный вектор', () => {
  // Вектор посчитан один раз node:crypto и зафиксирован: если формат подписи
  // поедет, тест упадёт раньше, чем это заметит получатель.
  const SECRET = 'torii-test-secret';
  const T = 1769000000;
  const RAW = '{"version":1,"id":"8f14e45f","event":"webhook.test"}';
  const EXPECTED = 'd20f27d46488e9f3dd25b8d1970eb48c4239fc69ddafc599cc3c1387986deceb';

  it('даёт ожидаемый hex', async () => {
    expect(await signPayload(SECRET, T, RAW)).toBe(`t=${T},v1=${EXPECTED}`);
  });

  it('формат — t=…,v1=… без пробела (схема Stripe, а не проза §3.3)', async () => {
    const sig = await signPayload(SECRET, T, RAW);
    expect(sig).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });

  it('подпись зависит от t — иначе replay-окно бессмысленно', async () => {
    expect(await signPayload(SECRET, T + 1, RAW)).not.toBe(await signPayload(SECRET, T, RAW));
  });

  it('подпись зависит от байтов тела, а не от значения объекта', async () => {
    // Тот же объект с другим порядком ключей — другая подпись. Ровно поэтому
    // тело формируется один раз строкой и не пересобирается перед отправкой.
    const reordered = '{"id":"8f14e45f","version":1,"event":"webhook.test"}';
    expect(await signPayload(SECRET, T, reordered)).not.toBe(await signPayload(SECRET, T, RAW));
  });
});

// ═══ 5. Усечение тела ответа ═══

describe('truncateBody — лимит в БАЙТАХ', () => {
  const bytes = (s: string) => new TextEncoder().encode(s).length;

  it('короткое тело не трогает', () => {
    expect(truncateBody('ok')).toBe('ok');
  });

  it('режет длинное до 8 КБ', () => {
    const out = truncateBody('a'.repeat(20_000));
    expect(bytes(out)).toBe(RESPONSE_BODY_LIMIT_BYTES);
  });

  it('кириллица считается по байтам, а не по символам', () => {
    // 10 000 символов = 20 000 байт: посимвольный срез пустил бы вдвое больше.
    const out = truncateBody('я'.repeat(10_000));
    expect(bytes(out)).toBeLessThanOrEqual(RESPONSE_BODY_LIMIT_BYTES);
    expect(out.length).toBeLessThanOrEqual(RESPONSE_BODY_LIMIT_BYTES / 2);
  });

  it('не разрывает суррогатную пару', () => {
    const out = truncateBody('😀'.repeat(10), 7);   // 4 байта на эмодзи
    expect(bytes(out)).toBeLessThanOrEqual(7);
    expect(out).toBe('😀');                          // не «половина» символа
    expect([...out].length).toBe(1);
  });

  it('лимит меньше одного символа даёт пустую строку, а не битый байт', () => {
    expect(truncateBody('😀', 2)).toBe('');
  });
});
