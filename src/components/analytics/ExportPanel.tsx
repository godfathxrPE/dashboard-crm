'use client';

import { useState } from 'react';
import { Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useProjects } from '@/lib/hooks/use-projects';
import { usePipelineStagesMap } from '@/lib/hooks/use-pipelines';
import { useCalls } from '@/lib/hooks/use-calls';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useMeetings } from '@/lib/hooks/use-meetings';
import { localDateKey } from '@/lib/utils/date-helpers';

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return '\ufeff' + lines.join('\n'); // BOM for Excel
}

export function ExportPanel() {
  const { data: tasks } = useTasks();
  const { data: projects } = useProjects();
  const { data: calls } = useCalls();
  const { data: contacts } = useContacts();
  const { data: companies } = useCompanies();
  const { data: meetings } = useMeetings();
  const stagesMap = usePipelineStagesMap();
  const [exporting, setExporting] = useState<string | null>(null);

  function exportCSV(entity: string) {
    setExporting(entity);
    try {
      let csv = '';
      const date = localDateKey();

      switch (entity) {
        case 'tasks':
          csv = toCSV(
            ['ID', 'Текст', 'Статус', 'Приоритет', 'Дедлайн', 'Создано'],
            (tasks ?? []).map((t) => [t.id, t.text, t.lane, t.priority, t.deadline ?? '', t.created_at ?? ''])
          );
          downloadFile(csv, `tasks-${date}.csv`, 'text/csv;charset=utf-8');
          break;

        case 'projects':
          csv = toCSV(
            ['ID', 'Название', 'Стадия', 'Бюджет', 'Дедлайн', 'След.шаг', 'Создано'],
            (projects ?? []).map((p) => [p.id, p.name, (p.stage_id ? stagesMap.get(p.stage_id)?.name : '') ?? '', String(p.budget ?? ''), p.deadline ?? '', p.next_step ?? '', p.created_at])
          );
          downloadFile(csv, `projects-${date}.csv`, 'text/csv;charset=utf-8');
          break;

        case 'calls':
          csv = toCSV(
            ['ID', 'Дата', 'Статус', 'Компания', 'Контакт', 'Договорённости', 'След.шаг'],
            (calls ?? []).map((c) => [
              c.id, c.date, c.status,
              c.company?.name ?? '',
              c.contact ? `${c.contact.first_name} ${c.contact.last_name}` : '',
              c.agreements ?? '', c.next_step ?? '',
            ])
          );
          downloadFile(csv, `calls-${date}.csv`, 'text/csv;charset=utf-8');
          break;

        case 'contacts':
          csv = toCSV(
            ['ID', 'Имя', 'Фамилия', 'Должность', 'Телефон', 'Email'],
            (contacts ?? []).map((c) => [c.id, c.first_name, c.last_name, c.position ?? '', c.phone ?? '', c.email ?? ''])
          );
          downloadFile(csv, `contacts-${date}.csv`, 'text/csv;charset=utf-8');
          break;

        case 'companies':
          csv = toCSV(
            ['ID', 'Название', 'ИНН', 'Отрасль', 'Телефон', 'Email'],
            (companies ?? []).map((c) => [c.id, c.name, c.inn ?? '', c.industry ?? '', c.phone ?? '', c.email ?? ''])
          );
          downloadFile(csv, `companies-${date}.csv`, 'text/csv;charset=utf-8');
          break;
      }
    } finally {
      setExporting(null);
    }
  }

  function exportJSON() {
    setExporting('json');
    try {
      const backup = {
        exportedAt: new Date().toISOString(),
        tasks: tasks ?? [],
        projects: projects ?? [],
        calls: calls ?? [],
        contacts: contacts ?? [],
        companies: companies ?? [],
        meetings: meetings ?? [],
      };
      const json = JSON.stringify(backup, null, 2);
      const date = localDateKey();
      downloadFile(json, `crm-backup-${date}.json`, 'application/json');
    } finally {
      setExporting(null);
    }
  }

  const csvItems = [
    { key: 'tasks', label: 'Задачи', count: tasks?.length ?? 0, iconColor: 'text-accent' },
    { key: 'projects', label: 'Сделки', count: projects?.length ?? 0, iconColor: 'text-accent' },
    { key: 'calls', label: 'Звонки', count: calls?.length ?? 0, iconColor: 'text-green' },
    { key: 'contacts', label: 'Контакты', count: contacts?.length ?? 0, iconColor: 'text-yellow' },
    { key: 'companies', label: 'Компании', count: companies?.length ?? 0, iconColor: 'text-yellow' },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Download size={14} className="text-accent" />
        <span className="text-xs font-semibold text-text-dim">Экспорт данных</span>
      </div>

      {/* CSV exports */}
      <div className="mb-3 space-y-1.5">
        {csvItems.map((item) => (
          <button key={item.key} onClick={() => exportCSV(item.key)}
            disabled={exporting === item.key}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-hover disabled:opacity-50">
            <FileSpreadsheet size={13} className={item.iconColor} />
            <span className="flex-1 text-xs text-text-main">{item.label}</span>
            <span className="text-xs text-text-dim">{item.count} записей</span>
            {exporting === item.key && <Loader2 size={12} className="animate-spin" />}
          </button>
        ))}
      </div>

      {/* JSON backup */}
      <button onClick={exportJSON} disabled={exporting === 'json'}
        className="flex w-full items-center gap-2 rounded-lg border border-accent/30 bg-accent-l/30 px-3 py-2.5 transition-colors hover:bg-accent-l disabled:opacity-50">
        <FileJson size={14} className="text-accent" />
        <span className="flex-1 text-left text-xs font-medium text-accent">Полный бэкап (JSON)</span>
        {exporting === 'json' && <Loader2 size={12} className="animate-spin text-accent" />}
      </button>
    </div>
  );
}
