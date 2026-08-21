'use client';

import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  captureResultSchema,
  captureRunSchema,
  type CaptureResult,
  type CaptureRun,
} from '@/lib/validators/capture';
import { findCaptureDuplicate, type CaptureDuplicate } from '@/lib/utils/capture-helpers';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useCompanies } from '@/lib/hooks/use-companies';

/**
 * S-QUICK-CAPTURE-1: разбор вставленного текста (edge `ai-capture`) + поиск дубля.
 *
 * Кэша у разбора нет намеренно (`useMutation`, не `useQuery`): это одноразовое
 * действие над одноразовым текстом, инвалидировать нечего и переиспользовать
 * нечего.
 *
 * ⚠️ S-TG-3: САМО ПРАВИЛО ДЕДУПА ЗДЕСЬ БОЛЬШЕ НЕ ЖИВЁТ. Оно переехало в
 *    `capture-helpers` (`findCaptureDuplicate`), потому что у него появился второй
 *    клиент — бот. Здесь остался только источник строк: списки из кэша React Query.
 *    Бот подставляет в ту же функцию строки, вычитанные из БД. Разъехавшись, эти
 *    два дедупа дали бы дубль из мессенджера на тексте, на котором веб дубль видит.
 */

export type { CaptureDuplicate };

/**
 * Журнал прогона capture — S-AI-OBS-1.
 *
 * ⚠️ ПИШЕТ ВЫЗЫВАЮЩИЙ, А НЕ `ai-capture`. У функции разбора нет ни `org_id`, ни
 *    автора: она сознательно не запрашивает сервисной роли и не ходит в БД вовсе
 *    (её security-контур №1). Здесь обе координаты берутся из сессии, а не из
 *    тела запроса, — и проверяются RLS.
 *
 * ⚠️ `org_id` И `created_by` НЕ ПЕРЕДАЮТСЯ. Первый ставит триггер `trg_set_org_id`,
 *    второй — дефолт `auth.uid()`; политика `ai_runs_insert` сверяет оба. Передать
 *    их с клиента значило бы дать браузеру назвать организацию самому.
 *
 * ⚠️ СТАТУС СРАЗУ ТЕРМИНАЛЬНЫЙ (`done`/`error`), одной вставкой — не `pending`,
 *    как у `ai-run`. Частичный уникальный индекс `ux_ai_runs_active_entity` берёт
 *    только `pending`/`running`, так что параллельные разборы не столкнутся.
 *
 * ⚠️ НЕ ЖДЁМ И НЕ РОНЯЕМ. Вызывается через `void`: человек ждёт форму, а не
 *    статистику, и отказ журнала не отменяет разбор. Промис не реджектится.
 */
async function logCaptureRun(
  supabase: ReturnType<typeof createClient>,
  outcome: {
    ok: boolean;
    /** Что разобрали; у отказа — null. */
    kind: string | null;
    error: string | null;
    run: CaptureRun | null;
    /** Замер вокруг вызова — резерв, когда своего `duration_ms` функция не дала. */
    fallbackMs: number;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('ai_runs').insert({
      preset_key: 'capture',
      entity_type: 'capture',
      entity_id: null,
      status: outcome.ok ? 'done' : 'error',
      // Источник — ключ в уже существующем `result`: колонки `meta` у `ai_runs`
      // нет, и заводить её ради одного поля дороже, чем положить его в jsonb.
      // ⚠️ `source` пишется И ПРИ ОТКАЗЕ. Иначе первый же вопрос к статистике —
      //    «доля отказов по источнику» — не отвечается: у ошибок источник терялся бы,
      //    а именно отказы бота и веба надо уметь различать. `kind` при отказе не
      //    кладётся: разбирать было нечего.
      result: outcome.ok
        ? { source: 'web', kind: outcome.kind }
        : { source: 'web' },
      error: outcome.error,
      model: outcome.run?.model ?? null,
      input_tokens: outcome.run?.input_tokens ?? null,
      output_tokens: outcome.run?.output_tokens ?? null,
      duration_ms: outcome.run?.duration_ms ?? outcome.fallbackMs,
      finished_at: new Date().toISOString(),
    });
    if (error) console.error('ai_runs: журнал разбора не записан:', error.message);
  } catch (e) {
    console.error('ai_runs: журнал разбора не записан:', e);
  }
}

async function parseText(text: string): Promise<CaptureResult> {
  const supabase = createClient();
  const started = Date.now();
  const { data, error } = await supabase.functions.invoke('ai-capture', {
    body: { text },
  });

  if (error) {
    // Edge Function вернула non-2xx — нейтральное сообщение лежит в теле,
    // достаём его через error.context (паттерн use-ai-summary).
    let message = 'Не удалось разобрать текст';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch { /* нейтральное сообщение по умолчанию */ }
    // ⚠️ ОТКАЗ ЖУРНАЛИРУЕТСЯ НАРАВНЕ С УСПЕХОМ. Лог одних успехов — тот же слепой
    //    лог с другой стороны: доля отказов по источнику и есть первое, что
    //    спросят у статистики.
    void logCaptureRun(supabase, {
      ok: false,
      kind: null,
      error: `invoke|${message}`,
      run: null,
      fallbackMs: Date.now() - started,
    });
    throw new Error(message);
  }

  // Телеметрия прогона — такой же внешний payload, как и сам разбор. Её отсутствие
  // штатно (прежняя версия функции), поэтому `null`, а не отказ.
  const runParsed = captureRunSchema.safeParse((data as { run?: unknown } | null)?.run);
  const run = runParsed.success ? runParsed.data : null;

  // Ответ функции — внешний payload: сужаем, а не кастуем. Функция деплоится
  // гейтом отдельно от бандла, и битая версия иначе протекла бы undefined-ами
  // в defaultValues формы.
  const parsed = captureResultSchema.safeParse((data as { result?: unknown } | null)?.result);
  if (!parsed.success) {
    void logCaptureRun(supabase, {
      ok: false,
      kind: null,
      error: 'shape|ответ не лёг в схему разбора',
      run,
      fallbackMs: Date.now() - started,
    });
    throw new Error('Некорректный ответ сервиса разбора');
  }

  void logCaptureRun(supabase, {
    ok: true,
    kind: parsed.data.intent,
    error: null,
    run,
    fallbackMs: Date.now() - started,
  });
  return parsed.data;
}

export function useQuickCapture() {
  // `silentError` — потому что виджет показывает отказ САМ, прямо в поповере, где
  // рядом лежит непотерянный текст и кнопка «Повторить». Без флага AUDIT A1.1
  // добавил бы поверх этого ещё и глобальный тост — два сообщения об одном сбое.
  const parse = useMutation({ mutationFn: parseText, meta: { silentError: true } });

  // Дедуп идёт по УЖЕ ЗАГРУЖЕННЫМ спискам, без отдельных запросов: их и так
  // безусловно тянет CommandPalette, статически смонтированная в layout, так что
  // данные в кэше есть на любой странице. Плюс это единственный способ сверить
  // мультителефон: `phones` — jsonb, и PostgREST-фильтром подстроку в нём не
  // найти (`cs` требует точного элемента). RLS уже ограничила выдачу текущей
  // организацией — дополнительных фильтров не нужно.
  const { data: contacts = [] } = useContacts();
  const { data: companies = [] } = useCompanies();

  /** Первый похожий существующий объект или null. Правило — в `capture-helpers`. */
  const findDuplicate = useCallback(
    (result: CaptureResult, inn: string | null): CaptureDuplicate | null =>
      findCaptureDuplicate(result, inn, contacts, companies),
    [contacts, companies],
  );

  return { parse, findDuplicate };
}
