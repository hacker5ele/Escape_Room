import { SCENES, pieceSize, pieceUrl, type SceneName } from './scenes'
import { partUrl, type Character, type Slot } from '../character/parts'

/**
 * Fetching the art before the moment it is needed.
 *
 * A room is about a megabyte of scenery across thirty-odd files, and none of it
 * was asked for until the stage rendered — so on a cold cache the screen's
 * arrival animation played over empty boxes and the furniture appeared
 * afterwards, one piece at a time, with no animation at all. The scenery cannot
 * fly in if it is not there yet.
 *
 * So it is asked for while somebody is still looking at the screen before it:
 * the Rooms tab pulls the lobby down, the lobby pulls down whichever room is
 * selected. By the time PLAY is pressed the pictures are already decoded and
 * the transition has something to animate.
 *
 * `decode()` rather than just `load` matters here. A loaded image is bytes; a
 * decoded one is pixels, and the conversion happens on whichever frame first
 * tries to draw it — which is precisely the frame the animation is running on.
 */

/** One promise per URL, for the life of the page. Asking twice costs nothing. */
const started = new Map<string, Promise<void>>()

/**
 * Never rejects.
 *
 * A picture that will not load is a picture the stage skips; making callers
 * handle that would put a `catch` at every call site to ignore it there
 * instead.
 */
export function preloadImage(src: string): Promise<void> {
  const already = started.get(src)
  if (already) return already

  const pending = new Promise<void>((resolve) => {
    const image = new Image()
    image.onload = () =>
      void image.decode().then(
        () => resolve(),
        () => resolve(),
      )
    image.onerror = () => resolve()
    image.src = src
  })

  started.set(src, pending)
  return pending
}

/** Everything a scene draws: its wall, its floor and every prop standing in it. */
export function preloadScene(scene: SceneName): Promise<void> {
  const { wall, floor, props } = SCENES[scene]
  const pieces = [wall, floor, ...props.map((prop) => prop.piece)]

  return Promise.all(
    pieces
      // Skipping what the stage would skip anyway — a piece nobody has
      // generated yet is not a missing preload, it is not in the room.
      .filter((piece) => pieceSize(piece) !== null)
      .map((piece) => preloadImage(pieceUrl(piece))),
  ).then(() => undefined)
}

/**
 * The four parts a character is drawn from.
 *
 * Yours, specifically. It is the one character certain to be standing on the
 * stage, and the first frame that draws it is otherwise the first frame that
 * asks for its arms. A peer's parts cannot usefully be fetched ahead of time —
 * you learn what they look like on the same heartbeat that puts them in the
 * room.
 */
export function preloadCharacter(character: Character): Promise<void> {
  const slots: Slot[] = ['head', 'body', 'arm', 'leg']
  return Promise.all(slots.map((slot) => preloadImage(partUrl(slot, character[slot])))).then(
    () => undefined,
  )
}
