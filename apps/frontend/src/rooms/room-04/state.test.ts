import { describe, expect, it } from 'vitest'
import { createInitialState, roomReducer } from './state'

describe('roomReducer', () => {
  it('starts with nothing solved and no wand', () => {
    const state = createInitialState()
    expect(state.visionsSolved.size).toBe(0)
    expect(state.hasWand).toBe(false)
    expect(state.wizardBanished).toBe(false)
  })

  it('records a solved vision without granting a wand for a hint reward', () => {
    const state = roomReducer(createInitialState(), { type: 'SOLVE_VISION', id: 'monastery', reward: 'hint' })
    expect(state.visionsSolved.has('monastery')).toBe(true)
    expect(state.hasWand).toBe(false)
  })

  it('grants the wand on a wand reward, and it stays granted after later solves', () => {
    let state = roomReducer(createInitialState(), { type: 'SOLVE_VISION', id: 'battlefield', reward: 'wand' })
    expect(state.hasWand).toBe(true)
    state = roomReducer(state, { type: 'SOLVE_VISION', id: 'urban', reward: 'hint' })
    expect(state.hasWand).toBe(true)
  })

  it('banishes the wizard independently of vision progress', () => {
    const state = roomReducer(createInitialState(), { type: 'BANISH_WIZARD' })
    expect(state.wizardBanished).toBe(true)
    expect(state.visionsSolved.size).toBe(0)
  })
})
