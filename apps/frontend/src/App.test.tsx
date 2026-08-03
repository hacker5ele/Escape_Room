import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ROOM_IDS } from '@escape-room/shared'
import { App } from './App'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('renders the title', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    render(<App />)
    expect(screen.getByRole('heading', { name: /digitale escape room/i })).toBeInTheDocument()
  })

  it('lists the rooms declared by the shared contract', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    render(<App />)
    for (const roomId of ROOM_IDS) {
      expect(screen.getByText(roomId)).toBeInTheDocument()
    }
  })

  it('reports the backend as reachable when /api/health answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok', uptime: 12 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    render(<App />)
    expect(await screen.findByText(/reachable/i)).toBeInTheDocument()
  })

  it('reports the backend as unreachable when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    render(<App />)
    expect(await screen.findByText(/not reachable/i)).toBeInTheDocument()
  })
})
