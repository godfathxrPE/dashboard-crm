import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProjectDetail } from '@/components/projects/ProjectDetail';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { id } = await params;

  // Бэкстоп routing-контракта: клиентские сделки живут на /deals/[id].
  // Страхует старые закладки и пропущенные call-site после переезда раздела.
  const { data: project } = await supabase
    .from('projects')
    .select('type')
    .eq('id', id)
    .maybeSingle();

  const projectType = (project as { type?: string } | null)?.type;
  if (projectType === 'client') redirect(`/deals/${id}`);

  return <ProjectDetail projectId={id} context="project" />;
}
