import { Request, Response, NextFunction } from "express";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Wraps an async route handler so that any thrown error is forwarded to
 * Express's global error handler instead of causing an unhandled rejection.
 *
 * Usage:
 *   router.get("/path", wrap(async (req, res) => { ... }));
 */
export function wrap(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
