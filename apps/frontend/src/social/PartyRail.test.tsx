import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GameEvent } from '@escape-room/shared'
import { PartyRail } from './PartyRail'
import { randomCharacter } from '../character/parts'
import type { RemoteActor } from '../stage/usePresence'

/**
 * The rail is the whole of "somebody else is in here with you" for the four
 * rooms that have no walkable stage to show it on, so what it must never do is
 * appear when it has nothing to say.
 */

function peer(name: string, overrides: Partial<RemoteActor> = {}): RemoteActor {
  return {
    userId: `user_${name}`,
    name,
    character: randomCharacter(),
    x: 800,
    y: 800,
    facing: 1,
    walking: false,
    emote: null,
    away: false,
    isHost: false,
    ...overrides,
  }
}

function event(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    at: new Date(0).toISOString(),
    type: 'attempt',
    ...overrides,
  } as GameEvent
}

describe('the party rail', () => {
  /**
   * Rooms 2 and 4 fill the screen with their own thing. A panel sitting on top
   * of them for somebody playing alone would be a cost with no benefit at all.
   */
  it('draws nothing at all when you are on your own', () => {
    const { container } = render(<PartyRail peers={[]} events={[]} onEmote={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names everybody else in the room', () => {
    render(<PartyRail peers={[peer('abigail'), peer('eleonora')]} events={[]} onEmote={vi.fn()} />)

    expect(screen.getByText('abigail')).toBeInTheDocument()
    expect(screen.getByText('eleonora')).toBeInTheDocument()
  })

  /**
   * Read off the shared activity log rather than sent for the purpose — every
   * one of these has been recorded against the game since ADR-0020, complete
   * with who did it, so nothing new travels for the rail to say it.
   */
  it('says what somebody just did, from the shared log', () => {
    render(
      <PartyRail
        peers={[peer('abigail')]}
        events={[
          event({ type: 'room_entered', roomId: 'room-02', actorUserId: 'user_abigail' }),
          event({ type: 'room_solved', roomId: 'room-02', actorUserId: 'user_abigail' }),
        ]}
        onEmote={vi.fn()}
      />,
    )

    // The newest entry wins — she entered the room *and* solved it, and only
    // the second is worth saying.
    expect(screen.getByText(/solved room 02/)).toBeInTheDocument()
    expect(screen.queryByText(/came into room 02/)).not.toBeInTheDocument()
  })

  it('ignores what you did yourself when describing somebody else', () => {
    render(
      <PartyRail
        peers={[peer('abigail')]}
        events={[event({ type: 'room_solved', roomId: 'room-02', actorUserId: 'user_me' })]}
        onEmote={vi.fn()}
      />,
    )

    expect(screen.getByText('just arrived')).toBeInTheDocument()
  })

  /** Same rule the stage uses, so "away" means one thing everywhere. */
  it('fades somebody nobody has heard from', () => {
    render(<PartyRail peers={[peer('abigail', { away: true })]} events={[]} onEmote={vi.fn()} />)

    expect(screen.getByText('abigail').closest('.party-rail-person')).toHaveAttribute('data-away')
  })
})

/**
 * The host is the one person whose actions carry no actor id — `actorFor` in
 * `rooms.routes.ts` leaves the game's owner off, which was right while the
 * owner was the only one who ever read the log. Without this the host is the
 * one member of the party the rail can never describe.
 */
describe('the host, whose actions are never stamped', () => {
  it('describes an unattributed event as the host doing it', () => {
    render(
      <PartyRail
        peers={[peer('hostie', { isHost: true })]}
        events={[event({ type: 'room_solved', roomId: 'room-01' })]}
        onEmote={vi.fn()}
      />,
    )

    expect(screen.getByText(/solved room 01/)).toBeInTheDocument()
  })

  it("does not hand the host's unattributed event to a guest", () => {
    render(
      <PartyRail
        peers={[peer('guestie', { isHost: false })]}
        events={[event({ type: 'room_solved', roomId: 'room-01' })]}
        onEmote={vi.fn()}
      />,
    )

    expect(screen.getByText('just arrived')).toBeInTheDocument()
  })
})
