import { createClient } from '@/lib/supabase/client';
import { isProgressionField, type ProgressionFieldKey } from '@/lib/constants/ai-progression';
import { mskDeadlineInDays } from '@/lib/utils/date-helpers';
import type { Json, ProgressionProposal } from '@/types/database';

// ═══════════════════════════════════════════════════════
// R2-P0-C (S-R2-SDP-1) — применение принятых пунктов AI-предложения к сделке.
//
// Инварианты:
//   I7  — пишем ТОЛЬКО поля из whitelist (тот же набор, что set_field автоматизаций).
//         `stage_id`/`budget`/`owner_id`/`status`/… не пишутся никогда: их нет ни в
//         контракте, ни в этом модуле.
//   I4  — каждое применение оставляет след в activity_log ('ai_progression_applied').
//   HITL — сюда приходит только то, что пользователь отметил галочкой.
//
// Идемпотентность: прогон «заклеймливается» ДО записи (условный UPDATE по
// `result->>applied_at IS NULL`). Победила гонка — второй клик получит
// AlreadyAppliedError и ничего не создаст. Если после клейма запись упала —
// клейм снимается, чтобы пользователь мог повторить.
// ═══════════════════════════════════════════════════════

export const PROGRESSION_EVENT = 'ai_progression_applied';

export class StaleProjectError extends Error {
  constructor() {
    super('Сделку изменили после формирования предложения');
    this.name = 'StaleProjectError';
  }
}

export class AlreadyAppliedError extends Error {
  constructor() {
    super('Это предложение уже применено');
    this.name = 'AlreadyAppliedError';
  }
}

export interface ApplyProgressionOptions {
  runId: string;
  proposal: ProgressionProposal;
  accepted: { fields: ProgressionFieldKey[]; taskIndexes: number[] };
  /** Сделка, подтверждённая пользователем (не обязательно target_project_id модели). */
  projectId: string;
  /** `projects.updated_at` из копии, которую пользователь видел в диф-панели. */
  projectUpdatedAt: string | null;
  /**
   * Пользователь увидел предупреждение о несвежести и подтвердил повторно.
   * Без этого расхождение `updated_at` — жёсткий отказ (иначе AI затрёт
   * `next_step`, введённый руками минуту назад).
   */
  force?: boolean;
}

export interface ApplyProgressionResult {
  appliedFields: ProgressionFieldKey[];
  createdTasks: number;
}

/** Ровно те колонки projects, которые SDP имеет право трогать (I7). */
export type ProgressionPatch = {
  next_step?: string;
  next_action_date?: string;
  pinned_note?: string;
  probability?: number;
};

/**
 * Патч сделки из принятых полей. Ключи вне whitelist отбрасываются молча.
 * Жёсткий switch (а не динамический `patch[key] = …`) — зеркало CASE в SQL
 * `wf_apply_project_action`: чужое имя колонки физически не может попасть в UPDATE.
 */
export function buildProjectPatch(
  proposal: ProgressionProposal,
  acceptedFields: ProgressionFieldKey[],
): ProgressionPatch {
  const patch: ProgressionPatch = {};
  for (const key of acceptedFields) {
    if (!isProgressionField(key)) continue;      // I7: чужое поле не проходит
    switch (key) {
      case 'next_step': {
        const v = proposal.fields.next_step;
        if (v) patch.next_step = v;
        break;
      }
      case 'pinned_note': {
        const v = proposal.fields.pinned_note;
        if (v) patch.pinned_note = v;
        break;
      }
      case 'next_action_date': {
        const v = proposal.fields.next_action_date;
        if (v) patch.next_action_date = v;
        break;
      }
      case 'probability': {
        const v = proposal.fields.probability;
        if (typeof v === 'number') patch.probability = v;   // 0 — валидное значение
        break;
      }
    }
  }
  return patch;
}

