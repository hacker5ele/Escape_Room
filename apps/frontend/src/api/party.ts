import type { Party } from '@escape-room/shared'
import { partyResponseSchema } from '@escape-room/shared'
import { request } from './client'

type Headers = Record<string, string>

const parse = async (response: Response): Promise<Party> =>
  partyResponseSchema.parse(await response.json()).party

export async function fetchParty(auth: Headers): Promise<Party> {
  return parse(await request('/party', auth))
}

export async function inviteToGame(auth: Headers, friendUserId: string): Promise<void> {
  await request(`/party/invite/${encodeURIComponent(friendUserId)}`, auth, { method: 'POST' })
}

export async function joinGame(auth: Headers, hostUserId: string): Promise<Party> {
  return parse(
    await request(`/party/join/${encodeURIComponent(hostUserId)}`, auth, { method: 'POST' }),
  )
}

export async function leaveGame(auth: Headers): Promise<Party> {
  return parse(await request('/party', auth, { method: 'DELETE' }))
}

export async function removeFromGame(auth: Headers, memberUserId: string): Promise<Party> {
  return parse(
    await request(`/party/members/${encodeURIComponent(memberUserId)}`, auth, {
      method: 'DELETE',
    }),
  )
}
