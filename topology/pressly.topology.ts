import {
  captureWebhookReceiptCellDeclaration,
  claimEventsCellDeclaration,
  completeEventCellDeclaration,
  deadLetterEventCellDeclaration,
  ingestEventCellDeclaration,
  linkWebhookReceiptCellDeclaration,
  listDeadEventsCellDeclaration,
  measureWebhookBacklogCellDeclaration,
  processInboundEventCellDeclaration,
  purgeExpiredWebhookReceiptsCellDeclaration,
  receiveCentsWebhookCellDeclaration,
  reconcileSourceLocationBindingsCellDeclaration,
  replayDeadEventCellDeclaration,
  resolveSourceLocationCellDeclaration,
  retryEventCellDeclaration,
} from '@pressly/ingress-system';
import {
  acceptIncomingOrderProposalCellDeclaration,
  cancelOrderCellDeclaration,
  claimOrderOutboxCellDeclaration,
  closeIncomingOrderSourceCellDeclaration,
  completeOrderCellDeclaration,
  completeOrderOutboxCellDeclaration,
  correctOrderCellDeclaration,
  createOrderCellDeclaration,
  deadLetterOrderOutboxCellDeclaration,
  getCanonicalOrderCellDeclaration,
  listCanonicalOrdersCellDeclaration,
  listIncomingOrderProposalsCellDeclaration,
  measureOrderOutboxBacklogCellDeclaration,
  proposeIncomingOrderCellDeclaration,
  rejectIncomingOrderProposalCellDeclaration,
  releaseFulfillmentCellDeclaration,
  restoreIncomingOrderProposalCellDeclaration,
  retryOrderOutboxCellDeclaration,
  withdrawFulfillmentCellDeclaration,
} from '@pressly/orders-system';
import {
  acceptScheduleCellDeclaration,
  advanceStageCellDeclaration,
  applyFulfillmentDemandCellDeclaration,
  assignStageMachinesCellDeclaration,
  attemptAutomaticPlacementCellDeclaration,
  changeAdmissionCellDeclaration,
  changeOrderResolutionCellDeclaration,
  commitOrderBacklogCellDeclaration,
  commitOrderRouteCellDeclaration,
  confirmOrderOvertimeCellDeclaration,
  createScheduleCellDeclaration,
  createShiftCellDeclaration,
  freezeBatchMembershipCellDeclaration,
  listHistoryActivityCellDeclaration,
  listHistoryPlansCellDeclaration,
  listHistoryRunsCellDeclaration,
  listLocationsCellDeclaration,
  listOrderControlCellDeclaration,
  listOrdersCellDeclaration,
  loadBoardCellDeclaration,
  loadHistoryRunCellDeclaration,
  loadRemainingDayForecastCellDeclaration,
  loadScheduleCellDeclaration,
  loadWorkspaceCellDeclaration,
  manageResourcesCellDeclaration,
  previewOrderBacklogCellDeclaration,
  previewOrderRouteCellDeclaration,
  placeOrderAutomaticallyCellDeclaration,
  placeOrderExactlyCellDeclaration,
  publishSchedulerConfigCellDeclaration,
  reconcileBatchProgressCellDeclaration,
  recordOrderIntakeCellDeclaration,
  replaceShiftSelectionCellDeclaration,
  resolveSourceClosedFulfillmentCellDeclaration,
  setOrderPriorityCellDeclaration,
  startScheduleCellDeclaration,
  subscribeProductionChangesCellDeclaration,
  unfreezeBatchMembershipCellDeclaration,
  updateShiftCellDeclaration,
} from '@pressly/production-system';
import { presslyAdminCliProgram } from '@pressly/experience-control';
import { defineSystem, defineTopology, selectCell } from './src/public.ts';
import {
  presslyHttpBoundaryBindings,
  presslyHttpBoundaryProfiles,
} from './pressly-http-boundaries.ts';
import {
  accessSystem,
  controlExperience,
  customerExperience,
  customersSystem,
  pricingSystem,
  processorExperience,
} from './pressly-target-owners.ts';

