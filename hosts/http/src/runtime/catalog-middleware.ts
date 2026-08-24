import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const continueApiCatalogRequest: RequestHandler = (
  _request,
  response,
  next,
): void => {
  if (!response.writableEnded && !response.destroyed) next();
};

/**
 * Adapts an Express middleware into the promise boundary used by catalog
 * hosts. Middleware may continue, reject, throw, or deliberately finish the
 * response; every path settles exactly once.
 */
export const invokeApiCatalogMiddleware = (
  middleware: RequestHandler,
  request: Request,
  response: Response,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      response.off('finish', responseEnded);
      response.off('close', responseEnded);
      complete();
    };
    const responseEnded = (): void => settle(resolve);
    const next: NextFunction = (error?: unknown): void => {
      settle(() => {
        if (error === undefined) resolve();
        else reject(error);
      });
    };

    response.once('finish', responseEnded);
    response.once('close', responseEnded);
    try {
      const pending = middleware(request, response, next);
      void Promise.resolve(pending).then(undefined, (error) =>
        settle(() => reject(error)),
      );
    } catch (error) {
      settle(() => reject(error));
    }
  });
