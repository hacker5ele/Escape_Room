import type { Message } from '@escape-room/shared'
import { messageListResponseSchema, messageSchema } from '@escape-room/shared'
import { request } from './client'

type Headers = Record<string, string>

export async function fetchMessages(
  auth: Headers,
  friendUserId: string,
  since: string | undefined,
  signal?: AbortSignal,
): Promise<Message[]> {
  const query = since ? `?since=${encodeURIComponent(since)}` : ''
  const response = await request(
    `/chat/${encodeURIComponent(friendUserId)}/messages${query}`,
    auth,
    { signal },
  )
  return messageListResponseSchema.parse(await response.json()).messages
}

export async function sendMessage(
  auth: Headers,
  friendUserId: string,
  body: string,
): Promise<Message> {
  const response = await request(`/chat/${encodeURIComponent(friendUserId)}/messages`, auth, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
  const parsed = (await response.json()) as { message: unknown }
  return messageSchema.parse(parsed.message)
}

/** The cursor the conversation poll uses — matches the server's sort key. */
export function cursorFor(message: Message): string {
  return `${message.createdAt}#${message.id}`
}
