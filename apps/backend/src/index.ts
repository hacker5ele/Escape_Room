import { createApp } from './app.js'
import { config } from './config.js'

const app = createApp()

// The origin guard fails open when no secret is set, which is what makes local
// development and docker compose work. That is also a quiet way to end up with
// an unprotected API in production, so say so loudly rather than silently
// serving traffic that skipped CloudFront.
if (config.isProduction && config.originSecret === '') {
  console.warn(
    'WARNING: ORIGIN_SECRET is not set. The API will accept requests that did not come ' +
      'through CloudFront. This is expected under docker compose, where nginx is the only ' +
      'way in, and a misconfiguration anywhere else.',
  )
}

app.listen(config.port, () => {
  console.log(`Escape room API listening on http://localhost:${config.port} [${config.nodeEnv}]`)
})
