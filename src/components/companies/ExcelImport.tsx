'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Loader2, AlertTriangle, Check, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

import { parseFullName, autoDetectMapping, type FieldKey } from '@/lib/utils/import-helpers';

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

interface ParsedRow {
  companyName: string;
  inn: string;
  contactFullName: string;
  email: string;
  website: string;
  position: string;
  phone: string;
  notes: string;
}

interface ImportResult {
  companiesCreated: number;
  companiesUpdated: number;
  contactsCreated: number;
}

const FIELD_OPTIONS: { value: FieldKey; label: string }[] = [
  { value: 'companyName', label: 'Название компании' },
  { value: 'exactName', label: 'Точное название' },
  { value: 'inn', label: 'ИНН' },
  { value: 'contactName', label: 'ФИО контакта' },
  { value: 'email', label: 'Email контакта' },
  { value: 'phone', label: 'Телефон контакта' },
  { value: 'position', label: 'Должность' },
  { value: 'website', label: 'Сайт компании' },
  { value: 'notes', label: 'Заметки' },
  { value: 'skip', label: '— Пропустить —' },
];

function applyMapping(row: any[], mapping: Record<number, FieldKey>): ParsedRow {
  const m: Record<string, string> = {};
  for (const [colIdx, field] of Object.entries(mapping)) {
    if (field !== 'skip') {
      m[field] = String(row[Number(colIdx)] || '').trim();
    }
  }
  return {
    companyName: m.exactName || m.companyName || '',
    inn: m.inn || '',
    contactFullName: m.contactName || '',
    email: m.email || '',
    phone: m.phone || '',
    position: m.position || '',
    website: m.website || '',
    notes: m.notes || '',
  };
}

// ═══════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════

