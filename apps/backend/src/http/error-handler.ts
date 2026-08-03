import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import type { ApiErrorResponse } from '@escape-room/shared'
import { ApiError } from './api-error.js'
import { config } from '../config.js'

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorResponse = {
    error: { code: 'ROOM_NOT_FOUND', message: `Unknown endpoint: ${req.method} ${req.originalUrl}` },
  }
  res.status(404).json(body)
}

/**
 * The single place an error becomes a response.
 *
 * Anything we did not raise ourselves is logged and reported as a bare 500.
 * No stack traces, no library messages, nothing that tells an attacker what we
 * are running — on Thursday the other team is reading these responses.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    const body: ApiErrorResponse = { error: { code: error.code, message: error.message } }
    res.status(error.status).json(body)
    return
  }

  if (error instanceof ZodError) {
    const body: ApiErrorResponse = {
      error: { code: 'VALIDATION_ERROR', message: describeZodError(error) },
    }
    res.status(400).json(body)
    return
  }

  // Thrown by express.json() for malformed or oversized bodies.
  if (error instanceof SyntaxError && 'body' in error) {
    const body: ApiErrorResponse = {
      error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON.' },
    }
    res.status(400).json(body)
    return
  }
  if (isPayloadTooLarge(error)) {
    const body: ApiErrorResponse = {
      error: { code: 'VALIDATION_ERROR', message: 'Request body is too large.' },
    }
    res.status(413).json(body)
    return
  }

  if (!config.isTest) {
    console.error('Unhandled error:', error)
  }
  const body: ApiErrorResponse = {
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' },
  }
  res.status(500).json(body)
}

function describeZodError(error: ZodError): string {
  const first = error.issues[0]
  if (!first) return 'Invalid request.'
  const path = first.path.join('.')
  return path ? `${path}: ${first.message}` : first.message
}

function isPayloadTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: unknown }).type === 'entity.too.large'
  )
}
