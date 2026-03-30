import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Все маршруты кроме:
     * - _next/static (статика)
     * - _next/image (оптимизация изображений)
     * - favicon.ico, manifest.json, иконки
     * - api/webhooks (внешние хуки без auth)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sounds|api/webhooks).*)',
  ],
};
