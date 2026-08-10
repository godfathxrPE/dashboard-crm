import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LeadDetail } from '@/components/leads/LeadDetail';

interface PageProps { params: Promise<{ id: string }>; }

export default async function LeadDetailPage({ params }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { id } = await params;
  // Бэкстопа на тип (как в `deals/[id]`) здесь не нужно: у лида нет второй
  // страницы, в которую его можно было бы перенаправить.
  return <LeadDetail leadId={id} />;
}
