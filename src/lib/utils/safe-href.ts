/**
 * safeHref — фильтр схемы для URL, пришедших из данных (вводятся руками и попадают
 * в <a href>). `javascript:`/`data:`/`vbscript:` URL — это stored-XSS по клику
 * коллеги, поэтому пропускаем только безопасные схемы.
 *
 * Пропускает: http/https, mailto/tel, и «голый» домен без схемы (считаем https).
 * Всё остальное → undefined: вызывающий рендерит текст без <a> (или не рендерит иконку).
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(mailto|tel):/i.test(trimmed)) return trimmed;
  // голый домен без схемы — считаем https
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(trimmed)) return `https://${trimmed}`;
  return undefined;
}
