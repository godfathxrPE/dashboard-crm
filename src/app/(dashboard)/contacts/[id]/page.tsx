import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ContactDetailHub as ContactDetail } from '@/components/contacts/ContactDetailHub';

interface PageProps { params: Promise<{ id: string }>; }

export default async function ContactDetailPage({ params }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { id } = await params;
  return <ContactDetail contactId={id} />;
}
