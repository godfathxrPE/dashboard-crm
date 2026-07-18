'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Loader2, AlertTriangle, Check, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useCreateTask } from '@/lib/hooks/use-tasks';
import { useProjectColumns, useCreateColumn } from '@/lib/hooks/use-project-columns';
import {
  autoDetectPlanMapping,
  applyPlanMapping,
  type PlanFieldKey,
  type PlanRow,
} from '@/lib/utils/plan-import-helpers';

/** Короткое сообщение об ошибке для отчёта импорта (postgrest/JS). */
function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

interface ImportResult {
  phasesCreated: number;
  tasksCreated: number;
  errors: string[];
}

const FIELD_OPTIONS: { value: PlanFieldKey; label: string }[] = [
  { value: 'phase', label: 'Фаза / Этап' },
  { value: 'taskText', label: 'Задача' },
  { value: 'start', label: 'Дата начала' },
  { value: 'end', label: 'Дата окончания' },
  { value: 'milestone', label: 'Веха' },
  { value: 'wbs', label: 'WBS-код' },
  { value: 'skip', label: '— Пропустить —' },
];

/**
 * S-PLAN-IMPORT-1: импорт плана внедрения из Excel → задачи проекта по
 * фазам-свимлейнам. По образцу companies/ExcelImport: portal-модалка,
 * шаги mapping → preview → importing → result, lazy xlsx, best-effort
 * skip-and-continue (AUDIT 1.6). Клиентский, без миграций.
 */
