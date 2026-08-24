import type { Response } from 'express';
import { databaseError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  sendApiResult,
  sendValidatedApiResult,
} from '../src/express/safe-response.js';

const makeResponse = (): Response => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as Response;
};

describe('sendApiResult', () => {
  it('sends successful results with the requested status', () => {
    const response = makeResponse();

    sendApiResult(response, result.ok({ productionOrderId: 'order-1' }), 201);

    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      ok: true,
      data: { productionOrderId: 'order-1' },
    });
  });

  it('throws application failures for the central error middleware', () => {
    const response = makeResponse();
    const error = databaseError({
      code: 'production_unavailable',
      message: 'Production database is unavailable.',
      safeMessage: 'Production is temporarily unavailable.',
      status: 503,
    });

    expect(() => sendApiResult(response, result.err(error))).toThrow(error);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});

describe('sendValidatedApiResult', () => {
  it('presents and validates successful values before sending them', () => {
    const response = makeResponse();
    const schema = z
      .object({ updatedAt: z.iso.datetime({ offset: true }) })
      .strict();

    sendValidatedApiResult(
      response,
      result.ok({ updatedAt: new Date('2026-08-02T12:00:00.000Z') }),
      {
        schema,
        present: (value) => ({ updatedAt: value.updatedAt.toISOString() }),
      },
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      ok: true,
      data: { updatedAt: '2026-08-02T12:00:00.000Z' },
    });
  });

  it('does not present application failures', () => {
    const response = makeResponse();
    const error = databaseError({
      code: 'pricing_unavailable',
      message: 'Pricing database is unavailable.',
      safeMessage: 'Pricing is temporarily unavailable.',
      status: 503,
    });
    const present = vi.fn((value: { id: string }) => value);

    expect(() =>
      sendValidatedApiResult(response, result.err(error), {
        schema: z.object({ id: z.string() }),
        present,
      }),
    ).toThrow(error);
    expect(present).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  it('does not send values that violate the response contract', () => {
    const response = makeResponse();

    expect(() =>
      sendValidatedApiResult(response, result.ok({ count: -1 }), {
        schema: z.object({ count: z.number().int().nonnegative() }),
        present: (value) => value,
      }),
    ).toThrow(
      expect.objectContaining({
        tag: 'AppError',
        kind: 'InvariantViolationError',
        code: 'invalid_api_success_response',
      }),
    );
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  it('normalizes unexpected presenter failures into the shared error language', () => {
    const response = makeResponse();

    expect(() =>
      sendValidatedApiResult(response, result.ok({ id: 'pricing' }), {
        schema: z.object({ id: z.string() }),
        present: () => {
          throw new TypeError('Presenter failed.');
        },
      }),
    ).toThrow(
      expect.objectContaining({
        tag: 'AppError',
        kind: 'InvariantViolationError',
        code: 'invalid_api_success_response',
      }),
    );
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
