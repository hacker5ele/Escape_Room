import { describe, expect, it } from 'vitest'
import { PRESENCE_TTL_HIDDEN_MS, PRESENCE_TTL_VISIBLE_MS } from '@escape-room/shared'
import { LiveStore, type Standing } from './live-store.js'

/**
 * Membership is a claim you keep alive, not a row somebody has to delete.
 *
 * Every test here reads as a sentence about a tab: it was closed, it was
 * reloaded, it was hidden. That is the whole design (ADR-0045) — the store has
 * no concept of leaving, only of having stopped saying you are here.
 *
 * Time is passed in rather than faked. The store takes `now` on every call for
 * exactly this reason: a test about a timeout should not also be a test about
 * timers.
 */

const STANDING: Standing = {
  x: 800,
  y: 800,
  facing: 1,
  walking: false,
  character: { head: 'head-01', body: 'body-01', arm: 'arm-01', leg: 'leg-01' },
  ready: false,
  emote: null,
  emoteStartedAt: null,
}

const T0 = 1_000_000

describe('closing the tab', () => {
  it('takes you out of the game, not only out of the lobby', () => {
    const live = new LiveStore()
    live.claim('guest', 'host', T0)

    expect(live.hostOf('guest', T0)).toBe('host')
    expect(live.membersOf('host', T0)).toEqual(['guest'])

    // The tab is gone; nothing is ever told so. It simply stops beating.
    const later = T0 + PRESENCE_TTL_VISIBLE_MS + 1

    expect(live.hostOf('guest', later)).toBe('guest')
    expect(live.membersOf('host', later)).toEqual([])
  })

  it('frees the seat it was holding', () => {
    // The bug as reported: a closed tab kept one of four places in a friend's
    // game for ever, because the row had no expiry and only an explicit
    // "leave" removed it.
    const live = new LiveStore()
    live.claim('a', 'host', T0)
    live.claim('b', 'host', T0)
    live.claim('c', 'host', T0)
    expect(live.membersOf('host', T0)).toHaveLength(3)

    // `b` closes their tab. `a` and `c` carry on beating, as an open tab does
    // every five seconds — which is the part that makes this a test about `b`
    // rather than about all three going quiet together.
    let at = T0
    while (at < T0 + PRESENCE_TTL_VISIBLE_MS + 1) {
      at += 5_000
      live.alive('a', false, at)
      live.alive('c', false, at)
    }

    expect(live.membersOf('host', at).sort()).toEqual(['a', 'c'])
    expect(live.hostOf('b', at)).toBe('b')
  })

  it('does not put somebody back in a party they have already left', () => {
    // The laptop-lid case, and a bug this file caught: carrying the old claim
    // forward without checking it was still live meant coming back after a
    // minute silently rejoined the host's game — no join, and no chance for
    // the host to refuse it.
    const live = new LiveStore()
    live.claim('guest', 'host', T0)

    const muchLater = T0 + PRESENCE_TTL_VISIBLE_MS + 60_000
    live.alive('guest', false, muchLater)

    expect(live.hostOf('guest', muchLater)).toBe('guest')
    expect(live.membersOf('host', muchLater)).toEqual([])
  })

  it('stops sending their solves to the host', () => {
    // `hostOf` is the whole of the co-op indirection: a player who is no longer
    // here plays their own game again, which is the correct answer rather than
    // a special case.
    const live = new LiveStore()
    live.claim('guest', 'host', T0)
    expect(live.hostOf('guest', T0 + PRESENCE_TTL_VISIBLE_MS + 1)).toBe('guest')
  })
})

