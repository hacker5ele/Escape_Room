#!/usr/bin/env node
/**
 * Walks the real game against a deployed environment.
 *
 * Runs in the pipeline after every deploy, and by hand:
 *   npm run smoke -- https://dev.cool.tf
 *   npm run smoke -- https://cool.tf
 *
 * Optionally checks that the App Runner origin refuses direct traffic:
 *   APPRUNNER_URL=https://xxxx.awsapprunner.com npm run smoke -- https://cool.tf
 *
 * Deliberately dependency-free so it runs anywhere, including a bare CI step.
 * A non-zero exit fails the deploy.
 */

const baseUrl = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? '').replace(/\/$/, '')
const appRunnerUrl = (process.env.APPRUNNER_URL ?? '').replace(/\/$/, '')

if (!baseUrl) {
  console.error('Usage: npm run smoke -- https://cool.tf')
  process.exit(2)
}

/**
 * Room 1's answer. It also lives in the backend's solutions.fixture.ts — this
 * script cannot import TypeScript, so changing that puzzle means changing this
 * line too. The README's "adding a room" checklist says so.
 */
const ROOM_01_ANSWER = 90

const results = []
let sessionId = null

async function check(name, run) {
  try {
    await run()
    results.push({ name, ok: true })
    console.log(`  [32m✓[0m ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error })
    console.log(`  [31m✗[0m ${name}`)
    console.log(`      ${error.message}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function api(path, { method = 'GET', body, headers = {} } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'follow',
  })
}

console.log(`\nSmoke testing ${baseUrl}\n`)

// --- The site itself -------------------------------------------------------

await check('serves the built app', async () => {
  const response = await fetch(baseUrl, { redirect: 'follow' })
  assert(response.status === 200, `expected 200, got ${response.status}`)
  const html = await response.text()
  assert(html.includes('<div id="root">'), 'response does not look like the built index.html')
})

await check('SPA deep links fall back to index.html', async () => {
  // A CloudFront custom error response turns the S3 403 into index.html with a
  // 200. If this fails, reloading inside a room shows an XML error page.
  const response = await fetch(`${baseUrl}/room/room-02`, { redirect: 'follow' })
  assert(response.status === 200, `expected 200, got ${response.status}`)
  const html = await response.text()
  assert(html.includes('<div id="root">'), 'deep link did not return the app shell')
})

// --- The API through the CDN ----------------------------------------------

await check('/api/health reaches the API', async () => {
  const response = await api('/api/health')
  assert(response.status === 200, `expected 200, got ${response.status}`)
  const body = await response.json()
  assert(body.status === 'ok', `expected status ok, got ${JSON.stringify(body)}`)
})

await check('POST reaches the API and starts a game', async () => {
  // If the /api/* behavior does not allow POST, CloudFront answers 403 here
  // and the game can never start.
  const response = await api('/api/sessions', { method: 'POST', body: { playerName: 'Smoke Test' } })
  assert(response.status === 201, `expected 201, got ${response.status}`)
  const body = await response.json()
  assert(typeof body.session?.id === 'string', 'no session id in response')
  assert(Array.isArray(body.session.solvedRooms), 'session has no solvedRooms')
  assert(body.session.solvedRooms.length === 0, 'a new session should have nothing solved')
  sessionId = body.session.id
})

await check('the X-Session-Id header reaches the API intact', async () => {
  // A wrong origin request policy strips custom headers, which would make this
  // a 400 "missing session header" rather than the 403 we expect.
  const response = await api('/api/rooms/room-02')
  const body = await response.json()
  assert(response.status === 403, `expected 403, got ${response.status} ${JSON.stringify(body)}`)
  assert(body.error?.code === 'ROOM_LOCKED', `expected ROOM_LOCKED, got ${body.error?.code}`)
})

await check('room 1 is open and carries no solution', async () => {
  const response = await api('/api/rooms/room-01')
  assert(response.status === 200, `expected 200, got ${response.status}`)
  const body = await response.json()
  const serialized = JSON.stringify(body.room)
  assert(
    !serialized.includes(String(ROOM_01_ANSWER)),
    'the room payload contains its own answer — the solution is leaking to the browser',
  )
})

await check('a correct answer unlocks the next room', async () => {
  const response = await api('/api/rooms/room-01/attempt', {
    method: 'POST',
    body: { answer: ROOM_01_ANSWER },
  })
  assert(response.status === 200, `expected 200, got ${response.status}`)
  const body = await response.json()
  assert(body.correct === true, 'the known-good answer was rejected')
  assert(body.session.solvedRooms.includes('room-01'), 'room-01 not recorded as solved')
})

await check('progress persisted — room 2 now opens', async () => {
  // Also proves requests keep landing on the one App Runner instance. If this
  // 403s intermittently, something scaled past a single instance and the
  // in-memory session store is no longer coherent.
  const response = await api('/api/rooms/room-02')
  assert(response.status === 200, `expected 200, got ${response.status}`)
})

await check('a wrong answer does not unlock anything', async () => {
  const response = await api('/api/rooms/room-02/attempt', {
    method: 'POST',
    body: { answer: 'definitely-not-it' },
  })
  assert(response.status === 200, `expected 200, got ${response.status}`)
  const body = await response.json()
  assert(body.correct === false, 'a nonsense answer was accepted')
})

// --- Origin lock -----------------------------------------------------------

if (appRunnerUrl) {
  await check('the App Runner origin refuses traffic that skipped CloudFront', async () => {
    const response = await fetch(`${appRunnerUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: 'Bypass' }),
    })
    assert(response.status === 403, `expected 403 from the direct origin, got ${response.status}`)
  })
} else {
  console.log('  [33m–[0m origin lock not checked (set APPRUNNER_URL to include it)')
}

// --- Rate limiting. Last, because it burns this IP's quota for a minute. ----

await check('attempts are rate limited, and X-Forwarded-For cannot reset the count', async () => {
  const fresh = await api('/api/sessions', { method: 'POST', body: { playerName: 'Rate Limit' } })
  const freshSession = (await fresh.json()).session.id

  const attempt = (extraHeaders = {}) =>
    fetch(`${baseUrl}/api/rooms/room-01/attempt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': freshSession,
        ...extraHeaders,
      },
      body: JSON.stringify({ answer: 0 }),
    })

  let limited = false
  for (let i = 0; i < 40 && !limited; i += 1) {
    const response = await attempt()
    if (response.status === 429) limited = true
  }
  assert(limited, 'never got a 429 — the rate limiter is not protecting the answer endpoint')

  // TRUST_PROXY verification. Express takes the client IP from the right-hand
  // side of X-Forwarded-For, counting back the number of trusted hops. If that
  // number is too high, a client can prepend a fake address and get a fresh
  // quota — which would let the rival team brute-force a numeric answer.
  const spoofed = await attempt({ 'X-Forwarded-For': `203.0.113.${Math.floor(Math.random() * 250)}` })
  assert(
    spoofed.status === 429,
    `a spoofed X-Forwarded-For got past the rate limiter (status ${spoofed.status}). ` +
      'TRUST_PROXY is too permissive for this deployment.',
  )
})

// --- Summary ---------------------------------------------------------------

const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)

if (failed.length > 0) {
  console.log(`\n[31mFailed:[0m`)
  for (const result of failed) console.log(`  - ${result.name}: ${result.error.message}`)
  process.exit(1)
}

console.log('[32mAll good.[0m\n')
