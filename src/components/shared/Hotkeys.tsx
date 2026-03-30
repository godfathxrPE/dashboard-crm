'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Глобальные хоткеи (активны когда не в input/textarea/select)
 *
 * g+d = Dashboard
 * g+t = Tasks
 * g+p = Projects
 * g+c = Calls
 * g+m = Meetings
 * g+o = Companies
 * g+n = Contacts
 * g+a = Analytics
 */
export function Hotkeys() {
  const router = useRouter();

  useEffect(() => {
    let gPressed = false;
    let gTimeout: ReturnType<typeof setTimeout>;

    function isInputFocused(): boolean {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();

      if (key === 'g') {
        gPressed = true;
        clearTimeout(gTimeout);
        gTimeout = setTimeout(() => { gPressed = false; }, 500);
        return;
      }

      if (gPressed) {
        gPressed = false;
        clearTimeout(gTimeout);
        const routes: Record<string, string> = {
          d: '/',
          t: '/tasks',
          p: '/projects',
          c: '/calls',
          m: '/meetings',
          o: '/companies',
          n: '/contacts',
          a: '/analytics',
          s: '/settings',
        };
        if (routes[key]) {
          e.preventDefault();
          router.push(routes[key]);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(gTimeout);
    };
  }, [router]);

  return null; // Renderless component
}
