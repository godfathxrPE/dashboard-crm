'use client';

import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2, Database, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { localDateKey } from '@/lib/utils/date-helpers';
import type { TaskInsert } from '@/types/entities';

/**
 * Data Migration Tool
 *
 * Читает JSON-экспорт из старого Dashboard (localStorage)
 * и импортирует данные в Supabase таблицы.
 *
 * Формат входного JSON (из старого дашборда):
 * {
 *   tasks: [{ id, text, lane, priority, deadline, remindMin, projectId, _updatedAt }],
 *   projects: [{ id, name, stage, stageIndex, budget, deadline, nextStep, lossReason, ... }],
 *   calls: [{ id, date, company, contact, agreements, nextStep, status }],
 *   meetings: [{ id, title, date, time, location, notes }],
 * }
 */

interface MigrationLog {
  entity: string;
  status: 'pending' | 'running' | 'done' | 'error';
  count: number;
  message?: string;
}

// S-FIX-BATCH-1: карта stageIndex → enum `deal_stage` удалена вместе с колонкой
// `projects.stage`, которой в схеме нет с переезда на воронки (pipelines /
// pipeline_stages). Она была не безобидным мусором: из-за неё insert проектов падал
// каждый прогон миграции. Восстанавливать перенос стадии — отдельная работа:
// старому индексу нужно сопоставление в стадиях конкретной воронки организации.

