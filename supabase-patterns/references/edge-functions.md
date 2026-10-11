# Edge Functions

Supabase Edge Functions — serverless Deno functions for webhooks, scheduled tasks,
and operations that need server-side secrets or bypass RLS.

---

## When to Use Edge Functions

| Use case | Edge Function? | Alternative |
|----------|---------------|-------------|
| Webhook handler (Stripe, etc.) | Yes | - |
| Scheduled / cron job | Yes | - |
| Third-party API call with secret key | Yes | Server Action (if Next.js only) |
| Complex data processing | Yes | Server Action |
| Simple CRUD mutation | No | Server Action or client |
| File processing after upload | Yes (via DB webhook) | - |

**Rule**: use Edge Functions when you need Deno runtime, cron triggers,
or webhook endpoints outside Next.js. For standard app mutations, prefer Server Actions.

---

## Project Structure

```
supabase/functions/
├── my-function/
│   └── index.ts        ← entry point (required)
├── shared/
│   └── cors.ts         ← shared utilities
└── .env.local          ← local secrets for development
```

---

## Basic Function Template

```typescript
// supabase/functions/my-function/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // User-context client: запросы идут под JWT вызывающего пользователя,
    // RLS-политики применяются. Это default для функций, обслуживающих
    // пользовательские запросы.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const body = await req.json();

    // Your logic here
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .limit(10);

    if (error) throw error;

    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
```

### Admin client — только для verified webhooks / cron

Admin-клиент на service role key обходит RLS целиком — любой запрос видит
и пишет все строки всех таблиц. Используй его ТОЛЬКО когда user context
отсутствует по природе вызова И источник запроса верифицирован:

- **Webhooks** — после проверки подписи (см. Webhook Pattern ниже —
  там корректный пример admin-клиента).
- **Cron / scheduled jobs** — вызовы по секретному токену, не от пользователя.

Никогда не используй admin-клиент для обычных чтений/записей по запросу
пользователя — это отключает RLS и открывает данные других пользователей.

---

## Secrets Management

```bash
# Set secret (production)
supabase secrets set MY_API_KEY=sk-xxx

# List secrets
supabase secrets list

# Use in function
const apiKey = Deno.env.get('MY_API_KEY');
```

Built-in secrets (available without setting):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

**Rule**: never hardcode secrets. Never commit `.env.local` to git.

---

## Deployment

```bash
# Deploy single function
supabase functions deploy my-function

# Deploy all functions
supabase functions deploy
```

---

## Invoking from Client

```typescript
const { data, error } = await supabase.functions.invoke('my-function', {
  body: { key: 'value' },
});
```

The anon key is sent automatically. For authenticated calls, the user's JWT
is included in the Authorization header.

---

## Webhook Pattern (Stripe example)

```typescript
import Stripe from 'https://esm.sh/stripe@14?target=denonext';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  // Verify webhook signature.
  // В Deno нужен async-вариант с SubtleCrypto: синхронный constructEvent
  // опирается на Node crypto и в Edge Functions падает.
  const event = await stripe.webhooks.constructEventAsync(
    body,
    signature!,
    Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    undefined,
    Stripe.createSubtleCryptoProvider()
  );

  // Use admin client (webhook has no user context)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  switch (event.type) {
    case 'checkout.session.completed':
      await supabase.from('orders')
        .update({ status: 'paid' })
        .eq('stripe_session_id', event.data.object.id);
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

## Common Edge Function Errors

| Error | Cause | Fix |
|-------|-------|-----|
| CORS error in browser | Missing cors headers or OPTIONS handler | Add corsHeaders to all responses + OPTIONS check |
| 500 on cold start | Function takes >2s to initialize | Reduce imports, use lighter dependencies |
| "Boot failure" | Syntax error or missing import | Check Deno compatibility, test locally |
| Secret undefined | Secret not set or wrong name | Run `supabase secrets set`, check spelling |
| 401 from client invoke | Missing or expired auth token | Ensure user is logged in, middleware refreshes JWT |