export function PlanImportButton({ projectId, canImport }: { projectId: string; canImport: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Rules of Hooks (W2): все хуки на top-level, в executeImport — только mutateAsync
  const queryClient = useQueryClient();
  const createTask = useCreateTask();
  const createColumn = useCreateColumn(projectId);
  const { data: columns = [] } = useProjectColumns(projectId);

  const [rawRows, setRawRows] = useState<unknown[][] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<number, PlanFieldKey>>({});

  const [step, setStep] = useState<'mapping' | 'preview' | 'importing' | 'result'>('mapping');
  const [preview, setPreview] = useState<PlanRow[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [open, setOpen] = useState(false);

  if (!canImport) return null;

  function closeModal() {
    setOpen(false);
    setRawRows(null);
    setPreview([]);
    setResult(null);
    setStep('mapping');
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    // W4a: xlsx лениво; cellDates:true — иначе даты придут Excel-serial числами
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const headerRow = (rows[0] ?? []).map((h) => String(h));
    const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell).trim()));

    const autoMap: Record<number, PlanFieldKey> = {};
    headerRow.forEach((h, i) => {
      autoMap[i] = autoDetectPlanMapping(h);
    });

    setHeaders(headerRow);
    setRawRows(dataRows);
    setColumnMapping(autoMap);
    setStep('mapping');
    setResult(null);
    setOpen(true);
    if (fileRef.current) fileRef.current.value = '';
  }

  const taskTextMapped = Object.values(columnMapping).includes('taskText');

  function goToPreview() {
    if (!rawRows) return;
    const parsed = rawRows.map((row) => applyPlanMapping(row, columnMapping)).filter((r) => r.taskText);
    setPreview(parsed);
    setStep('preview');
  }

  // Существующие фазы (lower name → id) — для preview и executeImport
  const existingPhases = new Map(
    columns.filter((c) => c.category === 'phase').map((c) => [c.name.toLowerCase(), c.id]),
  );
  const uniquePhases = [...new Set(preview.map((r) => r.phase).filter(Boolean))];
  const invalidDatesCount = preview.filter((r) => r.start && r.end && r.end < r.start).length;

  async function executeImport() {
    setStep('importing');
    setProgress({ current: 0, total: preview.length });

    let phasesCreated = 0, tasksCreated = 0;
    let processed = 0;
    // AUDIT 1.6: skip-and-continue — ошибка строки в отчёт, импорт не рвётся
    const errors: string[] = [];
    const bump = () => { processed += 1; setProgress({ current: processed, total: preview.length }); };

    try {
      // ── Фазы: match по lower name / create недостающие ──
      const phaseMap = new Map(existingPhases);
      const missing = uniquePhases.filter((p) => !phaseMap.has(p.toLowerCase()));
      for (let i = 0; i < missing.length; i++) {
        const name = missing[i];
        try {
          const col = await createColumn.mutateAsync({ name, category: 'phase', position: columns.length + i });
          phaseMap.set(name.toLowerCase(), col.id);
          phasesCreated++;
        } catch (e) {
          // W4: фаза не создалась → её задачи пойдут с column_id=null (в Ганте — «Без фазы»)
          errors.push(`Фаза «${name}» не создана: ${errMsg(e)} — её задачи будут без колонки`);
        }
      }

      // ── Задачи ──
      for (const row of preview) {
        try {
          if (row.start && row.end && row.end < row.start) {
            errors.push(`«${row.taskText}»: дата окончания (${row.end}) раньше даты начала (${row.start}) — пропущена`);
            continue;
          }
          await createTask.mutateAsync({
            text: row.taskText,
            project_id: projectId,
            column_id: row.phase ? phaseMap.get(row.phase.toLowerCase()) ?? null : null,
            start_date: row.start,
            end_date: row.end,
            is_milestone: row.milestone,
            // B1: delivery-канон «Не начата»; DEFAULT БД 'now' родил бы весь план «В работе»
            lane: 'next',
            wbs_code: row.wbs || null,
          });
          tasksCreated++;
        } catch (e) {
          errors.push(`«${row.taskText || '—'}»: ${errMsg(e)}`);
        } finally {
          bump();
        }
      }
    } catch (e) {
      errors.push(`Критическая ошибка: ${errMsg(e)}`);
    } finally {
      setResult({ phasesCreated, tasksCreated, errors });
      setStep('result');
      setProgress({ current: 0, total: 0 });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project_columns', projectId] });
      if (errors.length) {
        toast.error(`Импорт плана завершён с ошибками: ${errors.length} (см. отчёт)`);
      } else {
        toast.success(`План импортирован: ${tasksCreated} задач${phasesCreated ? `, ${phasesCreated} фаз` : ''}`);
      }
    }
  }

  return (
    <>
      <button onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main">
        <Upload size={14} /> Импорт плана
      </button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />

      {open && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={() => step !== 'importing' && closeModal()}
        >
          <div
            style={{ position: 'relative', zIndex: 1000, width: '90vw', maxWidth: 800, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
              <h2 className="text-lg font-semibold text-text-main">
                Импорт плана
                {step === 'mapping' && ' — маппинг колонок'}
                {step === 'preview' && ' — превью'}
              </h2>
              {step !== 'importing' && (
                <button onClick={closeModal} className="p-1 text-text-mute hover:text-text-main"><X size={18} /></button>
              )}
            </div>

            {/* Step 1: Mapping */}
            {step === 'mapping' && (
              <>
                <p className="mb-3 text-sm text-text-dim">
                  Найдено {headers.length} колонок, {rawRows?.length ?? 0} строк. Укажи что в каждой:
                </p>
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
                  <div className="space-y-2">
                    {headers.map((h, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="w-6 text-[10px] text-text-mute text-right shrink-0">{String.fromCharCode(65 + i)}</span>
                        <span className="text-xs text-text-main truncate w-40 shrink-0" title={h}>«{h || '(пусто)'}»</span>
                        <span className="text-text-mute text-xs">→</span>
                        <select
                          value={columnMapping[i] ?? 'skip'}
                          onChange={(e) => setColumnMapping((prev) => ({ ...prev, [i]: e.target.value as PlanFieldKey }))}
                          className="flex-1 rounded-lg border border-input bg-surface px-2 py-1.5 text-xs text-text-main focus:border-accent focus:outline-none"
                        >
                          {FIELD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
                {!taskTextMapped && (
                  <p className="mb-2 text-xs text-yellow">Укажи, в какой колонке — «Задача», без неё импорт невозможен.</p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                  <button onClick={closeModal} className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim hover:bg-surface2">Отмена</button>
                  <button onClick={goToPreview} disabled={!taskTextMapped}
                    className="flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
                    Далее <ChevronRight size={14} />
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Preview */}
            {step === 'preview' && (
              <>
                <p className="mb-3 text-sm text-text-dim">
                  Найдено: <strong>{preview.length}</strong> задач
                  {uniquePhases.length > 0 && <> · фазы: {uniquePhases.map((p) => (
                    <span key={p} className="mr-1 inline-block rounded bg-surface2 px-1.5 py-0.5 text-xs">
                      {p} {existingPhases.has(p.toLowerCase()) ? '(есть)' : '(создать)'}
                    </span>
                  ))}</>}
                </p>
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-yellow-l px-3 py-2 text-xs text-yellow">
                  <AlertTriangle size={14} />
                  Задачи будут добавлены (существующие не заменяются)
                </div>
                {invalidDatesCount > 0 && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-yellow-l px-3 py-2 text-xs text-yellow">
                    <AlertTriangle size={14} />
                    {invalidDatesCount} строк с окончанием раньше начала — будут пропущены
                  </div>
                )}
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="border-b border-border">
                        <th className="px-2 py-1.5 text-left text-text-mute font-medium">Фаза</th>
                        <th className="px-2 py-1.5 text-left text-text-mute font-medium">Задача</th>
                        <th className="px-2 py-1.5 text-left text-text-mute font-medium">Начало</th>
                        <th className="px-2 py-1.5 text-left text-text-mute font-medium">Окончание</th>
                        <th className="px-2 py-1.5 text-left text-text-mute font-medium">Веха</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 100).map((row, i) => (
                        <tr key={i} className={row.start && row.end && row.end < row.start ? 'bg-yellow/[0.06]' : ''}>
                          <td className="px-2 py-1 text-text-dim truncate max-w-[140px]">{row.phase}</td>
                          <td className="px-2 py-1 text-text-main truncate max-w-[220px]">{row.taskText}</td>
                          <td className="px-2 py-1 text-text-dim">{row.start ?? ''}</td>
                          <td className="px-2 py-1 text-text-dim">{row.end ?? ''}</td>
                          <td className="px-2 py-1 text-text-dim">{row.milestone ? '◆' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.length > 100 && <p className="mt-1 text-[10px] text-text-mute">Показано 100 из {preview.length}</p>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setStep('mapping')} className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim hover:bg-surface2">← Назад</button>
                  <button onClick={executeImport} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                    Импортировать {preview.length} задач
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Importing */}
            {step === 'importing' && (
              <div className="py-8">
                <div className="flex items-center justify-center gap-2 text-sm text-text-dim">
                  <Loader2 size={16} className="animate-spin" />
                  Импортируется... {progress.current}/{progress.total}
                </div>
                <div className="mt-3 h-1.5 w-full rounded-full bg-border">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            {/* Step 4: Result */}
            {step === 'result' && result && (
              <div className="flex min-h-0 flex-1 flex-col py-6 text-center">
                {result.errors.length === 0
                  ? <Check size={32} className="mx-auto mb-3 text-green" />
                  : <AlertTriangle size={32} className="mx-auto mb-3 text-yellow" />}
                <p className="text-sm text-text-main">
                  Создано задач: <strong>{result.tasksCreated}</strong>,
                  фаз: <strong>{result.phasesCreated}</strong>
                </p>
                {result.errors.length > 0 && (
                  <p className="mt-1 text-sm font-medium text-yellow">
                    Ошибок: {result.errors.length} — эти строки пропущены
                  </p>
                )}
                {result.errors.length > 0 && (
                  <div className="mx-auto mt-3 w-full max-w-xl min-h-0 flex-1 overflow-y-auto rounded-lg border border-yellow/40 bg-yellow-l/40 p-3 text-left">
                    <ul className="space-y-1">
                      {result.errors.map((e, i) => (
                        <li key={i} className="text-xs text-text-dim">• {e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button onClick={closeModal} className="mx-auto mt-4 shrink-0 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90">Готово</button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
