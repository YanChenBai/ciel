export function resolveAssetUrl(baseUrl: string | undefined, value: unknown): string | undefined {
  const path = assetPath(value);
  if (!baseUrl || !path) return;
  const normalized = path.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return;
  const segments = normalized.split('/');
  if (segments.some(segment => !segment || segment === '..')) return;
  return new URL(segments.map(encodeURIComponent).join('/'), baseUrl).href;
}

function assetPath(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('path' in value)) return;
  const path = (value as { readonly path?: unknown }).path;
  return typeof path === 'string' && path ? path : undefined;
}