export function ExcelImportButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Raw data from Excel
  const [rawRows, setRawRows] = useState<any[][] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<number, FieldKey>>({});

  // Steps: mapping → preview → importing → result
  const [step, setStep] = useState<'mapping' | 'preview' | 'importing' | 'result'>('mapping');
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [existingInns, setExistingInns] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [open, setOpen] = useState(false);

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
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const headerRow = (rows[0] ?? []).map((h: any) => String(h));
    const dataRows = rows.slice(1).filter((row: any[]) => row.some((cell: any) => String(cell).trim()));

    // Auto-detect mapping
    const autoMap: Record<number, FieldKey> = {};
    headerRow.forEach((h: string, i: number) => {
      autoMap[i] = autoDetectMapping(h);
    });

    setHeaders(headerRow);
    setRawRows(dataRows);
    setColumnMapping(autoMap);
    setStep('mapping');
    setResult(null);
    setOpen(true);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function goToPreview() {
    if (!rawRows) return;
    const parsed = rawRows.map((row) => applyMapping(row, columnMapping)).filter((r) => r.companyName || r.contactFullName);

    // Check existing INNs
    const inns = [...new Set(parsed.map((r) => r.inn).filter(Boolean))];
    if (inns.length > 0) {
      const supabase = createClient();
      const { data } = await supabase.from('companies').select('inn').in('inn', inns);
      setExistingInns(new Set((data ?? []).map((c) => c.inn).filter(Boolean)));
    } else {
      setExistingInns(new Set());
    }

    setPreview(parsed);
    setStep('preview');
  }

  async function executeImport() {
    setStep('importing');
    setProgress({ current: 0, total: preview.length });

    const supabase = createClient();
    const companyMap = new Map<string, { company: { name: string; inn: string; website: string; notes: string }; contacts: ParsedRow[] }>();

    for (const row of preview) {
      const key = row.inn || row.companyName;
      if (!key) continue;
      if (!companyMap.has(key)) {
        companyMap.set(key, {
          company: { name: row.companyName, inn: row.inn, website: row.website, notes: row.notes },
          contacts: [],
        });
      }
      if (row.contactFullName) {
        companyMap.get(key)!.contacts.push(row);
      }
    }

    let companiesCreated = 0, companiesUpdated = 0, contactsCreated = 0;
    let processed = 0;

    for (const [, { company, contacts }] of companyMap) {
      let companyId: string;

      if (company.inn) {
        const { data: existing } = await supabase.from('companies').select('id').eq('inn', company.inn).maybeSingle();
        if (existing) {
          companyId = existing.id;
          if (company.website) await supabase.from('companies').update({ website: company.website }).eq('id', companyId);
          companiesUpdated++;
        } else {
          const { data: newCo } = await supabase.from('companies').insert({ name: company.name, inn: company.inn || null, website: company.website || null, notes: company.notes || null }).select('id').single();
          companyId = newCo!.id;
          companiesCreated++;
        }
      } else {
        const { data: newCo } = await supabase.from('companies').insert({ name: company.name, inn: null, website: company.website || null, notes: company.notes || null }).select('id').single();
        companyId = newCo!.id;
        companiesCreated++;
      }

      for (const row of contacts) {
        const { firstName, lastName } = parseFullName(row.contactFullName);
        let contactId: string;

        if (row.email) {
          const { data: existing } = await supabase.from('contacts').select('id').eq('email', row.email).maybeSingle();
          if (existing) {
            contactId = existing.id;
            await supabase.from('contacts').update({
              ...(row.position ? { position: row.position } : {}),
              ...(row.phone ? { phone: row.phone } : {}),
            }).eq('id', contactId);
          } else {
            const { data: newC } = await supabase.from('contacts').insert({ first_name: firstName, last_name: lastName || null, email: row.email || null, phone: row.phone || null, position: row.position || null }).select('id').single();
            contactId = newC!.id;
            contactsCreated++;
          }
        } else {
          const { data: newC } = await supabase.from('contacts').insert({ first_name: firstName, last_name: lastName || null, email: null, phone: row.phone || null, position: row.position || null }).select('id').single();
          contactId = newC!.id;
          contactsCreated++;
        }

        await supabase.from('contact_company').upsert({ contact_id: contactId, company_id: companyId }, { onConflict: 'contact_id,company_id' });
        processed++;
        setProgress({ current: processed, total: preview.length });
      }

      if (contacts.length === 0) { processed++; setProgress({ current: processed, total: preview.length }); }
    }

    setResult({ companiesCreated, companiesUpdated, contactsCreated });
    setStep('result');
    queryClient.invalidateQueries({ queryKey: ['companies'] });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
  }

  const uniqueCompanies = preview.length > 0 ? new Set(preview.map((r) => r.inn || r.companyName)).size : 0;
  const dupeCount = preview.filter((r) => r.inn && existingInns.has(r.inn)).length;

  return (
    <>
      <button onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main">
        <Upload size={14} /> Импорт
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
                Импорт из Excel
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
                          onChange={(e) => setColumnMapping((prev) => ({ ...prev, [i]: e.target.value as FieldKey }))}
                          className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text-main focus:border-accent focus:outline-none"
                        >
                          {FIELD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                  <button onClick={closeModal} className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim hover:bg-surface2">Отмена</button>
                  <button onClick={goToPreview} className="flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                    Далее <ChevronRight size={14} />
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Preview */}
            {step === 'preview' && (
              <>
                <p className="mb-3 text-sm text-text-dim">
                  Найдено: <strong>{preview.length}</strong> строк → <strong>{uniqueCompanies}</strong> компаний
                </p>
                {dupeCount > 0 && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-yellow-l px-3 py-2 text-xs text-yellow">
                    <AlertTriangle size={14} />
                    {dupeCount} строк с ИНН которые уже в базе — данные будут дополнены
                  </div>
                )}
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="border-b border-border">
                        <th className="px-2 py-1.5 text-left text-text-mute font-medium">Компания</th>
                        <th className="px-2 py-1.5 text-left text-text-mute font-medium">ИНН</th>
                        <th className="px-2 py-1.5 text-left text-text-mute font-medium">Контакт</th>
                        <th className="px-2 py-1.5 text-left text-text-mute font-medium">Телефон</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 100).map((row, i) => (
                        <tr key={i} className={row.inn && existingInns.has(row.inn) ? 'bg-yellow/[0.06]' : ''}>
                          <td className="px-2 py-1 text-text-main truncate max-w-[180px]">{row.companyName}</td>
                          <td className="px-2 py-1 text-text-dim">{row.inn}</td>
                          <td className="px-2 py-1 text-text-main">{row.contactFullName}</td>
                          <td className="px-2 py-1 text-text-dim">{row.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.length > 100 && <p className="mt-1 text-[10px] text-text-mute">Показано 100 из {preview.length}</p>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setStep('mapping')} className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim hover:bg-surface2">← Назад</button>
                  <button onClick={executeImport} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                    Импортировать {preview.length} записей
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
              <div className="py-8 text-center">
                <Check size={32} className="mx-auto mb-3 text-green" />
                <p className="text-sm text-text-main">
                  Создано компаний: <strong>{result.companiesCreated}</strong>,
                  обновлено: <strong>{result.companiesUpdated}</strong>,
                  контактов: <strong>{result.contactsCreated}</strong>
                </p>
                <button onClick={closeModal} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90">Готово</button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
