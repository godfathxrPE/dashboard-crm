import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TasksView } from '@/components/tasks/TasksView';

export default async function TasksPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // S-TASKS-RESTRUCTURE-1: DnD-борд лейнов (KanbanBoard) выведен из дефолта.
  // Компонент оставлен на диске неиспользуемым — дешёвый откат (git revert),
  // финальное удаление — отдельным PR.
  return <TasksView />;
}
