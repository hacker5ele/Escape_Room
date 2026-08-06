import type { SyncResponse } from '@escape-room/shared'
import { syncResponseSchema } from '@escape-room/shared'
import { request } from './client'

export async function fetchSync(
  auth: Record<string, string>,
  since: string | undefined,
  signal?: AbortSignal,
): Promise<SyncResponse> {
  const query = since ? `?since=${encodeURIComponent(since)}` : ''
  const response = await request(`/sync${query}`, auth, { signal })
  return syncResponseSchema.parse(await response.json())
}

export async function markNotificationsRead(auth: Record<string, string>): Promise<void> {
  await request('/sync/read', auth, { method: 'POST' })
}
