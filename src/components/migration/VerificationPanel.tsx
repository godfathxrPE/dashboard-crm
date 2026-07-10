'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Loader2, Database, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface TableCount {
  table: string;
  label: string;
  count: number | null;
  error?: string;
}

const TABLES = [
  { table: 'profiles', label: 'Профили' },
  { table: 'tasks', label: 'Задачи' },
  { table: 'projects', label: 'Сделки' },
  { table: 'companies', label: 'Компании' },
  { table: 'contacts', label: 'Контакты' },
  { table: 'contact_company', label: 'Связи контакт↔компания' },
  { table: 'calls', label: 'Звонки' },
  { table: 'meetings', label: 'Встречи' },
];

export function VerificationPanel() {
  const [counts, setCounts] = useState<TableCount[]>([]);
  const [loading, setLoading] = useState(false);

  async function verify() {
    setLoading(true);
    const supabase = createClient();
    const results: TableCount[] = [];

    for (const t of TABLES) {
      try {
        const { count, error } = await supabase
          .from(t.table)
          .select('*', { count: 'exact', head: true });

        results.push({
          table: t.table,
          label: t.label,
          count: error ? null : (count ?? 0),
          error: error?.message,
        });
      } catch (err) {
        results.push({
          table: t.table,
          label: t.label,
          count: null,
          error: (err as Error).message,
        });
      }
    }

    setCounts(results);
    setLoading(false);
  }

  useEffect(() => { verify(); }, []);

  const totalRows = counts.reduce((sum, c) => sum + (c.count ?? 0), 0);
  const hasErrors = counts.some((c) => c.error);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Database size={14} className="text-accent" />
        <span className="text-xs font-semibold text-text-dim">Верификация данных</span>
        <button onClick={verify} disabled={loading}
          className="ml-auto rounded p-1 text-text-mute hover:bg-surface-hover">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 size={20} className="animate-spin text-accent" />
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {counts.map((c) => (
              <div key={c.table} data-card
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-bg px-3 py-2">
                {c.error
                  ? <AlertCircle size={13} className="text-red" />
                  : <CheckCircle size={13} className="text-green" />
                }
                <span className="flex-1 text-xs text-text-main">{c.label}</span>
                {c.count != null ? (
                  <span className="text-xs font-semibold text-text-main">{c.count}</span>
                ) : (
                  <span className="text-[10px] text-red">{c.error}</span>
                )}
              </div>
            ))}
          </div>

          <div className={`mt-3 rounded-lg px-3 py-2 text-center text-xs
            ${hasErrors ? 'bg-red/10 text-red' : 'bg-green/10 text-green'}`}>
            {hasErrors
              ? 'Есть ошибки — проверь RLS и GRANT'
              : `Всё ОК · ${totalRows} записей в базе`
            }
          </div>
        </>
      )}
    </div>
  );
}
