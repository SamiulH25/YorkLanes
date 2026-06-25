/** API base URL. In dev, use the web origin (4321) so Vite proxies /api and session cookies work. */
export function getApiUrl(): string {
  return import.meta.env.PUBLIC_API_URL ?? "http://localhost:4321";
}
