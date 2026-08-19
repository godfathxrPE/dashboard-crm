// tests/unit/edge-env.test.ts — FIX tg-capture-401
//
// Помощники edge-функций, вынесенные в `_shared` именно ради этой проверки: из vitest
// не поднять ни `Deno.serve`, ни `Deno.env`, поэтому читалка окружения ходит
// параметром, а ответ шлюза приходит внутри объекта ошибки.

import { describe, expect, it } from 'vitest';
import {
  describeSecret,
  formatEnvNames,
  optionalEnv,
  requireEnv,
  resolveGatewayAuth,
  secretShape,
} from '../../supabase/functions/_shared/env.ts';
import {
  describeInvokeError,
  formatInvokeFailure,
} from '../../supabase/functions/_shared/invoke-error.ts';

const read = (env: Record<string, string>) => (name: string) => env[name];

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl';

describe('requireEnv', () => {
  it('бросает с именем переменной, если её нет', () => {
    expect(() => requireEnv('SUPABASE_URL', read({}))).toThrow(/SUPABASE_URL/);
  });

  it('бросает на пустой строке — то самое `?? \'\'`, ради которого всё затевалось', () => {
    expect(() => requireEnv('SUPABASE_SERVICE_ROLE_KEY', read({ SUPABASE_SERVICE_ROLE_KEY: '' })))
      .toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('бросает и на строке из пробелов: она тоже не ключ', () => {
    expect(() => requireEnv('K', read({ K: '   ' }))).toThrow(/K/);
  });

  it('отдаёт значение, обрезав края', () => {
    expect(requireEnv('K', read({ K: ' value ' }))).toBe('value');
  });
});

describe('optionalEnv', () => {
  it('нет и пусто — одинаково null, без подмены строкой', () => {
    expect(optionalEnv('K', read({}))).toBeNull();
    expect(optionalEnv('K', read({ K: '  ' }))).toBeNull();
  });

  it('есть — значение', () => {
    expect(optionalEnv('K', read({ K: 'v' }))).toBe('v');
  });
});

describe('secretShape', () => {
  it('различает JWT и ключи новой схемы', () => {
    expect(secretShape(JWT)).toBe('jwt');
    expect(secretShape('sb_secret_7-iyxAbCdEf')).toBe('sb_secret');
    expect(secretShape('sb_publishable_iHWkK26U')).toBe('sb_publishable');
    expect(secretShape('что-то ещё')).toBe('unknown');
  });
});

describe('describeSecret', () => {
  it('отдаёт вид и длину и НИКОГДА само значение', () => {
    const line = describeSecret('sb_secret_7-iyxAbCdEf');
    expect(line).toContain('sb_secret');
    expect(line).toContain('21 знаков');
    expect(line).not.toContain('7-iyxAbCdEf');
  });

  it('отсутствие называет отсутствием', () => {
    expect(describeSecret(null)).toBe('нет');
  });
});

describe('formatEnvNames', () => {
  it('печатает имена и длины, фильтрует по префиксу и не выдаёт значений', () => {
    const line = formatEnvNames(
      {
        SUPABASE_URL: 'https://ref.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_seven',
        ANTHROPIC_API_KEY: 'sk-ant-secret',
      },
      'SUPABASE_',
    );
    expect(line).toBe('SUPABASE_SERVICE_ROLE_KEY(15), SUPABASE_URL(23)');
    expect(line).not.toContain('sb_secret_seven');
    expect(line).not.toContain('ANTHROPIC');
  });

  it('пустое окружение называет пустым', () => {
    expect(formatEnvNames({}, 'SUPABASE_')).toContain('нет переменных');
  });
});

describe('resolveGatewayAuth', () => {
  it('берёт JWT из SUPABASE_SERVICE_ROLE_KEY, когда там действительно JWT', () => {
    const auth = resolveGatewayAuth(read({ SUPABASE_SERVICE_ROLE_KEY: JWT }));
    expect(auth.token).toBe(JWT);
    expect(auth.source).toBe('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('ключ новой схемы за JWT НЕ считает — ровно этот случай и дал 401', () => {
    const auth = resolveGatewayAuth(read({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_7-iyxAbCdEf' }));
    expect(auth.token).toBeNull();
    expect(auth.source).toBeNull();
    expect(auth.checked.join(' ')).toContain('sb_secret');
  });

  it('падает на запасной EDGE_INVOKE_JWT, когда платформенная переменная не JWT', () => {
    const auth = resolveGatewayAuth(
      read({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_7-iyx', EDGE_INVOKE_JWT: JWT }),
    );
    expect(auth.token).toBe(JWT);
    expect(auth.source).toBe('EDGE_INVOKE_JWT');
  });

  it('платформенная переменная главнее запасной, если обе JWT', () => {
    const other = `${JWT}x`;
    const auth = resolveGatewayAuth(
      read({ SUPABASE_SERVICE_ROLE_KEY: JWT, EDGE_INVOKE_JWT: other }),
    );
    expect(auth.source).toBe('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('легаси-anon-JWT годится как последний рубеж: шлюзу нужен JWT, а не роль', () => {
    const auth = resolveGatewayAuth(
      read({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_7-iyx', SUPABASE_ANON_KEY: JWT }),
    );
    expect(auth.token).toBe(JWT);
    expect(auth.source).toBe('SUPABASE_ANON_KEY');
  });

  it('заведённый руками секрет главнее anon: там роль шире, а платы за это нет', () => {
    const manual = `${JWT}x`;
    const auth = resolveGatewayAuth(
      read({ EDGE_INVOKE_JWT: manual, SUPABASE_ANON_KEY: JWT }),
    );
    expect(auth.source).toBe('EDGE_INVOKE_JWT');
  });

  it('в отчёте о проверке есть каждый кандидат и нет ни одного значения', () => {
    const auth = resolveGatewayAuth(read({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_7-iyxAbCdEf' }));
    expect(auth.checked).toHaveLength(3);
    expect(auth.checked.join(' ')).toContain('SUPABASE_ANON_KEY: нет');
    expect(auth.checked.join(' ')).not.toContain('7-iyxAbCdEf');
  });
});

describe('describeInvokeError', () => {
  it('достаёт статус и голову тела из context — их и потеряли', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response('{"code":401,"message":"Invalid JWT"}', { status: 401 }),
    });

    const failure = await describeInvokeError(error);

    expect(failure.status).toBe(401);
    expect(failure.message).toContain('non-2xx');
    expect(failure.bodyHead).toContain('Invalid JWT');
  });

  it('тело не забирает у вызывающего: читает клон', async () => {
    const response = new Response('тело', { status: 500 });
    const error = Object.assign(new Error('boom'), { context: response });

    await describeInvokeError(error);

    expect(response.bodyUsed).toBe(false);
    await expect(response.text()).resolves.toBe('тело');
  });

  it('режет тело до 300 знаков и схлопывает переносы', async () => {
    const error = Object.assign(new Error('boom'), {
      context: new Response(`a\n\nb${'x'.repeat(500)}`, { status: 502 }),
    });

    const failure = await describeInvokeError(error);

    // Режем ДО схлопывания пробелов, поэтому итог не длиннее потолка, но может быть
    // короче на схлопнутые переносы: 300 знаков исходника → 299 после «\n\n» → « ».
    expect(failure.bodyHead.length).toBeLessThanOrEqual(300);
    expect(failure.bodyHead.length).toBeGreaterThan(290);
    expect(failure.bodyHead.startsWith('a b')).toBe(true);
  });

  it('ошибка без ответа — статус null, а не выдуманное число', async () => {
    const failure = await describeInvokeError(new TypeError('fetch failed'));
    expect(failure).toEqual({ status: null, message: 'fetch failed', bodyHead: '' });
  });

  it('не-Error переживает разбор', async () => {
    const failure = await describeInvokeError('строка');
    expect(failure.message).toBe('строка');
  });
});

describe('formatInvokeFailure', () => {
  it('строка лога несёт имя функции, статус и тело', () => {
    const line = formatInvokeFailure('ai-capture', {
      status: 401,
      message: 'non-2xx',
      bodyHead: 'Invalid JWT',
    });
    expect(line).toBe('ai-capture упала · статус 401 · non-2xx · тело: Invalid JWT');
  });

  it('без статуса ставит прочерк, а не 0', () => {
    const line = formatInvokeFailure('company-lookup', {
      status: null,
      message: 'fetch failed',
      bodyHead: '',
    });
    expect(line).toBe('company-lookup упала · статус — · fetch failed');
  });
});
