import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { err, makeAppError, ok } from '@pressly/errors';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makePublishPricingChangeController } from '../../src/adapters/publish-pricing/http/publish-pricing-change.controller.ts';
import type { PublishPricingChange } from '../../src/features/publish-pricing/publish-pricing-change.usecase.ts';
import { makePublishPricingChangeCommand } from '../support/builders.ts';

describe('publish pricing change http controller', () => {
  it('returns a success envelope for publish results', async () => {
    const command = makePublishPricingChangeCommand();
    const publishPricingChange = vi
      .fn<PublishPricingChange>()
      .mockResolvedValue(
        ok({
          oldPricingSetId: 'set_1',
          newPricingSetId: 'set_2',
          auditEventId: 'event_1',
          changeItemCount: 1,
        }),
      );
    const controller = makePublishPricingChangeController(publishPricingChange);
    const req = { body: command } as unknown as Request;
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    controller(req, res as unknown as Response, next);
    await waitForController();

    expect(publishPricingChange).toHaveBeenCalledWith(command);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      data: {
        oldPricingSetId: 'set_1',
        newPricingSetId: 'set_2',
        auditEventId: 'event_1',
        changeItemCount: 1,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns a failure envelope from publish errors', async () => {
    const error = makeAppError({
      kind: 'PermissionError',
      code: 'missing_permission',
      message: 'Internal permission details.',
      safeMessage: 'You do not have permission to perform this action.',
      status: 403,
    });
    const publishPricingChange = vi
      .fn<PublishPricingChange>()
      .mockResolvedValue(err(error));
    const controller = makePublishPricingChangeController(publishPricingChange);
    const req = {
      body: makePublishPricingChangeCommand(),
    } as unknown as Request;
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    controller(req, res as unknown as Response, next);
    await waitForController();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'missing_permission',
        message: 'You do not have permission to perform this action.',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
