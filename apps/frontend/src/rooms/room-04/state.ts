import type { VisionDef } from './story'

export interface RoomState {
  visionsSolved: Set<VisionDef['id']>
  hasWand: boolean
  wizardBanished: boolean
}

export function createInitialState(): RoomState {
  return {
    visionsSolved: new Set(),
    hasWand: false,
    wizardBanished: false,
  }
}

export type RoomAction =
  | { type: 'SOLVE_VISION'; id: VisionDef['id']; reward: 'hint' | 'wand' }
  | { type: 'BANISH_WIZARD' }

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'SOLVE_VISION': {
      const next = new Set(state.visionsSolved)
      next.add(action.id)
      return { ...state, visionsSolved: next, hasWand: state.hasWand || action.reward === 'wand' }
    }

    case 'BANISH_WIZARD':
      return { ...state, wizardBanished: true }

    default:
      return state
  }
}
