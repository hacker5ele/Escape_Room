/**
 * The one API call the scaffold makes, to prove the frontend can reach the
 * backend through the proxy.
 *
 * The real client — typed with the schemas from `@escape-room/shared` — gets
 * built when the game does. Note the relative path: no backend URL is ever
 * compiled into the frontend. Vite proxies `/api` in development and nginx
 * proxies it in production, so both are same-origin. See ADR-0009.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export interface HealthStatus {
  status: string
  uptime: number
}

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${BASE_URL}/health`, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`Backend answered ${response.status}`)
  }
  return (await response.json()) as HealthStatus
}
