import { useEffect, useRef } from 'react'

export interface KeyboardState {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  jump: boolean
}

const FORWARD_KEYS = new Set(['ArrowUp', 'KeyW'])
const BACK_KEYS = new Set(['ArrowDown', 'KeyS'])
const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA'])
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD'])
const JUMP_KEYS = new Set(['Space'])

export function useKeyboardControls() {
  const state = useRef<KeyboardState>({ forward: false, back: false, left: false, right: false, jump: false })

  useEffect(() => {
    function setKey(code: string, value: boolean) {
      if (FORWARD_KEYS.has(code)) state.current.forward = value
      else if (BACK_KEYS.has(code)) state.current.back = value
      else if (LEFT_KEYS.has(code)) state.current.left = value
      else if (RIGHT_KEYS.has(code)) state.current.right = value
      else if (JUMP_KEYS.has(code)) state.current.jump = value
    }

    function onKeyDown(e: KeyboardEvent) {
      if (JUMP_KEYS.has(e.code)) e.preventDefault()
      setKey(e.code, true)
    }
    function onKeyUp(e: KeyboardEvent) {
      setKey(e.code, false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return state
}
