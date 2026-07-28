import { PROGRESSION_PRESET_KEY } from '@/lib/constants/ai-presets';
import type {
  AiRunRow,
  ProtocolResult,
  AnalyticNoteResult,
  SpinReviewResult,
  ProgressionProposal,
  MeetingPrepResult,
  DealSummaryResult,
} from '@/types/database';

/**
 * Читаемый plain-text результата прогона для кнопки «Копировать».
 * Без markdown — вывод модели недоверенный, он и в UI рендерится только как текст.
 *
 * 085: вынесено из AiRunPanel в утилиту — теперь тот же результат копируется из двух
 * мест (панель звонка/встречи и панель сделки), и расходиться им нельзя.
 */
export function serializeRun(run: AiRunRow): string {
  const r = run.result;
  if (!r) return '';
  const out: string[] = [];
  const push = (title: string, lines: string[]) => {
    if (lines.length) out.push(`${title}:\n` + lines.map((l) => `— ${l}`).join('\n'));
  };

  if (run.preset_key === 'meeting_protocol') {
    const p = r as ProtocolResult;
    push('Участники', p.participants ?? []);
    push('Повестка', p.agenda ?? []);
    push('Обсуждалось', p.discussed ?? []);
    push('Решения', p.decisions ?? []);
    push(
      'Поручения',
      (p.action_items ?? []).map(
        (a) => `${a.what}${a.who ? ` (${a.who})` : ''}${a.due ? ` до ${a.due}` : ''}`,
      ),
    );
    push('Открытые вопросы', p.open_questions ?? []);
  } else if (run.preset_key === 'analytic_note') {
    const n = r as AnalyticNoteResult;
    if (n.client_situation) out.push(`Ситуация клиента:\n${n.client_situation}`);
    push('Потребности и боли', (n.needs ?? []).map((x) => `${x.claim}${x.quote ? ` «${x.quote}»` : ''}`));
    push('Стейкхолдеры', (n.stakeholders ?? []).map((s) => `${s.name}${s.role ? ` — ${s.role}` : ''}`));
    push('Риски сделки', (n.deal_risks ?? []).map((x) => `${x.claim}${x.quote ? ` «${x.quote}»` : ''}`));
    push('Рекомендации', n.recommendations ?? []);
    push('Аргументы для КП', n.kp_arguments ?? []);
  } else if (run.preset_key === 'spin_review') {
    const s = r as SpinReviewResult;
    out.push(`Оценка: ${s.score.value}/10${s.score.rationale ? ` — ${s.score.rationale}` : ''}`);
    out.push(
      `Счёт S/P/I/N: ${s.counts.situation}/${s.counts.problem}/${s.counts.implication}/${s.counts.need_payoff}`,
    );
    push('Что упущено', s.missed ?? []);
    push('Вопросы к следующему звонку', s.next_questions ?? []);
  } else if (run.preset_key === PROGRESSION_PRESET_KEY) {
    const g = r as ProgressionProposal;
    if (g.summary) out.push(`Итог разговора:\n${g.summary}`);
    push(
      'Предлагаемые правки',
      Object.entries(g.fields ?? {})
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}: ${String(v)}`),
    );
    push(
      'Задачи',
      (g.tasks ?? []).map(
        (t) => `${t.text}${t.due_in_days !== undefined ? ` (через ${t.due_in_days} дн.)` : ''}`,
      ),
    );
    push('Риски', g.risks ?? []);
    push('Открытые вопросы', g.open_questions ?? []);
  } else if (run.preset_key === 'meeting_prep') {
    const m = r as MeetingPrepResult;
    if (m.context) out.push(`Контекст:\n${m.context}`);
    push('С кем говорим', (m.participants ?? []).map((p) => `${p.name}${p.note ? ` — ${p.note}` : ''}`));
    push('Что открыто', m.open_items ?? []);
    push('О чём спросить', m.questions ?? []);
    push('На что обратить внимание', m.watch_outs ?? []);
  } else if (run.preset_key === 'deal_summary') {
    const d = r as DealSummaryResult;
    if (d.state) out.push(`Где сделка:\n${d.state}`);
    push('Что произошло', d.highlights ?? []);
    if (d.next_step) out.push(`Следующий шаг:\n${d.next_step}`);
    push('Требует внимания', d.flags ?? []);
  }

  return out.join('\n\n');
}
