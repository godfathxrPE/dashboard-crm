export type HealthLevel = 'green' | 'yellow' | 'red';

export interface HealthScore {
  total: number;
  level: HealthLevel;
  factors: {
    lastContact: number;
    nextStep: number;
    deadline: number;
    completeness: number;
  };
}

interface ProjectForHealth {
  next_step?: string | null;
  deadline?: string | null;
  company_id?: string | null;
  contact_id?: string | null;
  budget?: number | null;
  last_contact_date?: string | null;
}

export function calculateDealHealth(project: ProjectForHealth): HealthScore {
  const now = Date.now();

  // 1. Last contact
  let lastContact = 0;
  if (project.last_contact_date) {
    const days = Math.floor((now - new Date(project.last_contact_date).getTime()) / 86400000);
    if (days <= 7) lastContact = 2;
    else if (days <= 14) lastContact = 1;
  }

  // 2. Next step
  const nextStep = project.next_step?.trim() ? 2 : 0;

  // 3. Deadline
  let deadline = 2;
  if (project.deadline) {
    const daysUntil = Math.floor((new Date(project.deadline).getTime() - now) / 86400000);
    if (daysUntil < 14) deadline = 0;
    else if (daysUntil < 30) deadline = 1;
  }

  // 4. Completeness
  const filled = [project.company_id, project.contact_id, project.budget].filter(Boolean).length;
  const completeness = filled >= 3 ? 2 : filled >= 2 ? 1 : 0;

  const total = lastContact + nextStep + deadline + completeness;
  const level: HealthLevel = total >= 6 ? 'green' : total >= 3 ? 'yellow' : 'red';

  return { total, level, factors: { lastContact, nextStep, deadline, completeness } };
}
