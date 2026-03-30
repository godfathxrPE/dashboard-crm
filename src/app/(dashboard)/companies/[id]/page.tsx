import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CompanyDetail } from '@/components/companies/CompanyDetail';

interface PageProps { params: Promise<{ id: string }>; }

export default async function CompanyDetailPage({ params }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { id } = await params;
  return <CompanyDetail companyId={id} />;
}
