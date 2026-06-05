const API_BASE = (import.meta.env.PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');

export function api(path: string) {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}
