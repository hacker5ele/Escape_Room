import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalAuthProvider } from './LocalAuthProvider'
import { LocalSignIn } from './LocalSignIn'
import { useAppAuth } from './useAppAuth'

/** Renders whatever the provider currently exposes, so tests can assert on it. */
function Probe() {
  const { isSignedIn, profile, mode } = useAppAuth()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="signed-in">{String(isSignedIn)}</span>
      <span data-testid="username">{profile?.username ?? ''}</span>
      <span data-testid="name">{[profile?.firstName, profile?.lastName].filter(Boolean).join(' ')}</span>
    </div>
  )
}

function renderLocal() {
  return render(
    <LocalAuthProvider>
      <Probe />
      <LocalSignIn />
    </LocalAuthProvider>,
  )
}

afterEach(() => {
  window.localStorage.clear()
})

describe('local development auth', () => {
  it('starts signed out', () => {
    renderLocal()
    expect(screen.getByTestId('mode')).toHaveTextContent('local')
    expect(screen.getByTestId('signed-in')).toHaveTextContent('false')
  })

  it('signs in with just a username and a name — no password, no network', async () => {
    renderLocal()

    await userEvent.type(screen.getByLabelText(/username/i), 'ada')
    await userEvent.type(screen.getByLabelText(/first name/i), 'Ada')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Lovelace')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))

    await waitFor(() => {
      expect(screen.getByTestId('signed-in')).toHaveTextContent('true')
    })
    expect(screen.getByTestId('username')).toHaveTextContent('ada')
    expect(screen.getByTestId('name')).toHaveTextContent('Ada Lovelace')
  })

  it('refuses to sign in on whitespace alone', async () => {
    renderLocal()

    // A blank field is caught by the browser's own `required` validation, which
    // never reaches the submit handler. Spaces get past that, which is exactly
    // why the handler trims and checks again.
    await userEvent.type(screen.getByLabelText(/username/i), '   ')
    await userEvent.type(screen.getByLabelText(/first name/i), '   ')
    await userEvent.type(screen.getByLabelText(/last name/i), '   ')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByTestId('signed-in')).toHaveTextContent('false')
  })

  it('survives a reload', async () => {
    const first = renderLocal()
    await userEvent.type(screen.getByLabelText(/username/i), 'grace')
    await userEvent.type(screen.getByLabelText(/first name/i), 'Grace')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Hopper')
    await userEvent.click(screen.getByRole('button', { name: /enter/i }))
    await waitFor(() => expect(screen.getByTestId('signed-in')).toHaveTextContent('true'))

    // Unmount first, so the second render is genuinely a fresh page load
    // reading localStorage rather than a second copy alongside the first.
    first.unmount()

    const second = render(
      <LocalAuthProvider>
        <Probe />
      </LocalAuthProvider>,
    )
    expect(second.getByTestId('signed-in')).toHaveTextContent('true')
    expect(second.getByTestId('username')).toHaveTextContent('grace')
  })

  it('does not fall over when localStorage is unavailable', () => {
    const original = window.localStorage.getItem
    window.localStorage.getItem = () => {
      throw new Error('private mode')
    }

    // Private-mode Safari and disabled storage both throw here. Signing in is
    // more important than remembering it.
    expect(() => renderLocal()).not.toThrow()
    expect(screen.getByTestId('signed-in')).toHaveTextContent('false')

    window.localStorage.getItem = original
  })
})
