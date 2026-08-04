import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import { App } from './App'
import { AUTH_MODE } from './auth/types'
import { ClerkAuthProvider } from './auth/ClerkAuthProvider'
import { LocalAuthProvider } from './auth/LocalAuthProvider'
import { SyncProvider } from './sync/SyncProvider'

/**
 * Chooses the identity provider once, here.
 *
 * A single component that branched internally would mean calling Clerk's hooks
 * conditionally, which React does not allow — so the choice is made by picking
 * which provider to render, and everything below talks to `useAppAuth()`
 * without knowing which one it got.
 */
function AuthProvider({ children }: { children: ReactNode }) {
  if (AUTH_MODE === 'local') {
    return <LocalAuthProvider>{children}</LocalAuthProvider>
  }

  // Publishable keys are meant to be public — they identify the Clerk instance
  // and carry no authority. The secret key never comes near the frontend.
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  if (!publishableKey) {
    throw new Error(
      'VITE_CLERK_PUBLISHABLE_KEY is not set. Either paste the publishable key from the Clerk ' +
        'dashboard, or set VITE_AUTH_MODE=local to develop without Clerk.',
    )
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkAuthProvider>{children}</ClerkAuthProvider>
    </ClerkProvider>
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element in index.html')

createRoot(container).render(
  <StrictMode>
    <AuthProvider>
      {/* Inside the auth provider: the poll needs an identity, and stops
          entirely when there is not one. */}
      <SyncProvider>
        <App />
      </SyncProvider>
    </AuthProvider>
  </StrictMode>,
)