const ingressSystem = defineSystem({
  id: 'ingress',
  cells: [
    selectCell({
      manifest: captureWebhookReceiptCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'captureWebhookReceiptCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'captureWebhookReceipt',
      },
    }),
    selectCell({
      manifest: claimEventsCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'claimEventsCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'claimEvents',
      },
    }),
    selectCell({
      manifest: completeEventCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'completeEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'completeEvent',
      },
    }),
    selectCell({
      manifest: deadLetterEventCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'deadLetterEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'deadLetterEvent',
      },
    }),
    selectCell({
      manifest: ingestEventCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'ingestEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'ingestEvent',
      },
    }),
    selectCell({
      manifest: linkWebhookReceiptCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'linkWebhookReceiptCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'linkWebhookReceipt',
      },
    }),
    selectCell({
      manifest: receiveCentsWebhookCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'receiveCentsWebhookCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'receiveCentsWebhook',
      },
    }),
    selectCell({
      manifest: listDeadEventsCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'listDeadEventsCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'listDeadEvents',
      },
    }),
    selectCell({
      manifest: measureWebhookBacklogCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'measureWebhookBacklogCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'measureWebhookBacklog',
      },
    }),
    selectCell({
      manifest: processInboundEventCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'processInboundEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'processInboundEvent',
      },
    }),
    selectCell({
      manifest: purgeExpiredWebhookReceiptsCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'purgeExpiredWebhookReceiptsCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'purgeExpiredWebhookReceipts',
      },
    }),
    selectCell({
      manifest: reconcileSourceLocationBindingsCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'reconcileSourceLocationBindingsCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'reconcileSourceLocationBindings',
      },
    }),
    selectCell({
      manifest: replayDeadEventCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'replayDeadEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'replayDeadEvent',
      },
    }),
    selectCell({
      manifest: resolveSourceLocationCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'resolveSourceLocationCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'resolveSourceLocation',
      },
    }),
    selectCell({
      manifest: retryEventCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'retryEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'retryEvent',
      },
    }),
  ],
});

const ordersSystem = defineSystem({
  id: 'orders',
  cells: [
    selectCell({
      manifest: claimOrderOutboxCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'claimOrderOutboxCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'claimOrderOutbox',
      },
    }),
    selectCell({
      manifest: closeIncomingOrderSourceCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'closeIncomingOrderSourceCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'closeIncomingOrderSource',
      },
    }),
    selectCell({
      manifest: completeOrderOutboxCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'completeOrderOutboxCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'completeOrderOutbox',
      },
    }),
    selectCell({
      manifest: deadLetterOrderOutboxCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'deadLetterOrderOutboxCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'deadLetterOrderOutbox',
      },
    }),
    selectCell({
      manifest: measureOrderOutboxBacklogCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'measureOrderOutboxBacklogCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'measureOrderOutboxBacklog',
      },
    }),
    selectCell({
      manifest: proposeIncomingOrderCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'proposeIncomingOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'proposeIncomingOrder',
      },
    }),
    selectCell({
      manifest: retryOrderOutboxCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'retryOrderOutboxCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'retryOrderOutbox',
      },
    }),
    selectCell({
      manifest: acceptIncomingOrderProposalCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'acceptIncomingOrderProposalCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'acceptIncomingOrderProposal',
      },
    }),
    selectCell({
      manifest: cancelOrderCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'cancelOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'cancelOrder',
      },
    }),
    selectCell({
      manifest: completeOrderCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'completeOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'completeOrder',
      },
    }),
    selectCell({
      manifest: correctOrderCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'correctOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'correctOrder',
      },
    }),
    selectCell({
      manifest: createOrderCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'createOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'createOrder',
      },
    }),
    selectCell({
      manifest: getCanonicalOrderCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'getCanonicalOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'getCanonicalOrder',
      },
    }),
    selectCell({
      manifest: listCanonicalOrdersCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'listCanonicalOrdersCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'listCanonicalOrders',
      },
    }),
    selectCell({
      manifest: listIncomingOrderProposalsCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'listIncomingOrderProposalsCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'listIncomingOrderProposals',
      },
    }),
    selectCell({
      manifest: rejectIncomingOrderProposalCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'rejectIncomingOrderProposalCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'rejectIncomingOrderProposal',
      },
    }),
    selectCell({
      manifest: releaseFulfillmentCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'releaseFulfillmentCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'releaseFulfillment',
      },
    }),
    selectCell({
      manifest: restoreIncomingOrderProposalCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'restoreIncomingOrderProposalCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'restoreIncomingOrderProposal',
      },
    }),
    selectCell({
      manifest: withdrawFulfillmentCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'withdrawFulfillmentCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'withdrawFulfillment',
      },
    }),
  ],
});

