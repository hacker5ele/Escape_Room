import { useCallback, useMemo, type ReactNode } from 'react'
import { useAuth, useClerk, useUser } from '@clerk/react'
import { AuthContext, type AppAuth, type AuthProfile } from './types'

/**
 * Adapts Clerk to the shared auth interface.
 *
 * Must be rendered inside `<ClerkProvider>`. Kept as a separate component from
 * the local provider so Clerk's hooks are never called conditionally — the mode
 * is chosen once, in `main.tsx`, by picking which provider to render.
 */
export function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth()
  const { isLoaded: userLoaded, user } = useUser()
  const clerk = useClerk()

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [getToken])

  const updateProfile = useCallback(
    async (patch: Partial<AuthProfile>) => {
      if (!user) return
      // Only the keys actually supplied are sent. Writing a field back
      // unchanged is a pointless way to fail on an unrelated Clerk rule.
      await user.update({
        ...(patch.username != null ? { username: patch.username } : {}),
        ...(patch.firstName != null ? { firstName: patch.firstName } : {}),
        ...(patch.lastName != null ? { lastName: patch.lastName } : {}),
      })
    },
    [user],
  )

  const signOut = useCallback(() => {
    void clerk.signOut()
  }, [clerk])

  const profile = useMemo<AuthProfile | null>(
    () =>
      user
        ? {
            username: user.username ?? null,
            firstName: user.firstName ?? null,
            lastName: user.lastName ?? null,
          }
        : null,
    [user],
  )

  const value = useMemo<AppAuth>(
    () => ({
      mode: 'clerk',
      isLoaded: authLoaded && userLoaded,
      isSignedIn: isSignedIn === true,
      profile,
      authHeaders,
      updateProfile,
      signOut,
    }),
    [authLoaded, userLoaded, isSignedIn, profile, authHeaders, updateProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
