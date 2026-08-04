import type { LocationId } from './locations'
import { STORY, type ItemId, type LockKind } from './story'

/** Single source of truth for game progress. No DOM, no rendering here. */
export interface RoomState {
  currentLocation: LocationId
  unlockedLocations: Set<LocationId>
  inventory: Set<ItemId>

  // Laboratory discovery flags
  dnaStep: number
  dnaComplete: boolean
  circuitSolved: boolean
  recordingStep: number
  recordingComplete: boolean
  terminalUnlocked: boolean
  locksSolved: Set<LockKind>
  lockAttempts: Record<LockKind, number>

  // Control room
  evidenceSelected: Set<string>
  evidenceWrongStreak: number
  evidenceCompiled: boolean
  powerRestored: boolean
  wiresConnected: Set<string>
  wireWrongAttempts: number

  // Global sequence flags
  lockdownActive: boolean
  corridorEntered: boolean
  cameraJumpTriggered: boolean
  gameOver: boolean
}

export function createInitialState(): RoomState {
  return {
    currentLocation: 'lab',
    unlockedLocations: new Set(['lab']),
    inventory: new Set(),

    dnaStep: 0,
    dnaComplete: false,
    circuitSolved: false,
    recordingStep: 0,
    recordingComplete: false,
    terminalUnlocked: false,
    locksSolved: new Set(),
    lockAttempts: { locker: 0, evidence: 0, exit: 0 },

    evidenceSelected: new Set(),
    evidenceWrongStreak: 0,
    evidenceCompiled: false,
    powerRestored: false,
    wiresConnected: new Set(),
    wireWrongAttempts: 0,

    lockdownActive: false,
    corridorEntered: false,
    cameraJumpTriggered: false,
    gameOver: false,
  }
}

export type RoomAction =
  | { type: 'ADVANCE_DNA' }
  | { type: 'SOLVE_CIRCUIT' }
  | { type: 'ADVANCE_RECORDING' }
  | { type: 'ADD_ITEM'; item: ItemId }
  | { type: 'UNLOCK_LOCATION'; location: LocationId }
  | { type: 'TRAVEL_TO'; location: LocationId }
  | { type: 'MARK_CORRIDOR_ENTERED' }
  | { type: 'MARK_CAMERA_JUMP_TRIGGERED' }
  | { type: 'SET_TERMINAL_UNLOCKED' }
  | { type: 'SOLVE_LOCK'; kind: LockKind }
  | { type: 'FAIL_LOCK'; kind: LockKind }
  | { type: 'TOGGLE_EVIDENCE'; id: string }
  | { type: 'EVIDENCE_WRONG' }
  | { type: 'EVIDENCE_COMPILED' }
  | { type: 'RESET_WIRE_BOARD' }
  | { type: 'CONNECT_WIRE'; color: string }
  | { type: 'WIRE_WRONG' }
  | { type: 'SET_POWER_RESTORED' }
  | { type: 'SET_LOCKDOWN_ACTIVE' }
  | { type: 'SET_GAME_OVER' }
  | { type: 'RESET' }

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'ADVANCE_DNA': {
      const dnaStep = state.dnaStep + 1
      return { ...state, dnaStep, dnaComplete: dnaStep >= STORY.dnaSequence.length }
    }
    case 'SOLVE_CIRCUIT':
      return { ...state, circuitSolved: true }
    case 'ADVANCE_RECORDING': {
      const recordingStep = state.recordingStep + 1
      return { ...state, recordingStep, recordingComplete: recordingStep >= STORY.recordingLines.length }
    }
    case 'ADD_ITEM':
      return { ...state, inventory: new Set(state.inventory).add(action.item) }
    case 'UNLOCK_LOCATION':
      return { ...state, unlockedLocations: new Set(state.unlockedLocations).add(action.location) }
    case 'TRAVEL_TO':
      return { ...state, currentLocation: action.location }
    case 'MARK_CORRIDOR_ENTERED':
      return { ...state, corridorEntered: true }
    case 'MARK_CAMERA_JUMP_TRIGGERED':
      return { ...state, cameraJumpTriggered: true }
    case 'SET_TERMINAL_UNLOCKED':
      return { ...state, terminalUnlocked: true }
    case 'SOLVE_LOCK':
      return { ...state, locksSolved: new Set(state.locksSolved).add(action.kind) }
    case 'FAIL_LOCK':
      return {
        ...state,
        lockAttempts: { ...state.lockAttempts, [action.kind]: state.lockAttempts[action.kind] + 1 },
      }
    case 'TOGGLE_EVIDENCE': {
      const evidenceSelected = new Set(state.evidenceSelected)
      if (evidenceSelected.has(action.id)) evidenceSelected.delete(action.id)
      else evidenceSelected.add(action.id)
      return { ...state, evidenceSelected }
    }
    case 'EVIDENCE_WRONG':
      return { ...state, evidenceWrongStreak: state.evidenceWrongStreak + 1 }
    case 'EVIDENCE_COMPILED':
      return { ...state, evidenceCompiled: true }
    case 'RESET_WIRE_BOARD':
      return { ...state, wiresConnected: new Set(), wireWrongAttempts: 0 }
    case 'CONNECT_WIRE':
      return { ...state, wiresConnected: new Set(state.wiresConnected).add(action.color) }
    case 'WIRE_WRONG':
      return { ...state, wireWrongAttempts: state.wireWrongAttempts + 1 }
    case 'SET_POWER_RESTORED':
      return { ...state, powerRestored: true }
    case 'SET_LOCKDOWN_ACTIVE':
      return { ...state, lockdownActive: true }
    case 'SET_GAME_OVER':
      return { ...state, gameOver: true }
    case 'RESET':
      return createInitialState()
    default:
      return state
  }
}
