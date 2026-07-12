import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════
// AUDIT 2.1 — централизованная потеря сессии.
// Источников два: (1) глобальные onError мутаций/запросов (протухший JWT/401)
// и (2) событие SIGNED_OUT в use-auth (отзыв/logout). Общий guard, чтобы
// N упавших запросов + событие не дёргали редирект и тост по разу каждый.
// ═══════════════════════════════════════════════════════

let redirecting = false;

/**
 * Чистим кеш (иначе под anon-RLS покажется «пустая CRM» из stale-данных) и
 * уводим на /login полной навигацией (сбрасывает весь React-стейт).
 * @param showToast false для добровольного выхода — «Сессия истекла» там неуместно.
 */
export function handleSessionExpired(client: QueryClient, showToast = true): void {
  if (redirecting) return;
  // Уже на логине — не зацикливаемся (и не тостим).
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/login')) return;
  redirecting = true;
  if (showToast) toast.error('Сессия истекла — войдите заново');
  client.clear();
  if (typeof window !== 'undefined') window.location.replace('/login');
}
