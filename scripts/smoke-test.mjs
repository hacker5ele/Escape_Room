#!/usr/bin/env node
/**
 * Verifies a deployed environment from the outside.
 *
 *   npm run smoke -- https://dev.cool.tf
 *   APPRUNNER_URL=https://xxxx.awsapprunner.com npm run smoke -- https://cool.tf
 *
 * Since ADR-0019 the game itself is behind a Clerk sign-in, and this script has
 * no way to hold a session — so it verifies the parts that are reachable
 * without one, and asserts that everything else is properly refused. That turns
 * out to cover most of what can silently break in the CDN and the API:
 * routing, headers, methods, the auth gate, the origin lock and the rate
 * limiter.
 *
 * Playing an actual game end to end against a deployment needs a Clerk testing
 * token; until that exists the room logic is covered by the 61 backend tests.
 *
 * Dependency-free so it runs anywhere. A non-zero exit fails the deploy.
 */

const baseUrl = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? '').replace(/\/$/, '')
const appRunnerUrl = (process.env.APPRUNNER_URL ?? '').replace(/\/$/, '')

if (!baseUrl) {
  console.error('Usage: npm run smoke -- https://cool.tf')
  process.exit(2)
}

const results = []

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
  // A CloudFront Function rewrites extensionless paths. If this breaks,
  // reloading inside a room shows an S3 XML error instead of the app.
  const response = await fetch(`${baseUrl}/room/room-02`, { redirect: 'follow' })
  assert(response.status === 200, `expected 200, got ${response.status}`)
  const html = await response.text()
  assert(html.includes('<div id="root">'), 'deep link did not return the app shell')
})

await check('a missing asset still 404s', async () => {
  // The rewrite must not swallow genuinely missing files, or a broken deploy
  // looks healthy.
  const response = await fetch(`${baseUrl}/assets/does-not-exist.js`, { redirect: 'follow' })
  assert(response.status >= 400, `expected an error status, got ${response.status}`)
})

// --- The API through the CDN ----------------------------------------------

await check('/api/health reaches the API', async () => {
  const response = await api('/api/health')
  assert(response.status === 200, `expected 200, got ${response.status}`)
  const body = await response.json()
  assert(body.status === 'ok', `expected status ok, got ${JSON.stringify(body)}`)
})

await check('POST reaches the API rather than being blocked by the CDN', async () => {
  // If the /api/* behavior does not allow POST, CloudFront answers 403 on its
  // own and the game can never start. A 401 proves the request reached the
  // origin and was refused by our own auth, which is the correct outcome.
  const response = await api('/api/sessions', { method: 'POST', body: {} })
  assert(response.status === 401, `expected 401 from the API, got ${response.status}`)
  const body = await response.json()
  assert(
    body.error?.code === 'UNAUTHENTICATED',
    `expected UNAUTHENTICATED, got ${body.error?.code}`,
  )
})

await check('the rooms are closed to anyone not signed in', async () => {
  for (const path of ['/api/rooms', '/api/rooms/room-01', '/api/sessions/me']) {
    const response = await api(path)
    assert(response.status === 401, `${path} returned ${response.status}, expected 401`)
  }
})

await check('a room cannot be solved without signing in', async () => {
  const response = await api('/api/rooms/room-01/attempt', { method: 'POST', body: { answer: 90 } })
  assert(response.status === 401, `expected 401, got ${response.status}`)
})

await check('API errors come back as JSON, not as the app shell', async () => {
  // Guards the CloudFront trap where a distribution-level error rule rewrites
  // API responses into index.html — which would make every locked room look
  // open. See ADR-0012.
  const response = await api('/api/rooms/room-01')
  const contentType = response.headers.get('content-type') ?? ''
  assert(
    contentType.includes('application/json'),
    `expected JSON, got "${contentType}" — the SPA fallback is swallowing API responses`,
  )
})

// --- Origin lock -----------------------------------------------------------

if (appRunnerUrl) {
  await check('the App Runner origin refuses traffic that skipped CloudFront', async () => {
    const response = await fetch(`${appRunnerUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert(response.status === 403, `expected 403 from the direct origin, got ${response.status}`)
  })
} else {
  console.log('  [33m–[0m origin lock not checked (set APPRUNNER_URL to include it)')
}

// --- Rate limiting. Last, because it burns this IP's quota for a minute. ----

await check('attempts are rate limited, and X-Forwarded-For cannot reset the count', async () => {
  // The limiter sits in front of the auth check on purpose, so it still
  // protects the answer endpoint against an attacker who never signs in.
  const attempt = (extraHeaders = {}) =>
    fetch(`${baseUrl}/api/rooms/room-01/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify({ answer: 0 }),
    })

  let limited = false
  for (let i = 0; i < 40 && !limited; i += 1) {
    const response = await attempt()
    if (response.status === 429) limited = true
  }
  assert(limited, 'never got a 429 — the rate limiter is not protecting the answer endpoint')

  // TRUST_PROXY verification. Express takes the client IP from the right of
  // X-Forwarded-For, counting back the trusted hops. Too many, and a client can
  // prepend a fake address for a fresh quota — which would let the rival team
  // brute-force a numeric answer.
  const spoofed = await attempt({
    'X-Forwarded-For': `203.0.113.${Math.floor(Math.random() * 250)}`,
  })
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
