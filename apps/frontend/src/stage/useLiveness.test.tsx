import { renderHook } from '@testing-library/react'
import { LIVENESS_BEAT_MS } from '@escape-room/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLiveness } from './useLiveness'
import { markStageBeat } from '../api/stage'

vi.mock('../auth/useAppAuth', () => ({
  useAppAuth: () => ({ authHeaders: async () => ({ Authorization: 'Bearer test' }) }),
}))

/**
 * "I still have the game open."
 *
 * The claim that keeps somebody in a party (ADR-0045). What matters is that it
 * beats from *every* screen, not only the stage — beat from one place and you
 * would leave your friend's game by opening the leaderboard.
 */
function beats(): string[] {
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
  return fetchMock.mock.calls.map(([input]) => String(input)).filter((u) => u.includes('/stage'))
}

describe('saying you are still here', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('beats as soon as the app is open, without waiting an interval', async () => {
    renderHook(() => useLiveness())
    await vi.advanceTimersByTimeAsync(0)

    expect(beats()).toHaveLength(1)
    expect(beats()[0]).toContain('/stage/alive')
  })

  it('keeps beating for as long as the app is open', async () => {
    renderHook(() => useLiveness())
    await vi.advanceTimersByTimeAsync(LIVENESS_BEAT_MS * 3 + 100)

    expect(beats().length).toBeGreaterThanOrEqual(4)
  })

  it('says whether the tab is hidden, because the server cannot tell', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    renderHook(() => useLiveness())
    await vi.advanceTimersByTimeAsync(0)

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ hidden: true })
  })

  it('does not stop while the tab is hidden', async () => {
    // Unlike `/api/sync` (ADR-0025). Stopping is indistinguishable from
    // closing, and telling those two apart is the whole feature.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    renderHook(() => useLiveness())
    await vi.advanceTimersByTimeAsync(LIVENESS_BEAT_MS * 2 + 100)

    expect(beats().length).toBeGreaterThanOrEqual(3)
  })

  it('stays quiet while the stage is beating, so it is one request not two', async () => {
    renderHook(() => useLiveness())
    await vi.advanceTimersByTimeAsync(0)
    const beforeStage = beats().length

    // The stage beats twice a second and renews the same claim, so for as long
    // as it is doing that this hook has nothing to say.
    for (let elapsed = 0; elapsed < LIVENESS_BEAT_MS * 2; elapsed += 500) {
      markStageBeat()
      await vi.advanceTimersByTimeAsync(500)
    }

    expect(beats().length).toBe(beforeStage)
  })

  it('speaks up again once the stage has stopped', async () => {
    // Leaving the lobby must not leave the game, so the beat has to take over
    // the moment the stage stops renewing the claim.
    renderHook(() => useLiveness())
    await vi.advanceTimersByTimeAsync(0)

    markStageBeat()
    await vi.advanceTimersByTimeAsync(LIVENESS_BEAT_MS * 3)

    expect(beats().length).toBeGreaterThan(1)
  })

  it('stops when the app is closed', async () => {
    const { unmount } = renderHook(() => useLiveness())
    await vi.advanceTimersByTimeAsync(0)
    const sent = beats().length

    unmount()
    await vi.advanceTimersByTimeAsync(LIVENESS_BEAT_MS * 3)

    expect(beats()).toHaveLength(sent)
  })
})

describe('nobody to be alive as', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('says nothing while signed out', async () => {
    // The locked door would otherwise beat a 401 every five seconds for as
    // long as somebody sat looking at it.
    renderHook(() => useLiveness({ enabled: false }))
    await vi.advanceTimersByTimeAsync(LIVENESS_BEAT_MS * 3)

    expect(beats()).toHaveLength(0)
  })
})
