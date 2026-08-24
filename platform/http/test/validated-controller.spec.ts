import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { defineValidatedController } from '../src/express/validated-controller.js';

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

describe('defineValidatedController', () => {
  it('excludes non-canonical schema outputs from its type contract', () => {
    const handle = vi.fn();

    const controller = defineValidatedController({
      request: {
        // @ts-expect-error Validated controllers require canonicalizable outputs.
        body: z.map(z.string(), z.string()),
      },
      handle,
    });

    expect(controller).toBeDefined();
  });

  it('carries parsed output into a typed handler across intervening middleware', async () => {
    const handled = vi.fn();
    const controller = defineValidatedController({
      request: {
        body: z.object({ count: z.coerce.number().int().positive() }).strict(),
        params: z.object({ resourceId: z.string().min(1) }).strict(),
      },
      handle: (input, context) => {
        expectTypeOf(input.body.count).toEqualTypeOf<number>();
        expect(input).toEqual({
          body: { count: 2 },
          params: { resourceId: 'pricing' },
        });
        expect(context.response.locals['actorId']).toBe('actor-1');
        handled(input);
      },
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

    await runMiddleware(controller.validate, req, res);
    await runMiddleware(authenticate, req, res);
    const next = vi.fn() as NextFunction;
    await controller.handle(req, res, next);

    expect(handled).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it('composes per-location validators around intervening middleware', async () => {
    const handled = vi.fn();
    const controller = defineValidatedController({
      request: {
        params: z.object({ resourceId: z.string().min(1) }).strict(),
        body: z.object({ count: z.coerce.number().int().positive() }).strict(),
      },
      handle: (input, context) => {
        expectTypeOf(input.params.resourceId).toEqualTypeOf<string>();
        expectTypeOf(input.body.count).toEqualTypeOf<number>();
        expect(input).toEqual({
          body: { count: 2 },
          params: { resourceId: 'pricing' },
        });
        expect(context.response.locals['authorized']).toBe(true);
        handled();
      },
    });
    const req = request({
      params: { resourceId: 'pricing' },
      body: { count: '2' },
    });
    const res = response();
    const authorize: RequestHandler = (_request, authResponse, next) => {
      authResponse.locals['authorized'] = true;
      next();
    };

    await runMiddleware(controller.validators.params, req, res);
    await runMiddleware(authorize, req, res);
    await runMiddleware(controller.validators.body, req, res);
    await controller.handle(req, res, vi.fn());

    expect(handled).toHaveBeenCalledOnce();
  });

  it('fails closed when a configured request location was not validated', async () => {
    const handle = vi.fn();
    const controller = defineValidatedController({
      request: {
        params: z.object({ resourceId: z.string() }).strict(),
        body: z.object({ value: z.string() }).strict(),
      },
      handle,
    });
    const req = request({
      params: { resourceId: 'pricing' },
      body: { value: 'current' },
    });
    const res = response();

    await runMiddleware(controller.validators.params, req, res);

    expect(() => controller.handle(req, res, vi.fn())).toThrow(
      expect.objectContaining({ code: 'request_boundary_not_validated' }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('rejects duplicate validation of one request location', async () => {
    const controller = defineValidatedController({
      request: { params: z.object({ resourceId: z.string() }).strict() },
      handle: vi.fn(),
    });
    const req = request({ params: { resourceId: 'pricing' } });
    const res = response();

    await runMiddleware(controller.validators.params, req, res);
    await expect(
      runMiddleware(controller.validators.params, req, res),
    ).rejects.toMatchObject({ code: 'request_boundary_already_validated' });
  });

  it('rejects invalid input synchronously before handling', async () => {
    const handle = vi.fn();
    const controller = defineValidatedController({
      request: { body: z.object({ count: z.number() }).strict() },
      handle,
    });

    await expect(
      runMiddleware(
        controller.validate,
        request({ body: { count: '2' } }),
        response(),
      ),
    ).rejects.toMatchObject({ code: 'invalid_body_type' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('declaratively preserves a location-specific invalid-request contract', async () => {
    const handle = vi.fn();
    const controller = defineValidatedController({
      request: { params: z.object({ resourceId: z.uuid() }).strict() },
      invalidRequest: {
        params: {
          code: 'resource_path_invalid',
          message: 'The resource path is invalid.',
          safeMessage: 'The requested resource identifier is invalid.',
          status: 422,
        },
      },
      handle,
    });

    await expect(
      runMiddleware(
        controller.validators.params,
        request({ params: { resourceId: 'not-a-uuid' } }),
        response(),
      ),
    ).rejects.toMatchObject({
      code: 'resource_path_invalid',
      safeMessage: 'The requested resource identifier is invalid.',
      status: 422,
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it('fails explicitly when a request schema attempts asynchronous work', async () => {
    const controller = defineValidatedController({
      request: {
        body: z.object({
          value: z.string().refine(async () => true),
        }),
      },
      handle: vi.fn(),
    });

    await expect(
      runMiddleware(
        controller.validate,
        request({ body: { value: 'pricing' } }),
        response(),
      ),
    ).rejects.toMatchObject({ code: 'request_schema_evaluation_failed' });
  });

  it('returns asynchronous handler rejections directly to Express', async () => {
    const failure = new Error('asynchronous controller failure');
    const controller = defineValidatedController({
      request: { body: z.object({ value: z.string() }).strict() },
      handle: async () => Promise.reject(failure),
    });
    const req = request({ body: { value: 'pricing' } });
    const res = response();

    await runMiddleware(controller.validate, req, res);
    await expect(controller.handle(req, res, vi.fn())).rejects.toBe(failure);
  });

  it('returns synchronous handler throws directly to Express', async () => {
    const failure = new Error('synchronous controller failure');
    const controller = defineValidatedController({
      request: { body: z.object({ value: z.string() }).strict() },
      handle: () => {
        throw failure;
      },
    });
    const req = request({ body: { value: 'pricing' } });
    const res = response();

    await runMiddleware(controller.validate, req, res);
    expect(() => controller.handle(req, res, vi.fn())).toThrow(failure);
  });

  it('fails closed when validated input is replaced by later middleware', async () => {
    const handle = vi.fn();
    const controller = defineValidatedController({
      request: { body: z.object({ value: z.string() }).strict() },
      handle,
    });
    const req = request({ body: { value: 'validated' } });
    const res = response();

    await runMiddleware(controller.validate, req, res);
    req.body = { value: 'changed' };

    expect(() => controller.handle(req, res, vi.fn())).toThrow(
      expect.objectContaining({
        code: 'request_boundary_changed_after_validation',
      }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('fails closed when nested validated input is mutated', async () => {
    const handle = vi.fn();
    const controller = defineValidatedController({
      request: {
        body: z
          .object({
            filters: z.object({ active: z.coerce.boolean() }).strict(),
          })
          .strict(),
      },
      handle,
    });
    const req = request({ body: { filters: { active: 1 } } });
    const res = response();

    await runMiddleware(controller.validate, req, res);
    (req.body as { filters: { active: unknown } }).filters.active = false;

    expect(() => controller.handle(req, res, vi.fn())).toThrow(
      expect.objectContaining({
        code: 'request_boundary_changed_after_validation',
      }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('fails closed when middleware introduces a non-canonical value', async () => {
    const handle = vi.fn();
    const controller = defineValidatedController({
      request: { body: z.object({ value: z.string() }).strict() },
      handle,
    });
    const req = request({ body: { value: 'validated' } });
    const res = response();

    await runMiddleware(controller.validate, req, res);
    req.body = new Map([['value', 'changed']]);

    expect(() => controller.handle(req, res, vi.fn())).toThrow(
      expect.objectContaining({
        code: 'request_boundary_value_not_canonicalizable',
      }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('fails closed when its paired validator did not run', () => {
    const handle = vi.fn();
    const controller = defineValidatedController({
      request: { body: z.object({ value: z.string() }).strict() },
      handle,
    });

    expect(() =>
      controller.handle(
        request({ body: { value: 'pricing' } }),
        response(),
        vi.fn(),
      ),
    ).toThrow(
      expect.objectContaining({ code: 'request_boundary_not_validated' }),
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('does not accept validation performed by another controller', async () => {
    const requestSchemas = {
      body: z.object({ value: z.string() }).strict(),
    };
    const first = defineValidatedController({
      request: requestSchemas,
      handle: vi.fn(),
    });
    const secondHandle = vi.fn();
    const second = defineValidatedController({
      request: requestSchemas,
      handle: secondHandle,
    });
    const req = request({ body: { value: 'pricing' } });
    const res = response();

    await runMiddleware(first.validate, req, res);

    expect(() => second.handle(req, res, vi.fn())).toThrow(
      expect.objectContaining({ code: 'request_boundary_not_validated' }),
    );
    expect(secondHandle).not.toHaveBeenCalled();
  });
});