export function MigrationTool() {
  const [file, setFile] = useState<File | null>(null);
  const [logs, setLogs] = useState<MigrationLog[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  function updateLog(entity: string, update: Partial<MigrationLog>) {
    setLogs((prev) =>
      prev.map((l) => (l.entity === entity ? { ...l, ...update } : l))
    );
  }

  async function handleMigrate() {
    if (!file) return;

    setRunning(true);
    setDone(false);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const supabase = createClient();

      // Initialize logs
      // S-FIX-BATCH-1: projects ПЕРЕД tasks — задаче нужен новый id её проекта.
      const entities = ['projects', 'tasks', 'calls', 'meetings'];
      setLogs(entities.map((e) => ({
        entity: e,
        status: 'pending',
        count: 0,
      })));

      // ─── Projects ───
      // Вставляем по одной и запоминаем старый id → новый: id из localStorage в
      // Supabase не переносится (свой gen_random_uuid()), поэтому связь задача↔проект
      // восстановима только через эту карту. Поштучно, а не `insert(rows)` c RETURNING:
      // соответствие возвращённых строк входным Postgres не гарантирует.
      const projectIdMap = new Map<string, string>();
      let projectsFailed = false;

      if (data.projects?.length) {
        updateLog('projects', { status: 'running' });
        let created = 0;
        const projectErrors: string[] = [];
        for (const p of data.projects as Record<string, unknown>[]) {
          try {
            // `stage` из старого дашборда БОЛЬШЕ НЕ СУЩЕСТВУЕТ: воронка переехала на
            // pipeline_id/stage_id (справочники `pipelines`/`pipeline_stages`). Именно
            // из-за него весь шаг падал каждый прогон — а шаг задач ниже проходил и
            // наливал их без проекта. Стадию не переносим: соответствия старому
            // stageIndex в новых воронках нет, проект приезжает в дефолтную стадию.
            const { data: created_, error } = await supabase
              .from('projects')
              .insert({
                name: (p.name ?? p.title ?? 'Без названия') as string,
                budget: p.budget ? Math.round(Number(p.budget) * 100) : null, // рубли → копейки
                deadline: p.deadline ? String(p.deadline) : null,
                next_step: (p.nextStep ?? p.next_step ?? null) as string | null,
                loss_reason: (p.lossReason ?? p.loss_reason ?? null) as string | null,
                loss_detail: (p.lossDetail ?? p.loss_detail ?? null) as string | null,
              })
              .select('id')
              .single();
            if (error || !created_) throw error ?? new Error('insert projects вернул пусто');
            const oldId = p.id ?? p.projectId;
            if (oldId) projectIdMap.set(String(oldId), created_.id);
            created++;
          } catch (err) {
            projectErrors.push(`«${String(p.name ?? p.title ?? '—')}»: ${(err as Error).message}`);
          }
        }
        if (projectErrors.length) {
          projectsFailed = true;
          updateLog('projects', {
            status: 'error',
            count: created,
            message: `${projectErrors.length} не создано: ${projectErrors[0]}`,
          });
        } else {
          updateLog('projects', { status: 'done', count: created });
        }
      } else {
        updateLog('projects', { status: 'done', count: 0, message: 'Нет данных' });
      }

      // ─── Tasks ───
      if (data.tasks?.length) {
        updateLog('tasks', { status: 'running' });
        try {
          // Проекты не доехали — задачи НЕ льём. Раньше шаги были независимы, и
          // упавший импорт проектов оставлял весь план личными задачами без проекта:
          // именно так в проде осело 398 строк за пять прогонов (S-FIX-BATCH-1).
          if (projectsFailed) {
            throw new Error('шаг «projects» завершился с ошибками — задачи не импортированы, иначе они осядут без проекта');
          }
          const orphans: string[] = [];
          const rows: TaskInsert[] = (data.tasks as Record<string, unknown>[]).map((t) => {
            const oldProjectId = t.projectId ?? t.project_id;
            const mapped = oldProjectId ? projectIdMap.get(String(oldProjectId)) ?? null : null;
            if (oldProjectId && !mapped) orphans.push(String(t.text ?? t.title ?? '—'));
            return {
              text: String(t.text ?? t.title ?? 'Без названия'),
              lane: (['now', 'next', 'wait', 'done'].includes(t.lane as string)
                ? t.lane : 'now') as TaskInsert['lane'],
              priority: (['normal', 'important', 'critical'].includes(t.priority as string)
                ? t.priority : 'normal') as TaskInsert['priority'],
              deadline: t.deadline ? new Date(t.deadline as string).toISOString() : null,
              remind_min: Number(t.remindMin ?? t.remind_min) || null,
              sort_order: Number(t.sortOrder ?? t.sort_order) || 0,
              project_id: mapped,
            };
          });
          // Задача, у которой проект БЫЛ, но не переехал, — это будущая «личная»
          // строка плана. Молча её не вставляем.
          if (orphans.length) {
            throw new Error(`${orphans.length} задач ссылаются на непереехавший проект (напр. «${orphans[0]}») — импорт остановлен`);
          }

          const { error } = await supabase.from('tasks').insert(rows);
          if (error) throw error;
          updateLog('tasks', { status: 'done', count: rows.length });
        } catch (err) {
          updateLog('tasks', { status: 'error', message: (err as Error).message });
        }
      } else {
        updateLog('tasks', { status: 'done', count: 0, message: 'Нет данных' });
      }

      // ─── Calls ───
      if (data.calls?.length) {
        updateLog('calls', { status: 'running' });
        try {
          const rows = data.calls.map((c: Record<string, unknown>) => ({
            date: c.date ? new Date(c.date as string).toISOString() : new Date().toISOString(),
            status: (['done', 'pending', 'cancelled'].includes(c.status as string))
              ? c.status : 'done',
            agreements: c.agreements ?? c.notes ?? null,
            next_step: c.nextStep ?? c.next_step ?? null,
          }));

          const { error } = await supabase.from('calls').insert(rows);
          if (error) throw error;
          updateLog('calls', { status: 'done', count: rows.length });
        } catch (err) {
          updateLog('calls', { status: 'error', message: (err as Error).message });
        }
      } else {
        updateLog('calls', { status: 'done', count: 0, message: 'Нет данных' });
      }

      // ─── Meetings ───
      if (data.meetings?.length) {
        updateLog('meetings', { status: 'running' });
        try {
          const rows = data.meetings.map((m: Record<string, unknown>) => ({
            title: m.title ?? 'Встреча',
            date: m.date ? String(m.date).slice(0, 10) : localDateKey(),
            time: m.time ? String(m.time) : null,
            location: m.location ?? null,
            notes: m.notes ?? null,
          }));

          const { error } = await supabase.from('meetings').insert(rows);
          if (error) throw error;
          updateLog('meetings', { status: 'done', count: rows.length });
        } catch (err) {
          updateLog('meetings', { status: 'error', message: (err as Error).message });
        }
      } else {
        updateLog('meetings', { status: 'done', count: 0, message: 'Нет данных' });
      }

      setDone(true);
    } catch (err) {
      console.error('Migration failed:', err);
    } finally {
      setRunning(false);
    }
  }

  const statusIcon = (status: MigrationLog['status']) => {
    switch (status) {
      case 'pending': return <div className="h-4 w-4 rounded-full border-2 border-border" />;
      case 'running': return <Loader2 size={16} className="animate-spin text-accent" />;
      case 'done': return <CheckCircle size={16} className="text-green" />;
      case 'error': return <AlertCircle size={16} className="text-red" />;
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 text-center">
        <Database size={32} className="mx-auto mb-2 text-accent" />
        <h1 className="aura-page-title text-text-main">Миграция данных</h1>
        <p className="mt-1 text-sm text-text-mute">
          Импорт из старого Dashboard (localStorage JSON) в Supabase
        </p>
      </div>

      {/* Step 1: Upload file */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-xs font-semibold text-text-dim">
          1. Экспортируй данные из старого дашборда
        </h2>
        <p className="mb-3 text-xs text-text-mute">
          Открой старый Dashboard → Настройки → Экспорт JSON → Скачай файл.
          Или в DevTools console: <code className="bg-bg px-1 rounded">JSON.stringify(localStorage)</code>
        </p>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 transition-colors hover:border-accent hover:bg-accent-l/20">
          <Upload size={16} className="text-text-mute" />
          <span className="flex-1 text-xs text-text-dim">
            {file ? file.name : 'Выбери JSON файл...'}
          </span>
          <input type="file" accept=".json" className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      {/* Step 2: Migrate */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-xs font-semibold text-text-dim">2. Запусти миграцию</h2>

        <button onClick={handleMigrate} disabled={!file || running}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5
                     text-sm font-medium text-white transition-opacity hover:opacity-90
                     disabled:opacity-50">
          {running ? (
            <><Loader2 size={14} className="animate-spin" /> Миграция...</>
          ) : (
            <><ArrowRight size={14} /> Начать миграцию</>
          )}
        </button>
      </div>

      {/* Progress */}
      {logs.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-semibold text-text-dim">Прогресс</h2>
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.entity} data-card
                className="flex items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2">
                {statusIcon(log.status)}
                <span className="flex-1 text-xs font-medium capitalize text-text-main">{log.entity}</span>
                {log.count > 0 && (
                  <span className="text-xs text-green">{log.count} записей</span>
                )}
                {log.message && (
                  <span className={`text-xs ${log.status === 'error' ? 'text-red' : 'text-text-mute'}`}>
                    {log.message}
                  </span>
                )}
              </div>
            ))}
          </div>

          {done && (
            <div className="mt-4 rounded-lg bg-green/10 px-4 py-3 text-center">
              <CheckCircle size={20} className="mx-auto mb-1 text-green" />
              <p className="text-sm font-medium text-green">Миграция завершена!</p>
              <a href="/" className="mt-1 block text-xs text-accent hover:underline">
                Перейти на дашборд →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
