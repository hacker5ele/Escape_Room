import type { FriendListResponse, Invite, InvitePreview } from '@escape-room/shared'
import {
  friendListResponseSchema,
  inviteListResponseSchema,
  invitePreviewSchema,
  inviteSchema,
} from '@escape-room/shared'
import { request, requestPublic } from './client'

type Headers = Record<string, string>

/**
 * Every response is parsed against the shared schema rather than cast.
 *
 * A cast is a promise the compiler cannot keep: it makes the wire format a
 * matter of faith, and a response that does not match crashes somewhere far
 * from the fetch that caused it. Parsing fails here, with a message naming the
 * field. See ADR-0005 — the schemas are the contract, so the frontend may as
 * well hold the API to it.
 */
async function parsed<T>(response: Response, schema: { parse: (input: unknown) => T }): Promise<T> {
  return schema.parse(await response.json())
}

export async function listFriends(auth: Headers): Promise<FriendListResponse> {
  return parsed(await request('/friends', auth), friendListResponseSchema)
}

export async function addFriendByUsername(
  auth: Headers,
  username: string,
): Promise<FriendListResponse> {
  const response = await request('/friends/by-username', auth, {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
  return parsed(response, friendListResponseSchema)
}

export async function acceptFriend(auth: Headers, userId: string): Promise<FriendListResponse> {
  const response = await request(`/friends/${encodeURIComponent(userId)}/accept`, auth, {
    method: 'POST',
  })
  return parsed(response, friendListResponseSchema)
}

/** Rejecting a request and unfriending are the same operation. */
export async function removeFriend(auth: Headers, userId: string): Promise<FriendListResponse> {
  const response = await request(`/friends/${encodeURIComponent(userId)}`, auth, {
    method: 'DELETE',
  })
  return parsed(response, friendListResponseSchema)
}

export async function blockUser(auth: Headers, userId: string): Promise<FriendListResponse> {
  const response = await request(`/friends/${encodeURIComponent(userId)}/block`, auth, {
    method: 'POST',
  })
  return parsed(response, friendListResponseSchema)
}

export async function listInvites(auth: Headers): Promise<Invite[]> {
  const body = await parsed(await request('/invites', auth), inviteListResponseSchema)
  return body.invites
}

export async function createInvite(auth: Headers): Promise<Invite> {
  const response = await request('/invites', auth, { method: 'POST', body: '{}' })
  const body = (await response.json()) as { invite: unknown }
  return inviteSchema.parse(body.invite)
}

export async function revokeInvite(auth: Headers, token: string): Promise<void> {
  await request(`/invites/${encodeURIComponent(token)}`, auth, { method: 'DELETE' })
}

/**
 * Public on purpose — this is what makes a link a link. It works before the
 * visitor has an account, which is the whole reason for sending one.
 */
export async function previewInvite(token: string): Promise<InvitePreview> {
  return parsed(await requestPublic(`/invites/${encodeURIComponent(token)}`), invitePreviewSchema)
}

export async function acceptInvite(auth: Headers, token: string): Promise<FriendListResponse> {
  const response = await request(`/invites/${encodeURIComponent(token)}/accept`, auth, {
    method: 'POST',
  })
  return parsed(response, friendListResponseSchema)
}

/** The URL to actually send somebody. */
export function inviteLink(token: string): string {
  return `${window.location.origin}/invite/${token}`
}
