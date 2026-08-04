import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { defineRequestBoundary } from '../src/express/validate-request.js';

const request = (input: {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}): Request =>
  ({
    body: input.body ?? {},
    query: input.query ?? {},
    params: input.params ?? {},
  }) as Request;

const response = (): Response => ({ locals: {} }) as Response;

const runMiddleware = (
  middleware: RequestHandler,
  req: Request,
  res: Response,
): Promise<void> =>
  new Promise((resolve, reject) => {
    middleware(req, res, (error?: unknown) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });

describe('defineRequestBoundary', () => {
  it('excludes non-canonical schema outputs from its type contract', () => {
    // @ts-expect-error Request boundaries require canonicalizable outputs.
    const boundary = defineRequestBoundary({
      body: z.map(z.string(), z.string()),
    });

    expect(boundary).toBeDefined();
  });

  it('carries parsed output into a typed handler across intervening middleware', async () => {
    const boundary = defineRequestBoundary({
      body: z.object({ count: z.coerce.number().int().positive() }).strict(),
      params: z.object({ resourceId: z.string().min(1) }).strict(),
    });
    const req = request({
      body: { count: '2' },
      params: { resourceId: 'pricing' },
    });
    const res = response();
    const authenticate: RequestHandler = (authRequest, authResponse, next) => {
      authResponse.locals['actorId'] = 'actor-1';
      expect(authRequest.body).toEqual({ count: 2 });
      next();
    };

    await runMiddleware(boundary.validate, req, res);
    await runMiddleware(authenticate, req, res);

    const handle = vi.fn();
    const handler = boundary.handler((input) => {
      expectTypeOf(input.body.count).toEqualTypeOf<number>();
      expect(input).toEqual({
        body: { count: 2 },
        params: { resourceId: 'pricing' },
      });
      expect(res.locals['actorId']).toBe('actor-1');
      handle(input);
    });
    const next = vi.fn() as NextFunction;

    handler(req, res, next);
    await vi.waitFor(() => expect(handle).toHaveBeenCalledOnce());

    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed when validated input is replaced by later middleware', async () => {
    const boundary = defineRequestBoundary({
      body: z.object({ value: z.string() }).strict(),
    });
    const req = request({ body: { value: 'validated' } });
    const res = response();

    await runMiddleware(boundary.validate, req, res);
    req.body = { value: 'changed' };

    const handle = vi.fn();
    const next = vi.fn() as NextFunction;

    boundary.handler(handle)(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'request_boundary_changed_after_validation',
      }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('fails closed when nested validated input is mutated', async () => {
    const boundary = defineRequestBoundary({
      body: z
        .object({
          filters: z.object({ active: z.coerce.boolean() }).strict(),
        })
        .strict(),
    });
    const req = request({ body: { filters: { active: 1 } } });
    const res = response();

    await runMiddleware(boundary.validate, req, res);
    (req.body as { filters: { active: unknown } }).filters.active = false;

    const handle = vi.fn();
    const handler = boundary.handler(handle);
    const next = vi.fn() as NextFunction;

    handler(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'request_boundary_changed_after_validation',
      }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('fails closed when middleware introduces a non-canonical value', async () => {
    const boundary = defineRequestBoundary({
      body: z.object({ value: z.string() }).strict(),
    });
    const req = request({ body: { value: 'validated' } });
    const res = response();

    await runMiddleware(boundary.validate, req, res);
    req.body = new Map([['value', 'changed']]);

    const handle = vi.fn();
    const next = vi.fn() as NextFunction;

    boundary.handler(handle)(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'request_boundary_value_not_canonicalizable',
      }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('fails closed when its paired validator did not run', async () => {
    const boundary = defineRequestBoundary({
      body: z.object({ value: z.string() }).strict(),
    });
    const req = request({ body: { value: 'pricing' } });
    const res = response();
    const handle = vi.fn();
    const next = vi.fn() as NextFunction;

    boundary.handler(handle)(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'request_boundary_not_validated' }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('does not accept validation performed by another boundary', async () => {
    const schema = { body: z.object({ value: z.string() }).strict() };
    const first = defineRequestBoundary(schema);
    const second = defineRequestBoundary(schema);
    const req = request({ body: { value: 'pricing' } });
    const res = response();
    const handle = vi.fn();
    const next = vi.fn() as NextFunction;

    await runMiddleware(first.validate, req, res);
    second.handler(handle)(req, res, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'request_boundary_not_validated' }),
    );
    expect(handle).not.toHaveBeenCalled();
  });
});
