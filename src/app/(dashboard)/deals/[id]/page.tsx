import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProjectDetail } from '@/components/projects/ProjectDetail';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DealDetailPage({ params }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { id } = await params;

  // Бэкстоп routing-контракта: delivery/internal живут на /projects/[id].
  // Страхует deep-links без типа (уведомления, timeline) и старые закладки.
  const { data: project } = await supabase
    .from('projects')
    .select('type')
    .eq('id', id)
    .maybeSingle();

  const projectType = (project as { type?: string } | null)?.type;
  if (projectType && projectType !== 'client') redirect(`/projects/${id}`);

  return <ProjectDetail projectId={id} context="deal" />;
}
