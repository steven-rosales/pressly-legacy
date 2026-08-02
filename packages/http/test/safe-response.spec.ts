import type { Response } from 'express';
import { databaseError } from '@pressly/errors';
import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { sendApiResult } from '../src/express/safe-response.js';

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
