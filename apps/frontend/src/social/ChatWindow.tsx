import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message, PublicProfile } from '@escape-room/shared'
import { MAX_MESSAGE_LENGTH } from '@escape-room/shared'
import { cursorFor, fetchMessages, sendMessage } from '../api/chat'
import { useAppAuth } from '../auth/useAppAuth'
import { Avatar } from './Avatar'

/**
 * An open conversation polls faster than the bell does.
 *
 * Ten seconds is fine for "somebody added you"; it is far too slow for a
 * conversation, where the other person is watching the screen and waiting.
 */
const INTERVAL_MS = 3_000

export function ChatWindow({
  friend,
  meUserId,
  onClose,
}: {
  friend: PublicProfile
  meUserId: string
  onClose: () => void
}) {
  const { authHeaders } = useAppAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  const cursorRef = useRef<string | undefined>(undefined)
  const bottom = useRef<HTMLDivElement>(null)

  /** Deduped by id — the same guard the notification poll needs, for the same reason. */
  const absorb = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]))
      for (const message of incoming) byId.set(message.id, message)
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    })
    const last = incoming[incoming.length - 1]
    if (last) cursorRef.current = cursorFor(last)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (controller.signal.aborted) return
      if (document.visibilityState === 'visible') {
        try {
          absorb(
            await fetchMessages(
              await authRef.current(),
              friend.userId,
              cursorRef.current,
              controller.signal,
            ),
          )
          setError(null)
        } catch (caught) {
          // A 403 here is not transient — it means the friendship ended while
          // the window was open, and the conversation is genuinely closed now.
          if (caught instanceof Error && 'status' in caught && caught.status === 403) {
            setError('You are no longer friends, so this conversation is closed.')
            return
          }
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void tick(), INTERVAL_MS)
    }

    void tick()

    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [friend.userId, absorb])

  // Follow the conversation as it grows.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const submit = async () => {
    const body = draft.trim()
    if (!body || sending) return

    setSending(true)
    setError(null)
    try {
      const message = await sendMessage(await authRef.current(), friend.userId, body)
      setDraft('')
      // Absorbed immediately rather than waiting up to three seconds for the
      // poll to bring back a message we already have.
      absorb([message])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send that.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="flex h-96 flex-col rounded-lg border border-vault-800 bg-vault-900/60">
      <header className="flex items-center gap-3 border-b border-vault-800 p-3">
        <Avatar subject={friend} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm text-vault-100">{friend.displayName}</p>
          <p className="truncate font-mono text-xs text-vault-500">@{friend.username}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close conversation"
          className="rounded border border-vault-700 px-2 py-1 font-mono text-xs text-vault-300 transition hover:border-vault-500"
        >
          Close
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-sm text-vault-500">No messages yet. Say something.</p>
        )}
        {messages.map((message) => (
          <Bubble key={message.id} message={message} mine={message.authorUserId === meUserId} />
        ))}
        <div ref={bottom} />
      </div>

      {error && (
        <p role="alert" className="border-t border-red-900 bg-red-950/40 p-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <form
        className="flex gap-2 border-t border-vault-800 p-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Message ${friend.displayName}`}
          aria-label={`Message ${friend.displayName}`}
          maxLength={MAX_MESSAGE_LENGTH}
          autoComplete="off"
          className="min-w-0 flex-1 rounded border border-vault-700 bg-vault-950 px-3 py-2 font-mono text-sm text-vault-100 placeholder:text-vault-600"
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          className="rounded bg-signal-400 px-4 py-2 font-mono text-sm font-semibold text-vault-950 transition hover:bg-signal-300 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  )
}

function Bubble({ message, mine }: { message: Message; mine: boolean }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          mine ? 'bg-signal-400 text-vault-950' : 'bg-vault-800 text-vault-100'
        }`}
      >
        {/* Plain text. React escapes it; dangerouslySetInnerHTML must never
            come near a message somebody else wrote. */}
        <p className="break-words whitespace-pre-wrap">{message.body}</p>
      </div>
    </div>
  )
}
