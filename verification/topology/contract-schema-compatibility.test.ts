import { createHash } from 'node:crypto';

import * as controlAuthentication from '@pressly/experience-control/contracts/authentication-v1';
import * as controlCustomers from '@pressly/experience-control/contracts/customers-v1';
import * as controlInvitations from '@pressly/experience-control/contracts/invitations-v1';
import * as controlOrders from '@pressly/experience-control/contracts/orders-v1';
import * as controlSecurity from '@pressly/experience-control/contracts/security-v1';
import * as controlWorkforce from '@pressly/experience-control/contracts/workforce-v1';
import * as processorAuthentication from '@pressly/experience-processor/contracts/authentication-v1';
import * as processorOperationalOrder from '@pressly/experience-processor/contracts/operational-order';
import * as processorProductionBoard from '@pressly/experience-processor/contracts/production-board';
import * as processorProductionHistory from '@pressly/experience-processor/contracts/production-history';
import * as processorProductionOrderBacklog from '@pressly/experience-processor/contracts/production-order-backlog';
import * as processorProductionOrderControl from '@pressly/experience-processor/contracts/production-order-control';
import * as processorProductionWorkspace from '@pressly/experience-processor/contracts/production-workspace';
import * as processorRemainingDayForecast from '@pressly/experience-processor/contracts/remaining-day-forecast';
import * as ingressCents from '@pressly/ingress-system/contracts/cents-v1';
import * as ingressWebhook from '@pressly/ingress-system/contracts/webhook-ingestion-v1';
import * as changeAdmission from '@pressly/production-system/contracts/demand/change-admission';
import * as changeOrderResolution from '@pressly/production-system/contracts/demand/change-order-resolution';
import * as commitOrderBacklog from '@pressly/production-system/contracts/demand/commit-order-backlog';
import * as previewOrderBacklog from '@pressly/production-system/contracts/demand/preview-order-backlog';
import * as recordOrderIntake from '@pressly/production-system/contracts/demand/record-order-intake';
import * as setOrderPriority from '@pressly/production-system/contracts/demand/set-order-priority';
import * as advanceStage from '@pressly/production-system/contracts/floor/advance-stage';
import * as assignStageMachines from '@pressly/production-system/contracts/floor/assign-stage-machines';
import * as freezeBatchMembership from '@pressly/production-system/contracts/floor/freeze-batch-membership';
import * as reconcileBatchProgress from '@pressly/production-system/contracts/floor/reconcile-batch-progress';
import * as unfreezeBatchMembership from '@pressly/production-system/contracts/floor/unfreeze-batch-membership';
import * as listOrderControlBoundary from '@pressly/production-system/contracts/orders/list-order-control';
import * as listOrders from '@pressly/production-system/contracts/orders/list-orders';
import * as loadBoard from '@pressly/production-system/contracts/queries/load-board';
import * as loadRemainingDayForecast from '@pressly/production-system/contracts/queries/load-remaining-day-forecast';
import * as loadWorkspace from '@pressly/production-system/contracts/queries/load-workspace';
import * as productionBoard from '@pressly/production-system/contracts/read-models/production-board';
import * as productionHistory from '@pressly/production-system/contracts/read-models/production-history';
import * as productionOrder from '@pressly/production-system/contracts/read-models/production-order';
import * as productionOrderBacklog from '@pressly/production-system/contracts/read-models/production-order-backlog';
import * as productionOrderControl from '@pressly/production-system/contracts/read-models/production-order-control';
import * as productionOrderPlacement from '@pressly/production-system/contracts/read-models/production-order-placement';
import * as productionResources from '@pressly/production-system/contracts/read-models/production-resources';
import * as productionSchedule from '@pressly/production-system/contracts/read-models/production-schedule';
import * as listLocations from '@pressly/production-system/contracts/resources/list-locations';
import * as manageResources from '@pressly/production-system/contracts/resources/manage-resources';
import * as acceptSchedule from '@pressly/production-system/contracts/scheduling/accept-schedule';
import * as createSchedule from '@pressly/production-system/contracts/scheduling/create-schedule';
import * as createShift from '@pressly/production-system/contracts/scheduling/create-shift';
import * as loadSchedule from '@pressly/production-system/contracts/scheduling/load-schedule';
import * as publishSchedulerConfig from '@pressly/production-system/contracts/scheduling/publish-scheduler-config';
import * as replaceShiftSelection from '@pressly/production-system/contracts/scheduling/replace-shift-selection';
import * as startSchedule from '@pressly/production-system/contracts/scheduling/start-schedule';
import * as updateShift from '@pressly/production-system/contracts/scheduling/update-shift';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  jsonSchemaDescriptor,
  schemaEntries,
} from './contract-compatibility.helpers.ts';

const targetProductionModules = Object.freeze({
  changeAdmission,
  changeOrderResolution,
  commitOrderBacklog,
  previewOrderBacklog,
  recordOrderIntake,
  setOrderPriority,
  advanceStage,
  assignStageMachines,
  freezeBatchMembership,
  reconcileBatchProgress,
  unfreezeBatchMembership,
  listOrderControlBoundary,
  listOrders,
  loadBoard,
  loadRemainingDayForecast,
  loadWorkspace,
  productionBoard,
  productionHistory,
  productionOrder,
  productionOrderBacklog,
  productionOrderControl,
  productionOrderPlacement,
  productionResources,
  productionSchedule,
  listLocations,
  manageResources,
  acceptSchedule,
  createSchedule,
  createShift,
  loadSchedule,
  publishSchedulerConfig,
  replaceShiftSelection,
  startSchedule,
  updateShift,
});

