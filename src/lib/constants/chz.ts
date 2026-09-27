import { CHZ_GROUPS } from '@/lib/data/chz-groups';

// ═══════════════════════════════════════════════════════
// S-LEAD-V2-WORK-1: названия товарных групп ЧЗ для пикеров — без дублей (одна
// группа приходит из нескольких префиксов ОКВЭД), по алфавиту по-русски. Один
// список на все пикеры: `LeadModal`, `CompanyModal` и поповер квалификации лида.
//
// ⚠️ Живёт ЗДЕСЬ, а не в `lib/data/chz-groups.ts`: тот файл — точное зеркало
// `supabase/functions/ai-run/chz-groups.ts` (см. его шапку), и экспорт только для
// UI разводил бы копии (гейт S-LEAD-V2-WORK-1).
// ═══════════════════════════════════════════════════════

export const CHZ_GROUP_NAMES: string[] = [...new Set(CHZ_GROUPS.map((g) => g.group))].sort((a, b) =>
  a.localeCompare(b, 'ru'),
);
