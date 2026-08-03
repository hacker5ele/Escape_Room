import { useContext } from 'react'
import { AuthContext, type AppAuth } from './types'

export function useAppAuth(): AppAuth {
  const auth = useContext(AuthContext)
  if (!auth) {
    throw new Error('useAppAuth must be used inside ClerkAuthProvider or LocalAuthProvider.')
  }
  return auth
}