const productionSystem = defineSystem({
  id: 'production',
  cells: [
    selectCell({
      manifest: acceptScheduleCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'acceptScheduleCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'acceptSchedule',
      },
    }),
    selectCell({
      manifest: advanceStageCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'advanceStageCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'advanceStage',
      },
    }),
    selectCell({
      manifest: applyFulfillmentDemandCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'applyFulfillmentDemandCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'applyFulfillmentDemand',
      },
    }),
    selectCell({
      manifest: assignStageMachinesCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'assignStageMachinesCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'assignStageMachines',
      },
    }),
    selectCell({
      manifest: attemptAutomaticPlacementCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'attemptAutomaticPlacementCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'attemptAutomaticPlacement',
      },
    }),
    selectCell({
      manifest: changeAdmissionCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'changeAdmissionCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'changeAdmission',
      },
    }),
    selectCell({
      manifest: changeOrderResolutionCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'changeOrderResolutionCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'changeOrderResolution',
      },
    }),
    selectCell({
      manifest: commitOrderBacklogCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'commitOrderBacklogCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'commitOrderBacklog',
      },
    }),
    selectCell({
      manifest: commitOrderRouteCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'commitOrderRouteCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'commitOrderRoute',
      },
    }),
    selectCell({
      manifest: confirmOrderOvertimeCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'confirmOrderOvertimeCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'confirmOrderOvertime',
      },
    }),
    selectCell({
      manifest: createScheduleCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'createScheduleCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'createSchedule',
      },
    }),
    selectCell({
      manifest: createShiftCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'createShiftCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'createShift',
      },
    }),
    selectCell({
      manifest: startScheduleCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'startScheduleCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'startSchedule',
      },
    }),
    selectCell({
      manifest: freezeBatchMembershipCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'freezeBatchMembershipCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'freezeBatchMembership',
      },
    }),
    selectCell({
      manifest: listHistoryActivityCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listHistoryActivityCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listHistoryActivity',
      },
    }),
    selectCell({
      manifest: listHistoryPlansCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listHistoryPlansCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listHistoryPlans',
      },
    }),
    selectCell({
      manifest: listHistoryRunsCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listHistoryRunsCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listHistoryRuns',
      },
    }),
    selectCell({
      manifest: listLocationsCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listLocationsCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listLocations',
      },
    }),
    selectCell({
      manifest: listOrderControlCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listOrderControlCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listOrderControl',
      },
    }),
    selectCell({
      manifest: listOrdersCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listOrdersCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listOrders',
      },
    }),
    selectCell({
      manifest: loadBoardCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'loadBoardCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'loadBoard',
      },
    }),
    selectCell({
      manifest: loadHistoryRunCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'loadHistoryRunCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'loadHistoryRun',
      },
    }),
    selectCell({
      manifest: loadRemainingDayForecastCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'loadRemainingDayForecastCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'loadRemainingDayForecast',
      },
    }),
    selectCell({
      manifest: loadScheduleCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'loadScheduleCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'loadSchedule',
      },
    }),
    selectCell({
      manifest: loadWorkspaceCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'loadWorkspaceCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'loadWorkspace',
      },
    }),
    selectCell({
      manifest: manageResourcesCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'manageResourcesCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'manageResources',
      },
    }),
    selectCell({
      manifest: previewOrderBacklogCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'previewOrderBacklogCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'previewOrderBacklog',
      },
    }),
    selectCell({
      manifest: placeOrderAutomaticallyCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'placeOrderAutomaticallyCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'placeOrderAutomatically',
      },
    }),
    selectCell({
      manifest: placeOrderExactlyCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'placeOrderExactlyCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'placeOrderExactly',
      },
    }),
    selectCell({
      manifest: previewOrderRouteCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'previewOrderRouteCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'previewOrderRoute',
      },
    }),
    selectCell({
      manifest: publishSchedulerConfigCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'publishSchedulerConfigCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'publishSchedulerConfig',
      },
    }),
    selectCell({
      manifest: reconcileBatchProgressCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'reconcileBatchProgressCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'reconcileBatchProgress',
      },
    }),
    selectCell({
      manifest: recordOrderIntakeCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'recordOrderIntakeCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'recordOrderIntake',
      },
    }),
    selectCell({
      manifest: replaceShiftSelectionCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'replaceShiftSelectionCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'replaceShiftSelection',
      },
    }),
    selectCell({
      manifest: resolveSourceClosedFulfillmentCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'resolveSourceClosedFulfillmentCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'resolveSourceClosedFulfillment',
      },
    }),
    selectCell({
      manifest: setOrderPriorityCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'setOrderPriorityCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'setOrderPriority',
      },
    }),
    selectCell({
      manifest: subscribeProductionChangesCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'subscribeProductionChangesCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'subscribeChanges',
      },
    }),
    selectCell({
      manifest: unfreezeBatchMembershipCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'unfreezeBatchMembershipCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'unfreezeBatchMembership',
      },
    }),
    selectCell({
      manifest: updateShiftCellDeclaration,
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'updateShiftCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'updateShift',
      },
    }),
  ],
});

/** Checked deployment selection consumed by the generated host catalogs. */
export const presslyTopology = defineTopology({
  id: 'pressly',
  systems: [
    accessSystem,
    customersSystem,
    ingressSystem,
    ordersSystem,
    pricingSystem,
    productionSystem,
  ],
  experiences: [controlExperience, customerExperience, processorExperience],
  cliProgram: presslyAdminCliProgram,
  httpBoundaryProfiles: presslyHttpBoundaryProfiles,
  httpBoundaryBindings: presslyHttpBoundaryBindings,
});