export async function applyProgressionPatch(
  opts: ApplyProgressionOptions,
): Promise<ApplyProgressionResult> {
  const { runId, proposal, accepted, projectId, projectUpdatedAt, force } = opts;
  const supabase = createClient();

  if (proposal.applied_at) throw new AlreadyAppliedError();

  const patch = buildProjectPatch(proposal, accepted.fields);
  const tasks = accepted.taskIndexes
    .map((i) => proposal.tasks[i])
    .filter((t): t is ProgressionProposal['tasks'][number] => !!t?.text);

  // ── 1. Свежесть сделки: сверяем клиентский снимок со СВЕЖИМ чтением ──
  const { data: fresh, error: freshErr } = await supabase
    .from('projects')
    .select('id, updated_at, company_id, contact_id')
    .eq('id', projectId)
    .single();
  if (freshErr) throw freshErr;
  if (!force && projectUpdatedAt && fresh.updated_at !== projectUpdatedAt) {
    throw new StaleProjectError();
  }

  // ── 2. Клейм прогона: условный UPDATE, чтобы двойной клик не создал вторую пачку ──
  const claimedResult: ProgressionProposal = {
    ...proposal,
    applied_at: new Date().toISOString(),
    applied: { fields: Object.keys(patch), tasks: tasks.length },
  };
  const { data: claimed, error: claimErr } = await supabase
    .from('ai_runs')
    // MERGE конкретных ключей поверх вывода модели — литералом весь result не затираем.
    // Домен → Json: ген-типы не знают о форме result (jsonb), см. конвенцию 041.
    .update({ result: claimedResult as unknown as Json })
    .eq('id', runId)
    .is('result->>applied_at', null)
    .select('id');
  if (claimErr) throw claimErr;
  if (!claimed || claimed.length === 0) throw new AlreadyAppliedError();

  try {
    // ── 3. Поля сделки ──
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('projects').update(patch).eq('id', projectId);
      if (error) throw error;
    }

    // ── 4. Задачи. company_id/contact_id — от СДЕЛКИ, не от предложения ──
    // S-COST-TRUTH-1: id вставленных строк нужны событиям журнала ниже. Insert
    // многострочный, поэтому `.select('id')` отдаёт МАССИВ — сопоставляем по индексу
    // (`insert ... returning` сохраняет порядок VALUES), а не берём первый id на всю
    // пачку: три задачи с одним и тем же `task_id` открывали бы одну карточку.
    let insertedTaskIds: string[] = [];
    if (tasks.length > 0) {
      const rows = tasks.map((t) => ({
        text: t.text,
        lane: t.lane ?? 'now',
        priority: t.priority ?? 'normal',
        project_id: projectId,
        company_id: fresh.company_id,
        contact_id: fresh.contact_id,
        // D2: дедлайн — КОНЕЦ ДНЯ по МСК, а не «момент клика + N×24ч». Со старой
        // арифметикой `due_in_days: 0` давал задачу, просроченную через секунду
        // после создания, а `1..N` — дедлайн в случайное время суток.
        deadline: t.due_in_days === undefined ? null : mskDeadlineInDays(t.due_in_days),
      }));
      const { data: inserted, error } = await supabase.from('tasks').insert(rows).select('id');
      if (error) throw error;
      insertedTaskIds = (inserted ?? []).map((r) => r.id);
    }

    // ── 5. Audit trail (I4) ──
    // D4: агрегат `ai_progression_applied` фиксирует САМО применение (что принял
    // человек), но задачи, созданные вручную, дают в ленте `task_created` с текстом,
    // а созданные из предложения не давали ничего — таймлайн проекта показывал
    // «задач: 3» без единого следа, ЧТО это за задачи. Пишем и то, и другое; у
    // AI-задач в payload есть `source`/`run_id`, поэтому происхождение не теряется.
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? null;
    await supabase.from('activity_log').insert([
      {
        project_id: projectId,
        user_id: userId,
        event_type: PROGRESSION_EVENT,
        payload: {
          run_id: runId,
          source_entity_type: proposal.source.entity_type,
          source_entity_id: proposal.source.entity_id,
          fields: Object.keys(patch),
          tasks: tasks.length,
          confidence: proposal.confidence,
          ...(force ? { forced_stale: true } : {}),
        },
      },
      ...tasks.map((t, i) => ({
        project_id: projectId,
        user_id: userId,
        event_type: 'task_created',
        payload: {
          // S-COST-TRUTH-1: ключ вовсе не кладём, если id по индексу не пришёл —
          // `task_id: null` в payload прошёл бы проверку «поле есть» в адаптере
          // ленты и дал бы клик в никуда.
          ...(insertedTaskIds[i] ? { task_id: insertedTaskIds[i] } : {}),
          title: t.text,
          priority: t.priority ?? 'normal',
          source: PROGRESSION_EVENT,
          run_id: runId,
        },
      })),
    ]);

    return { appliedFields: Object.keys(patch) as ProgressionFieldKey[], createdTasks: tasks.length };
  } catch (err) {
    // Клейм снимаем best-effort: иначе прогон навсегда «применён», а в сделке пусто.
    const released: ProgressionProposal = { ...proposal };
    delete released.applied_at;
    delete released.applied;
    await supabase
      .from('ai_runs')
      .update({ result: released as unknown as Json })
      .eq('id', runId);
    throw err;
  }
}
