import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TranscriptsView } from '@/components/transcripts/TranscriptsView';

export default async function TranscriptsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <TranscriptsView />;
}
