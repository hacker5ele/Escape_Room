import { Router } from 'express'

/** Used by the container healthcheck and by anyone checking the API is up. */
export function createHealthRoutes(): Router {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) })
  })

  return router
}
