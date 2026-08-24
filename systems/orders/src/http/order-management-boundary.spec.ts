import { describe, expect, it } from 'vitest';
import { acceptIncomingOrderProposalCellDeclaration } from '../cells/intake/accept-incoming-order-proposal/cell.ts';
import { listIncomingOrderProposalsCellDeclaration } from '../cells/intake/list-incoming-order-proposals/cell.ts';
import { rejectIncomingOrderProposalCellDeclaration } from '../cells/intake/reject-incoming-order-proposal/cell.ts';
import { restoreIncomingOrderProposalCellDeclaration } from '../cells/intake/restore-incoming-order-proposal/cell.ts';
import { releaseFulfillmentCellDeclaration } from '../cells/fulfillment/release-fulfillment/cell.ts';
import { withdrawFulfillmentCellDeclaration } from '../cells/fulfillment/withdraw-fulfillment/cell.ts';
import { cancelOrderCellDeclaration } from '../cells/lifecycle/cancel-order/cell.ts';
import { completeOrderCellDeclaration } from '../cells/lifecycle/complete-order/cell.ts';
import { correctOrderCellDeclaration } from '../cells/lifecycle/correct-order/cell.ts';
import { createOrderCellDeclaration } from '../cells/lifecycle/create-order/cell.ts';
import { orderManagementHttpBoundaryRequirements } from './order-management-boundary.ts';

const cells = [
  listIncomingOrderProposalsCellDeclaration,
  acceptIncomingOrderProposalCellDeclaration,
  rejectIncomingOrderProposalCellDeclaration,
  restoreIncomingOrderProposalCellDeclaration,
  createOrderCellDeclaration,
  correctOrderCellDeclaration,
  completeOrderCellDeclaration,
  cancelOrderCellDeclaration,
  releaseFulfillmentCellDeclaration,
  withdrawFulfillmentCellDeclaration,
] as const;

describe('Orders general HTTP boundary requirements', () => {
  it('covers exactly ten single-realm staged surfaces', () => {
    expect(orderManagementHttpBoundaryRequirements).toHaveLength(10);
    expect(
      orderManagementHttpBoundaryRequirements.map((entry) => entry.operationId),
    ).toEqual(cells.map((cell) => cell.id));
    expect(cells.every((cell) => cell.authentication === 'required')).toBe(
      true,
    );
    expect(
      cells.every(
        (cell) =>
          cell.authorization?.capability === 'orders:manage' &&
          cell.surfaces.length === 1 &&
          cell.surfaces[0]?.kind === 'http' &&
          cell.surfaces[0].authorization === 'staged',
      ),
    ).toBe(true);
  });

  it('declares no operation-local request limiter', () => {
    for (const requirement of orderManagementHttpBoundaryRequirements) {
      expect(requirement.profile.requestRateLimit).toBeNull();
    }
  });

  it('declares parse-before-Processor authentication and the exact validation phases', () => {
    const [list, ...commands] = orderManagementHttpBoundaryRequirements;
    expect(list?.profile).toMatchObject({
      authentication: {
        provider: 'processor-cookie-or-bearer-session',
        required: true,
      },
      requestBody: {
        contentType: 'parse-if-matching',
        phase: 'before-authentication',
      },
      inputValidationPhase: 'after-authentication',
      contextProviders: [],
      expectedFailureObservation: 'central-api-error-observation',
    });
    expect(
      commands.every(
        (entry) =>
          entry.profile.authentication?.provider ===
            'processor-cookie-or-bearer-session' &&
          entry.profile.requestBody?.phase === 'before-authentication' &&
          entry.profile.requestBody.contentType === 'parse-if-matching' &&
          entry.profile.expectedFailureObservation ===
            'central-api-error-observation' &&
          entry.profile.inputValidationPhase === 'after-authorization',
      ),
    ).toBe(true);
    expect(commands.map((entry) => entry.profile.contextProviders)).toEqual([
      ['order-management-principal'],
      ['order-management-principal'],
      ['order-management-principal'],
      ['order-management-business-id', 'order-management-principal'],
      ['order-management-business-id', 'order-management-principal'],
      ['order-management-business-id', 'order-management-principal'],
      ['order-management-business-id', 'order-management-principal'],
      ['order-management-business-id', 'order-management-principal'],
      ['order-management-business-id', 'order-management-principal'],
    ]);
  });

  it('selects the conditional JSON parser and central error observation', () => {
    expect(
      orderManagementHttpBoundaryRequirements.every(
        (entry) =>
          entry.profile.requestBody?.contentType === 'parse-if-matching' &&
          entry.profile.requestBody.parser === 'json-document' &&
          entry.profile.requestBody.phase === 'before-authentication' &&
          entry.profile.expectedFailureObservation ===
            'central-api-error-observation',
      ),
    ).toBe(true);
  });
});
