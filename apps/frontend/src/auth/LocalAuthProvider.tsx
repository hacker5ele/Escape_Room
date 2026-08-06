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

/** What we keep locally: the profile, plus the character standing in for Clerk. */
interface StoredProfile extends AuthProfile {
  character: unknown
}

export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredProfile | null>(readStored)

  const signIn = useCallback((next: AuthProfile) => {
    const record: StoredProfile = { ...next, character: null }
    setStored(record)
    write(record)
  }, [])

  const signOut = useCallback(() => {
    setStored(null)
    write(null)
  }, [])

  const updateProfile = useCallback(async (patch: Partial<AuthProfile>) => {
    setStored((current) => {
      const next: StoredProfile = {
        username: patch.username ?? current?.username ?? null,
        firstName: patch.firstName ?? current?.firstName ?? null,
        lastName: patch.lastName ?? current?.lastName ?? null,
        // Kept, not cleared: this is the composed character, and rebuilding a
        // profile should not wipe the face off it.
        imageUrl: patch.imageUrl ?? current?.imageUrl ?? null,
        character: current?.character ?? null,
      }
      write(next)
      return next
    })
  }, [])

  /**
   * Stand in for Clerk's profile-image upload.
   *
   * There is nowhere to upload to, so the composed picture is inlined as a data
   * URL and stored as `imageUrl`. That is the same field Clerk would populate,
   * which means `<Avatar>` and everything downstream behave identically in
   * development and in production without knowing which they are in.
   */
  const saveCharacter = useCallback(async (character: unknown, picture: Blob) => {
    const imageUrl = await readAsDataUrl(picture)
    setStored((current) => {
      const next: StoredProfile = {
        username: current?.username ?? null,
        firstName: current?.firstName ?? null,
        lastName: current?.lastName ?? null,
        imageUrl,
        character,
      }
      write(next)
      return next
    })
  }, [])

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!stored?.username) return {}
    return {
      'X-Dev-Username': stored.username,
      ...(stored.firstName ? { 'X-Dev-First-Name': stored.firstName } : {}),
      ...(stored.lastName ? { 'X-Dev-Last-Name': stored.lastName } : {}),
    }
  }, [stored])

  const profile = useMemo<AuthProfile | null>(
    () =>
      stored
        ? {
            username: stored.username,
            firstName: stored.firstName,
            lastName: stored.lastName,
            imageUrl: stored.imageUrl,
          }
        : null,
    [stored],
  )

  const value = useMemo<AppAuth>(
    () => ({
      mode: 'local',
      // Nothing to load: the profile is read synchronously from localStorage.
      isLoaded: true,
      isSignedIn: stored?.username != null,
      profile,
      authHeaders,
      updateProfile,
      storedCharacter: stored?.character ?? null,
      saveCharacter,
      signOut,
      signIn,
    }),
    [stored, profile, authHeaders, updateProfile, saveCharacter, signOut, signIn],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read your character.'))
    reader.readAsDataURL(blob)
  })
}

function readStored(): StoredProfile | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredProfile>
    return parsed.username
      ? {
          username: parsed.username,
          firstName: parsed.firstName ?? null,
          lastName: parsed.lastName ?? null,
          imageUrl: parsed.imageUrl ?? null,
          character: parsed.character ?? null,
        }
      : null
  } catch {
    // Private-mode Safari, disabled storage, or corrupt JSON. None of them
    // should stop somebody starting a game.
    return null
  }
}

function write(profile: StoredProfile | null): void {
  try {
    if (profile) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Not fatal — the session just will not survive a reload. A composed
    // character is a few hundred kilobytes of data URL, so this is also where
    // a full storage quota would surface.
  }
}
