import { z } from 'zod';

/**
 * Валидация формы создания endpoint'а вебхука (B2, спринт 1).
 *
 * ⚠️ ЭТО НЕ ЗАЩИТА. Настоящая SSRF-проверка живёт в диспетчере
 * (`supabase/functions/webhook-dispatch/transport.ts`, checkWebhookUrl) и гоняется
 * перед КАЖДОЙ отправкой, потому что DNS может переехать на внутренний адрес уже
 * после сохранения. Здесь — быстрый отказ с понятной ошибкой в UI, чтобы очевидно
 * плохой адрес не доехал до очереди и не превратился в `dropped`-строку журнала.
 *
 * Дублирование правил осознанное: тащить модуль из `supabase/functions/**` в бандл
 * Next дороже, чем повторить три условия. Расходиться им нельзя — при правке одного
 * править оба.
 */

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Хост — голый IP-литерал (v4 или v6)? Имя хоста можно проверить глазами, адрес — нет. */
export function isIpLiteralHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '');
  return IPV4_RE.test(h) || h.includes(':');
}

export type WebhookUrlProblem =
  | 'not_a_url'
  | 'scheme_not_https'
  | 'ip_literal_forbidden'
  | 'port_forbidden'
  | 'credentials_forbidden';

/** null — претензий нет. */
export function checkWebhookUrlShallow(raw: string): WebhookUrlProblem | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return 'not_a_url';
  }
  if (u.protocol !== 'https:') return 'scheme_not_https';
  if (u.username !== '' || u.password !== '') return 'credentials_forbidden';
  if (u.hostname.length === 0) return 'not_a_url';
  if (isIpLiteralHost(u.hostname)) return 'ip_literal_forbidden';
  if (u.port !== '' && u.port !== '443') return 'port_forbidden';
  return null;
}

export const WEBHOOK_URL_MESSAGE: Record<WebhookUrlProblem, string> = {
  not_a_url: 'Некорректный URL',
  scheme_not_https: 'Разрешён только https://',
  ip_literal_forbidden: 'Укажите имя хоста, а не IP-адрес',
  port_forbidden: 'Разрешён только порт 443',
  credentials_forbidden: 'Логин и пароль в URL недопустимы',
};

export const webhookEndpointSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Укажите название')
    .max(120, 'Не длиннее 120 символов'),
  url: z
    .string()
    .trim()
    .min(1, 'Укажите URL получателя')
    .superRefine((val, ctx) => {
      const problem = checkWebhookUrlShallow(val);
      if (problem) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: WEBHOOK_URL_MESSAGE[problem] });
      }
    }),
  description: z.string().trim().max(500, 'Не длиннее 500 символов').optional(),
});

export type WebhookEndpointFormValues = z.infer<typeof webhookEndpointSchema>;
