import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProjectsView } from '@/components/projects/ProjectsView';

interface Props {
  searchParams: Promise<{ view?: string }>;
}

export default async function DealsPage({ searchParams }: Props) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const params = await searchParams;
  const view = params.view === 'board' ? 'board' : 'pipeline';

  return <ProjectsView initialView={view} />;
}
