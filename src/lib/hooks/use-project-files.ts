'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];

const BUCKET = 'project-files';

function queryKey(projectId: string) {
  return ['project-files', projectId] as const;
}

export function useProjectFiles(projectId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKey(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ProjectFile[];
    },
    enabled: !!projectId,
  });
}

export function useUploadProjectFile(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const storagePath = `${user.id}/${projectId}/${file.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Create metadata record
      const { data, error } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          user_id: user.id,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type || null,
          storage_path: storagePath,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ProjectFile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(projectId) });
    },
  });
}

export function useDeleteProjectFile(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: ProjectFile) => {
      // Delete from storage
      await supabase.storage.from(BUCKET).remove([file.storage_path]);
      // Delete metadata
      const { error } = await supabase
        .from('project_files')
        .delete()
        .eq('id', file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(projectId) });
    },
  });
}

export function useDownloadProjectFile() {
  const supabase = createClient();

  return async (storagePath: string, fileName: string) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60);

    if (error || !data?.signedUrl) {
      console.error('Download error:', error);
      return;
    }

    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.download = fileName;
    link.click();
  };
}

export function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
