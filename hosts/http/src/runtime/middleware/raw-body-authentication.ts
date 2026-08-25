import type { RequestHandler } from 'express';

export type RawBodyAuthenticationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; kind: string }>;

export const makeRawBodyAuthentication =
  (input: {
    verify: (input: {
      rawBody: Buffer;
      headers: Readonly<Record<string, string | readonly string[] | undefined>>;
    }) => RawBodyAuthenticationResult | Promise<RawBodyAuthenticationResult>;
    unavailable: (cause?: unknown) => unknown;
    rejected: (kind: string) => unknown;
    accepted?: (locals: Record<string, unknown>) => void;
  }): RequestHandler =>
  async (request, response, next) => {
    if (!Buffer.isBuffer(request.body)) {
      next(input.unavailable());
      return;
    }

    try {
      const result = await input.verify({
        rawBody: request.body,
        headers: request.headers,
      });
      if (!result.ok) {
        next(input.rejected(result.kind));
        return;
      }
      input.accepted?.(response.locals);
      next();
    } catch (cause) {
      next(input.unavailable(cause));
    }
  };
