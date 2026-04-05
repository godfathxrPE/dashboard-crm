const SECTION_MAP: Record<string, string> = {
  '/': 'dashboard',
  '/dashboard': 'dashboard',
  '/tasks': 'tasks',
  '/projects': 'projects',
  '/contacts': 'contacts',
  '/companies': 'companies',
  '/calls': 'calls',
  '/meetings': 'meetings',
  '/calendar': 'calendar',
  '/analytics': 'analytics',
  '/settings': 'settings',
};

export function getSectionFromPath(pathname: string): string {
  if (SECTION_MAP[pathname]) return SECTION_MAP[pathname];
  const match = Object.keys(SECTION_MAP)
    .filter((r) => r !== '/')
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname.startsWith(route + '/'));
  return match ? SECTION_MAP[match] : 'dashboard';
}
