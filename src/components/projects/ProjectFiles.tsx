'use client';

import { useRef, useState, useCallback } from 'react';
import { FileText, Plus, Download, Trash2, Upload } from 'lucide-react';
import {
  useProjectFiles,
  useUploadProjectFile,
  useDeleteProjectFile,
  useDownloadProjectFile,
  formatFileSize,
} from '@/lib/hooks/use-project-files';
import type { Database } from '@/types/database';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

interface ProjectFilesProps {
  projectId: string;
}

export function ProjectFiles({ projectId }: ProjectFilesProps) {
  const { data: files = [], isLoading } = useProjectFiles(projectId);
  const upload = useUploadProjectFile(projectId);
  const remove = useDeleteProjectFile(projectId);
  const download = useDownloadProjectFile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // S-PROJECT-WORKSPACE-1 (064): при мульти-загрузке коммент применяется ко всему батчу
  const [comment, setComment] = useState('');

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      for (const file of Array.from(fileList)) {
        upload.mutate({ file, comment });
      }
      setComment('');
    },
    [upload, comment],
  );

  function handleDelete(file: ProjectFile) {
    if (confirm(`Удалить «${file.file_name}»?`)) {
      remove.mutate(file);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-text-dim" />
          <span className="text-xs font-semibold text-text-main">Файлы</span>
          <span className="rounded-full bg-bg px-1.5 py-0.5 text-xs text-text-mute">
            {files.length}
          </span>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1
                     text-meta text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
        >
          <Plus size={12} />
          Файл
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Комментарий к файлу (необязательно)"
        className="mb-2 w-full rounded-lg border border-input bg-surface px-3 py-1.5
                   text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
      />

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-lg border border-dashed transition-colors ${
          dragOver ? 'border-accent bg-accent-l/30' : 'border-border/50'
        }`}
      >
        {isLoading ? (
          <p className="py-6 text-center text-xs text-text-mute">Загрузка...</p>
        ) : files.length === 0 && !upload.isPending ? (
          <div className="flex flex-col items-center py-6 text-center">
            <Upload size={20} strokeWidth={1.2} className="text-text-mute" />
            <p className="mt-2 text-xs text-text-mute">
              Нет прикреплённых файлов
            </p>
            <p className="text-xs text-text-mute">
              Перетащи сюда или нажми «+ Файл»
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-surface2 transition-colors"
              >
                <FileText size={14} className="shrink-0 text-text-mute" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <button
                    onClick={() => download(f.storage_path, f.file_name)}
                    className="min-w-0 truncate text-left text-text-main hover:text-accent transition-colors"
                    title={f.file_name}
                  >
                    {f.file_name}
                  </button>
                  {f.comment && (
                    <span className="block truncate text-meta text-text-mute" title={f.comment}>
                      {f.comment}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-text-mute">
                  {formatFileSize(f.file_size)}
                </span>
                <span className="shrink-0 text-xs text-text-mute">
                  {new Date(f.created_at!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </span>
                <button
                  onClick={() => handleDelete(f)}
                  className="shrink-0 rounded p-0.5 text-text-mute hover:text-red transition-colors"
                  aria-label="Удалить файл"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {upload.isPending && (
              <div className="px-3 py-2 text-xs text-text-mute animate-pulse">
                Загрузка файла...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
