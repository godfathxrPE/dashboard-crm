import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AnalyticsPage } from '@/components/analytics/AnalyticsPage';

export default async function AnalyticsRoute() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <AnalyticsPage />;
}
