import { createContext } from 'react'

export type AuthMode = 'clerk' | 'local'

export interface AuthProfile {
  username: string | null
  firstName: string | null
  lastName: string | null
}

/**
 * One shape, two implementations: Clerk in deployed environments, and a local
 * "type a name" identity for development.
 *
 * The rest of the app talks only to this, so no component has to know which is
 * in use — and adding a room never means touching auth.
 */
export interface AppAuth {
  mode: AuthMode
  isLoaded: boolean
  isSignedIn: boolean
  profile: AuthProfile | null
  /** Headers that identify the caller to the API. */
  authHeaders: () => Promise<Record<string, string>>
  updateProfile: (patch: Partial<AuthProfile>) => Promise<void>
  signOut: () => void
  /** Local mode only — Clerk's own components handle signing in. */
  signIn?: (profile: AuthProfile) => void
}

/**
 * Provided by exactly one of `ClerkAuthProvider` or `LocalAuthProvider`, chosen
 * once in `main.tsx`. Two providers rather than one component that branches,
 * because branching would mean calling Clerk's hooks conditionally.
 */
export const AuthContext = createContext<AppAuth | null>(null)

/**
 * Which identity provider this build uses.
 *
 * Set to `local` in `.env.development`, so `npm run dev` needs no Clerk keys at
 * all. Production builds do not set it, so they get Clerk — and the backend
 * refuses to run its local mode with NODE_ENV=production regardless.
 */
export const AUTH_MODE: AuthMode =
  import.meta.env.VITE_AUTH_MODE === 'local' ? 'local' : 'clerk'
