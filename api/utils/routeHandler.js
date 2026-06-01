/**
 * TempConnect — Route Handler Utilities
 *
 * Provides `catchAsync` — a wrapper for async Express route handlers that
 * automatically forwards unhandled errors to Express' centralized error handler.
 *
 * Benefits:
 *   - Eliminates boilerplate try/catch + logger.error + res.status(500) in routes
 *   - Unhandled errors are logged with FULL context (correlationId, userId, orgId,
 *     method, url, stack trace) by the centralized handler in app.js
 *   - Specific error handling (validation, 4xx) still works inside the handler
 *   - Adoptable incrementally — wrap one handler at a time
 *
 * Usage:
 *   import { catchAsync } from '../utils/routeHandler.js';
 *
 *   router.get('/items', requireAuth, catchAsync(async (req, res) => {
 *     const items = await service.list(pool);
 *     res.json(items);
 *     // No try/catch needed — unhandled errors go to centralized handler
 *   }));
 *
 *   // With specific error handling:
 *   router.post('/items', requireAuth, catchAsync(async (req, res) => {
 *     const parsed = schema.safeParse(req.body);
 *     if (!parsed.success) return res.status(400).json({ error: 'VALIDATION' });
 *     const item = await service.create(pool, parsed.data);
 *     res.status(201).json(item);
 *   }));
 */

/**
 * Wraps an async Express route handler so that rejected promises
 * are forwarded to `next(err)` — the centralized error handler.
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<void>} fn
 * @returns {import('express').RequestHandler}
 */
export function catchAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