const targetProcessorModules = Object.freeze({
  processorAuthentication,
  processorOperationalOrder,
  processorProductionBoard,
  processorProductionHistory,
  processorProductionOrderBacklog,
  processorProductionOrderControl,
  processorProductionWorkspace,
  processorRemainingDayForecast,
});

type SchemaPair = readonly [label: string, owner: z.ZodType];

const jsonSchemaCompatiblePairs = Object.freeze([
  [
    'Control authenticated session',
    controlAuthentication.controlAuthenticatedSessionSchema,
  ],
  ['Control login result', controlAuthentication.controlLoginResultSchema],
  ['Control logout result', controlAuthentication.logoutResultSchema],
  [
    'Control session inventory',
    controlAuthentication.sessionInventoryResultSchema,
  ],
  [
    'Control identity-session revocation',
    controlAuthentication.revokeIdentitySessionsResultSchema,
  ],
  ['Control MFA enrollment', controlAuthentication.mfaEnrollmentResultSchema],
  [
    'Control MFA recovery codes',
    controlAuthentication.mfaRecoveryCodesResultSchema,
  ],
  ['Control MFA mutation', controlAuthentication.mfaMutationResultSchema],
  ['Control access grant', controlWorkforce.controlAccessGrantProjectionSchema],
  [
    'Control workforce member detail',
    controlWorkforce.controlWorkforceMemberDetailProjectionSchema,
  ],
  ['Control workforce page', controlWorkforce.controlWorkforceMemberPageSchema],
  [
    'Control invitation page',
    controlWorkforce.controlWorkforceInvitationPageSchema,
  ],
  [
    'Control issue invitation result',
    controlWorkforce.controlIssueInvitationResultSchema,
  ],
  [
    'Control membership mutation result',
    controlWorkforce.controlMembershipMutationResultSchema,
  ],
  [
    'Control revoke-access result',
    controlWorkforce.controlRevokeAccessResultSchema,
  ],
  [
    'Control workforce sessions',
    controlWorkforce.controlWorkforceSessionListSchema,
  ],
  [
    'Control workforce session revocation',
    controlWorkforce.controlWorkforceSessionRevokeResultSchema,
  ],
  [
    'Control invitation preview',
    controlInvitations.controlInvitationPreviewSchema,
  ],
  [
    'Control invitation acceptance',
    controlInvitations.controlInvitationAcceptanceSchema,
  ],
  [
    'Control invitation bootstrap',
    controlInvitations.controlInvitationBootstrapResultSchema,
  ],
  [
    'Control security event list',
    controlSecurity.controlSecurityEventListSchema,
  ],
  ['Control customer', controlCustomers.controlCustomerSchema],
  ['Control customer list', controlCustomers.controlCustomerListSchema],
  ['Control user mutation', controlCustomers.userMutationResultSchema],
  ['Control user profile', controlCustomers.userProfileSchema],
  ['Control order list', controlOrders.controlOrderListSchema],
  ['Control order mutation', controlOrders.orderMutationResultSchema],
  ['Cents ingress decision', ingressCents.centsIngressDecisionSchema],
  [
    'Cents submitted-order candidate',
    ingressCents.centsSubmittedOrderCandidatePayloadSchema,
  ],
  ['Cents terminal close', ingressCents.centsOrderTerminalClosePayloadSchema],
  ['Cents webhook envelope', ingressCents.centsWebhookWireEnvelopeSchema],
] satisfies readonly SchemaPair[]);

const descriptorDigest = (
  entries: readonly (readonly [string, z.ZodType])[],
): string =>
  createHash('sha256')
    .update(
      JSON.stringify(
        [...entries]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, schema]) => [name, jsonSchemaDescriptor(schema)]),
      ),
    )
    .digest('hex');

const moduleDescriptorDigest = (
  modules: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): string =>
  descriptorDigest(
    Object.entries(modules).flatMap(([moduleName, module]) =>
      schemaEntries(module).map(
        ([schemaName, schema]) =>
          [`${moduleName}.${schemaName}`, schema] as const,
      ),
    ),
  );

describe('serialized contract descriptor compatibility', () => {
  it('pins owner descriptor digests independently of the temporary oracle', () => {
    expect({
      transferred: descriptorDigest(
        jsonSchemaCompatiblePairs.map(([label, owner]) => [label, owner]),
      ),
      production: moduleDescriptorDigest(targetProductionModules),
      processor: moduleDescriptorDigest(targetProcessorModules),
      ingress: moduleDescriptorDigest({ ingressWebhook }),
    }).toEqual({
      transferred:
        '6748d325939b5640525b9525e276b0579c11dfc2a98d7df24e20bb69d86fc50d',
      production:
        '92801bab4b15c1b796e53a28d742b43a45725872e4d3ab41d247d0ffbc3cfa2e',
      processor:
        '27f12ff8152fde34b3fcaa0635e657c1cbf9d981290d55af87f5e21c11fbd1a4',
      ingress:
        '923991f9b1832f71420b762d4b3f08c2cfa82acf31e61fb1c5ea144b10d18ada',
    });
  });

  it('pins all 31 explicitly transferred owner schemas', () => {
    expect(jsonSchemaCompatiblePairs).toHaveLength(31);
  });

  it('pins every released Production schema descriptor', () => {
    expect(
      Object.values(targetProductionModules).reduce(
        (count, module) => count + schemaEntries(module).length,
        0,
      ),
    ).toBe(241);
  });

  it('pins every released Processor schema descriptor', () => {
    expect(
      Object.values(targetProcessorModules).reduce(
        (count, module) => count + schemaEntries(module).length,
        0,
      ),
    ).toBe(31);
  });

  it('pins every released Ingress HTTP schema descriptor', () => {
    expect(schemaEntries(ingressWebhook)).toHaveLength(15);
  });
});
