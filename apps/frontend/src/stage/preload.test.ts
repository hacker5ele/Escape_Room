import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { preloadImage } from './preload'

/**
 * Fetching the art before the moment it is needed.
 *
 * jsdom loads nothing, so the image is stubbed: what matters here is how many
 * times a URL is asked for and that nothing here can ever reject, not whether
 * bytes arrive.
 */

class FakeImage {
  static made: string[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  #src = ''

  decode(): Promise<void> {
    return Promise.resolve()
  }

  set src(value: string) {
    this.#src = value
    FakeImage.made.push(value)
    // A real one is asynchronous, and code that accidentally depends on it
    // being synchronous passes in a test and fails in a browser.
    queueMicrotask(() => this.onload?.())
  }

  get src(): string {
    return this.#src
  }
}

describe('preloading a picture', () => {
  beforeEach(() => {
    FakeImage.made = []
    vi.stubGlobal('Image', FakeImage)
  })
  afterEach(() => vi.restoreAllMocks())

  it('asks for a URL once, however often it is wanted', async () => {
    // The lobby preloads the room somebody is choosing, and they flick along
    // the row. Without this, every press is another download of the same wall.
    await Promise.all([
      preloadImage('/scenery/lobby-sofa.webp'),
      preloadImage('/scenery/lobby-sofa.webp'),
      preloadImage('/scenery/lobby-sofa.webp'),
    ])

    expect(FakeImage.made).toEqual(['/scenery/lobby-sofa.webp'])
  })

  it('remembers across separate calls, not only within one batch', async () => {
    await preloadImage('/scenery/lobby-lamp.webp')
    await preloadImage('/scenery/lobby-lamp.webp')

    expect(FakeImage.made).toHaveLength(1)
  })

  it('never rejects, because a missing picture is not an error anybody can act on', async () => {
    class BrokenImage extends FakeImage {
      override set src(value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', BrokenImage)

    await expect(preloadImage('/scenery/does-not-exist.webp')).resolves.toBeUndefined()
  })

  it('survives a decode that fails', async () => {
    // Safari rejects `decode()` for an image that is fine but not yet in the
    // document. Treating that as fatal would hold the whole screen.
    class UndecodableImage extends FakeImage {
      override decode(): Promise<void> {
        return Promise.reject(new Error('nope'))
      }
    }
    vi.stubGlobal('Image', UndecodableImage)

    await expect(preloadImage('/scenery/awkward.webp')).resolves.toBeUndefined()
  })
})
