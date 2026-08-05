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
  pollIntervalMs = INTERVAL_MS,
}: {
  friend: PublicProfile
  meUserId: string
  onClose: () => void
  /**
   * How often to ask for new messages. Exposed so a test can drive the poll
   * without a three-second wait or a fake clock, and so a future co-op view
   * can ask for a different cadence without a second implementation.
   */
  pollIntervalMs?: number
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

  /**
   * Deduped by id — the same guard the notification poll needs, for the same
   * reason.
   *
   * `advanceCursor` is false for a message we just sent. Our own message has a
   * later timestamp than anything the other person wrote in the seconds before
   * it, so moving the cursor to it would step straight over a reply that had
   * not been polled yet — and that message would never be fetched again.
   * Leaving the cursor alone costs one duplicate, which the dedupe below eats.
   */
  const absorb = useCallback((incoming: Message[], advanceCursor = true) => {
    if (incoming.length === 0) return
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]))
      for (const message of incoming) byId.set(message.id, message)
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    })
    if (!advanceCursor) return
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
      if (!controller.signal.aborted) timer = setTimeout(() => void tick(), pollIntervalMs)
    }

    void tick()

    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [friend.userId, absorb, pollIntervalMs])

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
      // Shown immediately rather than waiting up to three seconds for the poll
      // to bring back a message we already have — but without moving the
      // cursor, or a reply written just before ours would be skipped.
      absorb([message], false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send that.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="flex h-96 flex-col pane">
      <header className="flex items-center gap-3 border-b border-stock-900/30 p-3">
        <Avatar subject={friend} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm text-stock-900">{friend.displayName}</p>
          <p className="truncate font-mono text-xs text-stock-600">@{friend.username}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close conversation"
          className="rounded border border-stock-900/40 px-2 py-1 font-mono text-xs text-stock-700 transition hover:border-stock-900/70"
        >
          Close
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-sm text-stock-600">No messages yet. Say something.</p>
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
        className="flex gap-2 border-t border-stock-900/30 p-3"
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
          className="min-w-0 flex-1 field"
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          className="btn"
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
          mine ? 'bg-signal-500 text-stock-50' : 'bg-stock-200 text-stock-900'
        }`}
      >
        {/* Plain text. React escapes it; dangerouslySetInnerHTML must never
            come near a message somebody else wrote. */}
        <p className="break-words whitespace-pre-wrap">{message.body}</p>
      </div>
    </div>
  )
}
