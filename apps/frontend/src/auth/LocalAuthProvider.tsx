import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AppAuth, type AuthProfile } from './types'

const STORAGE_KEY = 'escape-room:dev-profile'

/**
 * Development identity with no Clerk, no keys and no network.
 *
 * You type a username and a name and you are that person. The backend derives
 * a user id from the username, so signing in again with the same name resumes
 * the same game — useful for checking that progress actually persists.
 *
 * The profile is kept in localStorage purely so a page reload does not throw
 * you out. It is not a credential and it protects nothing; the backend refuses
 * this mode entirely unless it was started with AUTH_MODE=local, which no
 * deployed environment does.
 */
export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AuthProfile | null>(readStored)

  const signIn = useCallback((next: AuthProfile) => {
    setProfile(next)
    write(next)
  }, [])

  const signOut = useCallback(() => {
    setProfile(null)
    write(null)
  }, [])

  const updateProfile = useCallback(async (patch: Partial<AuthProfile>) => {
    setProfile((current) => {
      const next = {
        username: patch.username ?? current?.username ?? null,
        firstName: patch.firstName ?? current?.firstName ?? null,
        lastName: patch.lastName ?? current?.lastName ?? null,
      }
      write(next)
      return next
    })
  }, [])

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!profile?.username) return {}
    return {
      'X-Dev-Username': profile.username,
      ...(profile.firstName ? { 'X-Dev-First-Name': profile.firstName } : {}),
      ...(profile.lastName ? { 'X-Dev-Last-Name': profile.lastName } : {}),
    }
  }, [profile])

  const value = useMemo<AppAuth>(
    () => ({
      mode: 'local',
      // Nothing to load: the profile is read synchronously from localStorage.
      isLoaded: true,
      isSignedIn: profile?.username != null,
      profile,
      authHeaders,
      updateProfile,
      signOut,
      signIn,
    }),
    [profile, authHeaders, updateProfile, signOut, signIn],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function readStored(): AuthProfile | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthProfile>
    return parsed.username
      ? {
          username: parsed.username,
          firstName: parsed.firstName ?? null,
          lastName: parsed.lastName ?? null,
        }
      : null
  } catch {
    // Private-mode Safari, disabled storage, or corrupt JSON. None of them
    // should stop somebody starting a game.
    return null
  }
}

function write(profile: AuthProfile | null): void {
  try {
    if (profile) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Not fatal — the session just will not survive a reload.
  }
}
