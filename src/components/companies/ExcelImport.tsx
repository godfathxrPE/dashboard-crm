'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Loader2, AlertTriangle, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface ParsedRow {
  companyName: string;
  inn: string;
  contactFullName: string;
  email: string;
  website: string;
  position: string;
  phone: string;
}

interface ImportResult {
  companiesCreated: number;
  companiesUpdated: number;
  contactsCreated: number;
}

function parseFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  // «Фамилия Имя» or «Фамилия Имя Отчество»
  return { firstName: parts[1], lastName: parts[0] };
}

export function ExcelImportButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [existingInns, setExistingInns] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const queryClient = useQueryClient();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const dataRows = rows.slice(1).filter(row => row[0] || row[3]);
    const parsed: ParsedRow[] = dataRows.map(row => ({
      companyName: String(row[2] || row[0] || '').trim(),
      inn: String(row[1] || '').trim(),
      contactFullName: String(row[3] || '').trim(),
      email: String(row[4] || '').trim(),
      website: String(row[5] || '').trim(),
      position: String(row[7] || '').trim(),
      phone: String(row[8] || '').trim(),
    }));

    // Check existing INNs
    const inns = [...new Set(parsed.map(r => r.inn).filter(Boolean))];
    if (inns.length > 0) {
      const supabase = createClient();
      const { data } = await supabase.from('companies').select('inn').in('inn', inns);
      setExistingInns(new Set((data ?? []).map(c => c.inn).filter(Boolean)));
    }

    setPreview(parsed);
    setResult(null);
    // Reset file input
    if (fileRef.current) fileRef.current.value = '';
  }

  async function executeImport() {
    if (!preview) return;
    setImporting(true);
    setProgress({ current: 0, total: preview.length });

    const supabase = createClient();

    // Group by company
    const companyMap = new Map<string, { company: { name: string; inn: string; website: string }; contacts: ParsedRow[] }>();
    for (const row of preview) {
      const key = row.inn || row.companyName;
      if (!key) continue;
      if (!companyMap.has(key)) {
        companyMap.set(key, {
          company: { name: row.companyName, inn: row.inn, website: row.website },
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
        const { data: existing } = await supabase
          .from('companies').select('id').eq('inn', company.inn).maybeSingle();

        if (existing) {
          companyId = existing.id;
          if (company.website) {
            await supabase.from('companies').update({ website: company.website }).eq('id', companyId);
          }
          companiesUpdated++;
        } else {
          const { data: newCo } = await supabase
            .from('companies').insert({ name: company.name, inn: company.inn || null, website: company.website || null }).select('id').single();
          companyId = newCo!.id;
          companiesCreated++;
        }
      } else {
        const { data: newCo } = await supabase
          .from('companies').insert({ name: company.name, inn: null, website: company.website || null }).select('id').single();
        companyId = newCo!.id;
        companiesCreated++;
      }

      for (const row of contacts) {
        const { firstName, lastName } = parseFullName(row.contactFullName);
        let contactId: string;

        if (row.email) {
          const { data: existing } = await supabase
            .from('contacts').select('id').eq('email', row.email).maybeSingle();

          if (existing) {
            contactId = existing.id;
            await supabase.from('contacts').update({
              ...(row.position ? { position: row.position } : {}),
              ...(row.phone ? { phone: row.phone } : {}),
            }).eq('id', contactId);
          } else {
            const { data: newC } = await supabase
              .from('contacts').insert({ first_name: firstName, last_name: lastName || null, email: row.email || null, phone: row.phone || null, position: row.position || null }).select('id').single();
            contactId = newC!.id;
            contactsCreated++;
          }
        } else {
          const { data: newC } = await supabase
            .from('contacts').insert({ first_name: firstName, last_name: lastName || null, email: null, phone: row.phone || null, position: row.position || null }).select('id').single();
          contactId = newC!.id;
          contactsCreated++;
        }

        // Link contact ↔ company
        await supabase.from('contact_company')
          .upsert({ contact_id: contactId, company_id: companyId }, { onConflict: 'contact_id,company_id' });

        processed++;
        setProgress({ current: processed, total: preview.length });
      }

      // If no contacts, still count progress
      if (contacts.length === 0) {
        processed++;
        setProgress({ current: processed, total: preview.length });
      }
    }

    setResult({ companiesCreated, companiesUpdated, contactsCreated });
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ['companies'] });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
  }

  const uniqueCompanies = preview ? new Set(preview.map(r => r.inn || r.companyName)).size : 0;
  const dupeCount = preview ? preview.filter(r => r.inn && existingInns.has(r.inn)).length : 0;

  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main"
      >
        <Upload size={14} />
        Импорт
      </button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />

      {/* Preview Modal — portaled to body */}
      {preview && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !importing && setPreview(null)}>
          <div className="relative z-[1000] w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-surface p-6 elevation-3" style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-main">Импорт из Excel</h2>
              {!importing && (
                <button onClick={() => setPreview(null)} className="p-1 text-text-mute hover:text-text-main"><X size={18} /></button>
              )}
            </div>

            {result ? (
              <div className="py-8 text-center">
                <Check size={32} className="mx-auto mb-3 text-green" />
                <p className="text-sm text-text-main">
                  Создано компаний: <strong>{result.companiesCreated}</strong>,
                  обновлено: <strong>{result.companiesUpdated}</strong>,
                  контактов: <strong>{result.contactsCreated}</strong>
                </p>
                <button onClick={() => setPreview(null)} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:opacity-90">
                  Готово
                </button>
              </div>
            ) : (
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

                <div className="max-h-[400px] overflow-auto rounded-lg border border-border">
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
                </div>
                {preview.length > 100 && (
                  <p className="mt-1 text-[10px] text-text-mute">Показано 100 из {preview.length}</p>
                )}

                {importing ? (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 text-sm text-text-dim">
                      <Loader2 size={16} className="animate-spin" />
                      Импортируется... {progress.current}/{progress.total}
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-border">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex justify-end gap-2">
                    <button onClick={() => setPreview(null)} className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim hover:bg-surface2">
                      Отмена
                    </button>
                    <button onClick={executeImport} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                      Импортировать {preview.length} записей
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
