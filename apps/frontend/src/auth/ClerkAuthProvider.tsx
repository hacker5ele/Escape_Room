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

  /**
   * Hand the character to Clerk, picture first.
   *
   * The picture goes up as the account's profile image, which is the whole
   * trick: `profile.service.ts` already caches `identity.imageUrl`, so friend
   * lists, chat, the leaderboard, notifications and Clerk's own account menu
   * all show the character without any of them being told it exists.
   *
   * The part ids follow in `unsafeMetadata` so the picker can be reopened.
   * `unsafeMetadata` rather than `publicMetadata` because only the former is
   * writable from a browser; nothing here is trusted, and the character is
   * cosmetic, so that is the right trade.
   *
   * Order matters. If the upload fails we have not yet claimed to have saved
   * anything, and the player is asked again — the reverse would leave a stored
   * character with no picture to match it.
   */
  const saveCharacter = useCallback(
    async (character: unknown, picture: Blob) => {
      if (!user) throw new Error('You are not signed in.')

      await user.setProfileImage({
        file: new File([picture], 'character.png', { type: 'image/png' }),
      })
      await user.update({
        unsafeMetadata: { ...user.unsafeMetadata, character },
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
            imageUrl: user.imageUrl ?? null,
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
      storedCharacter: user?.unsafeMetadata?.character ?? null,
      saveCharacter,
      signOut,
    }),
    [
      authLoaded,
      userLoaded,
      isSignedIn,
      profile,
      authHeaders,
      updateProfile,
      user?.unsafeMetadata?.character,
      saveCharacter,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
