import { createServer, type Server } from 'node:http'
import { createApp, type AppOptions } from '../app.js'

/**
 * Builds an app and starts **one** server for it, which every request reuses.
 *
 * This exists because of a real problem, not tidiness. Handed a bare Express
 * app, supertest starts a fresh HTTP server for each request and closes it
 * afterwards — so a suite of a few hundred requests opened and closed a few
 * hundred servers. Under load some of those connections were reset, and the
 * failure surfaced as whichever assertion happened to be next: the suite failed
 * about one run in two, a different test each time, and never reproducibly.
 *
 * Passing an already-listening server instead makes supertest reuse it.
 * `address()` is populated synchronously by `listen()`, so nothing here needs
 * to be awaited and no test had to become async.
 *
 * Imported as `createApp` by the test files, so a call site reads exactly as it
 * did before and the only difference is what comes back.
 */
const running: Server[] = []

export function createTestApp(options: AppOptions = {}): Server {
  const server = createServer(createApp(options))

  // Port 0 asks the operating system for any free port. Bound synchronously,
  // which is what lets this stay a plain function.
  server.listen(0)
  running.push(server)

  return server
}

/**
 * Shuts down everything the finished test started.
 *
 * Registered once as an `afterEach` in the setup file rather than repeated in
 * each test, so a new test file cannot forget it and start leaking servers
 * again.
 *
 * `closeAllConnections` first: `close` alone waits for keep-alive sockets to go
 * idle, and would hang the suite instead of ending it.
 */
export async function closeAll(): Promise<void> {
  const servers = running.splice(0)

  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        }),
    ),
  )
}
