import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProjectsSection } from '@/components/projects/ProjectsSection';

export default async function ProjectsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <Suspense
      fallback={
        <div className="flex h-48 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-accent" />
        </div>
      }
    >
      <ProjectsSection />
    </Suspense>
  );
}