describe('reloading', () => {
  it('changes nothing at all', () => {
    // The reason there is no beacon and no rejoin. A reload takes about a
    // second, the entry is still warm, and the next beat refreshes it — so
    // there is no moment at which anybody watching sees anything happen.
    const live = new LiveStore()
    live.claim('guest', 'host', T0)

    const gone = T0 + 1_200 // the page is away while it loads
    const back = T0 + 2_000

    expect(live.hostOf('guest', gone)).toBe('host')
    live.alive('guest', false, back)
    expect(live.hostOf('guest', back)).toBe('host')
    expect(live.membersOf('host', back)).toEqual(['guest'])
  })

  it('keeps you in the party even if the reload is slow', () => {
    const live = new LiveStore()
    live.claim('guest', 'host', T0)

    const slow = T0 + PRESENCE_TTL_VISIBLE_MS - 500
    live.alive('guest', false, slow)

    expect(live.hostOf('guest', slow)).toBe('host')
  })
})

describe('patience depends on what the tab last said', () => {
  it('waits for a hidden tab, because the browser is throttling it', () => {
    // Chrome clamps timers in tabs hidden for more than five minutes to about
    // one a minute. Without this, looking at another tab for a while would
    // throw somebody out of their friend's game.
    const live = new LiveStore()
    live.claim('guest', 'host', T0)
    live.alive('guest', true, T0)

    const aMinuteLater = T0 + 60_000
    expect(live.hostOf('guest', aMinuteLater)).toBe('host')
  })

  it('does not wait for a visible one, because that is a closed tab', () => {
    const live = new LiveStore()
    live.claim('guest', 'host', T0)
    live.alive('guest', false, T0)

    expect(live.hostOf('guest', T0 + 60_000)).toBe('guest')
  })

  it('gives up on a hidden tab eventually', () => {
    const live = new LiveStore()
    live.claim('guest', 'host', T0)
    live.alive('guest', true, T0)

    expect(live.hostOf('guest', T0 + PRESENCE_TTL_HIDDEN_MS + 1)).toBe('guest')
  })

  it('takes the patience from the *last* beat, not the first', () => {
    const live = new LiveStore()
    live.alive('guest', true, T0)
    // They came back to the tab, and then closed it.
    live.alive('guest', false, T0 + 1_000)

    expect(live.lastSeenOf('guest', T0 + 1_000 + PRESENCE_TTL_VISIBLE_MS + 1)).toBeNull()
  })
})

describe('walking off the stage', () => {
  it('takes your character away and leaves you in the party', () => {
    // Opening the leaderboard is not leaving your friend's game.
    const live = new LiveStore()
    live.claim('guest', 'host', T0)
    live.stand('guest', false, STANDING, T0)
    expect(live.standingOf('guest', T0)).not.toBeNull()

    live.leaveStage('guest')

    expect(live.standingOf('guest', T0)).toBeNull()
    expect(live.hostOf('guest', T0)).toBe('host')
    expect(live.membersOf('host', T0)).toEqual(['guest'])
  })
})

describe('being here without being anywhere', () => {
  it('beats from a screen that has no stage', () => {
    // `useLiveness` runs above every screen. Somebody on the leaderboard is
    // live, hosts themselves, and is standing nowhere.
    const live = new LiveStore()
    live.alive('solo', false, T0)

    expect(live.hostOf('solo', T0)).toBe('solo')
    expect(live.standingOf('solo', T0)).toBeNull()
  })

  it('never has to be swept to be right', () => {
    // Correctness is on the read, not on the sweep — so an entry nobody has
    // tidied is still, correctly, not there.
    const live = new LiveStore()
    live.claim('guest', 'host', T0)

    const later = T0 + PRESENCE_TTL_VISIBLE_MS + 1
    expect(live.size()).toBe(1) // nothing has swept it
    expect(live.hostOf('guest', later)).toBe('guest')
    expect(live.membersOf('host', later)).toEqual([])
  })

  it('tidies itself once somebody beats', () => {
    const live = new LiveStore()
    live.claim('guest', 'host', T0)
    live.alive('somebody-else', false, T0 + PRESENCE_TTL_VISIBLE_MS + 1)

    expect(live.size()).toBe(1)
  })
})
