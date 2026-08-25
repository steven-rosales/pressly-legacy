/* This file is generated from the checked deployment topology. */
export const ordersAcceptIncomingOrderProposalV1 = {
  operationId: 'orders.accept-incoming-order-proposal.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    accept: {
      method: 'POST',
      path: '/order-management/locations/:locationId/incoming-orders/:proposalId/accept',
    },
  },
} as const;

export const ordersListIncomingOrderProposalsV1 = {
  operationId: 'orders.list-incoming-order-proposals.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'incoming-orders': {
      method: 'GET',
      path: '/order-management/locations/:locationId/incoming-orders',
    },
  },
} as const;

export const ordersRejectIncomingOrderProposalV1 = {
  operationId: 'orders.reject-incoming-order-proposal.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    reject: {
      method: 'POST',
      path: '/order-management/locations/:locationId/incoming-orders/:proposalId/reject',
    },
  },
} as const;

export const ordersRestoreIncomingOrderProposalV1 = {
  operationId: 'orders.restore-incoming-order-proposal.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    restore: {
      method: 'POST',
      path: '/order-management/locations/:locationId/incoming-orders/:proposalId/restore',
    },
  },
} as const;

export const processorAuthLoginV1 = {
  operationId: 'processor.auth-login.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    login: { method: 'POST', path: '/processor/auth/login' },
  },
} as const;

export const processorCompleteMfaChallengeV1 = {
  operationId: 'processor.complete-mfa-challenge.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    challenge: { method: 'POST', path: '/processor/auth/mfa/challenge' },
  },
} as const;

export const processorListProductionHistoryActivityV1 = {
  operationId: 'processor.list-production-history-activity.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    activity: {
      method: 'GET',
      path: '/production/locations/:locationId/history/activity',
    },
  },
} as const;

export const processorListProductionOrderControlV1 = {
  operationId: 'processor.list-production-order-control.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'order-control': {
      method: 'GET',
      path: '/production/locations/:locationId/order-control',
    },
  },
} as const;

export const processorLoadAuthSessionV1 = {
  operationId: 'processor.load-auth-session.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    session: { method: 'GET', path: '/processor/auth/session' },
  },
} as const;

export const processorLoadProductionBoardV1 = {
  operationId: 'processor.load-production-board.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    board: {
      method: 'GET',
      path: '/production/locations/:locationId/runs/:productionRunId/board',
    },
  },
} as const;

export const processorLoadProductionHistoryRunV1 = {
  operationId: 'processor.load-production-history-run.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    request: {
      method: 'GET',
      path: '/production/locations/:locationId/history/runs/:productionRunId',
    },
  },
} as const;

export const processorLoadProductionWorkspaceV1 = {
  operationId: 'processor.load-production-workspace.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    workspace: {
      method: 'GET',
      path: '/production/locations/:locationId/workspace',
    },
  },
} as const;

export const processorLoadRemainingDayForecastV1 = {
  operationId: 'processor.load-remaining-day-forecast.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    forecast: {
      method: 'GET',
      path: '/production/locations/:locationId/forecast',
    },
  },
} as const;

export const processorLogoutV1 = {
  operationId: 'processor.logout.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    logout: { method: 'POST', path: '/processor/auth/logout' },
  },
} as const;

export const processorPreviewProductionOrderBacklogV1 = {
  operationId: 'processor.preview-production-order-backlog.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    preview: {
      method: 'POST',
      path: '/production/locations/:locationId/order-backlog/preview',
    },
  },
} as const;

export const productionAcceptScheduleV1 = {
  operationId: 'production.accept-schedule.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    accept: {
      method: 'POST',
      path: '/production/locations/:locationId/schedules/:scheduleRunId/accept',
    },
  },
} as const;

export const productionAdvanceStageV1 = {
  operationId: 'production.advance-stage.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    complete: {
      method: 'POST',
      path: '/production/locations/:locationId/stages/:stageRunId/complete',
    },
    start: {
      method: 'POST',
      path: '/production/locations/:locationId/stages/:stageRunId/start',
    },
  },
} as const;

export const productionAssignStageMachinesV1 = {
  operationId: 'production.assign-stage-machines.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    machines: {
      method: 'PUT',
      path: '/production/locations/:locationId/stages/:stageRunId/machines',
    },
  },
} as const;

export const productionChangeAdmissionV1 = {
  operationId: 'production.change-admission.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    admission: {
      method: 'PUT',
      path: '/production/locations/:locationId/orders/:productionOrderId/admission',
    },
  },
} as const;

export const productionChangeOrderResolutionV1 = {
  operationId: 'production.change-order-resolution.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    resolution: {
      method: 'PUT',
      path: '/production/locations/:locationId/orders/:productionOrderId/resolution',
    },
  },
} as const;

export const productionCommitOrderBacklogV1 = {
  operationId: 'production.commit-order-backlog.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'order-backlog': {
      method: 'POST',
      path: '/production/locations/:locationId/order-backlog',
    },
  },
} as const;

export const productionCommitOrderRouteV1 = {
  operationId: 'production.commit-order-route.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    route: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route',
    },
  },
} as const;

export const productionConfirmOrderOvertimeV1 = {
  operationId: 'production.confirm-order-overtime.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'confirm-overtime': {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime',
    },
  },
} as const;

export const productionCreateScheduleV1 = {
  operationId: 'production.create-schedule.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    schedules: {
      method: 'POST',
      path: '/production/locations/:locationId/schedules',
    },
  },
} as const;

export const productionCreateShiftV1 = {
  operationId: 'production.create-shift.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    shifts: {
      method: 'POST',
      path: '/production/locations/:locationId/shifts',
    },
  },
} as const;

export const productionFreezeBatchMembershipV1 = {
  operationId: 'production.freeze-batch-membership.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    freeze: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/freeze',
    },
  },
} as const;

export const productionListHistoryPlansV1 = {
  operationId: 'production.list-history-plans.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    plans: {
      method: 'GET',
      path: '/production/locations/:locationId/history/plans',
    },
  },
} as const;

export const productionListHistoryRunsV1 = {
  operationId: 'production.list-history-runs.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    runs: {
      method: 'GET',
      path: '/production/locations/:locationId/history/runs',
    },
  },
} as const;

export const productionListLocationsV1 = {
  operationId: 'production.list-locations.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    locations: { method: 'GET', path: '/production/locations' },
  },
} as const;

export const productionListOrdersV1 = {
  operationId: 'production.list-orders.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    orders: { method: 'GET', path: '/production/locations/:locationId/orders' },
  },
} as const;

export const productionLoadScheduleV1 = {
  operationId: 'production.load-schedule.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    request: {
      method: 'GET',
      path: '/production/locations/:locationId/schedules/:scheduleRunId',
    },
  },
} as const;

export const productionPlaceOrderAutomaticallyV1 = {
  operationId: 'production.place-order-automatically.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    place: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/place',
    },
  },
} as const;

export const productionPlaceOrderExactlyV1 = {
  operationId: 'production.place-order-exactly.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    place: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/orders/:productionOrderId/place',
    },
  },
} as const;

export const productionPreviewOrderRouteV1 = {
  operationId: 'production.preview-order-route.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    preview: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route/preview',
    },
  },
} as const;

export const productionPublishSchedulerConfigV1 = {
  operationId: 'production.publish-scheduler-config.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'scheduler-configs': {
      method: 'POST',
      path: '/production/locations/:locationId/scheduler-configs',
    },
  },
} as const;

export const productionReconcileBatchProgressV1 = {
  operationId: 'production.reconcile-batch-progress.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'progress-reconciliation': {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/progress-reconciliation',
    },
  },
} as const;

export const productionRecordOrderIntakeV1 = {
  operationId: 'production.record-order-intake.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    intake: {
      method: 'PUT',
      path: '/production/locations/:locationId/orders/:productionOrderId/intake',
    },
  },
} as const;

export const productionReplaceShiftSelectionV1 = {
  operationId: 'production.replace-shift-selection.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    selection: {
      method: 'PUT',
      path: '/production/locations/:locationId/shifts/:productionShiftId/selection',
    },
  },
} as const;

export const productionSetOrderPriorityV1 = {
  operationId: 'production.set-order-priority.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    priority: {
      method: 'PATCH',
      path: '/production/locations/:locationId/orders/:productionOrderId/priority',
    },
  },
} as const;

export const productionStartScheduleV1 = {
  operationId: 'production.start-schedule.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    start: {
      method: 'POST',
      path: '/production/locations/:locationId/schedules/:scheduleRunId/start',
    },
  },
} as const;

export const productionSubscribeChangesV1 = {
  operationId: 'production.subscribe-changes.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
    eventVersion: 1,
  },
  eventStream: {
    method: 'GET',
    path: '/production/locations/:locationId/events',
    retryMs: 3000,
    eventTypes: ['ready', 'change', 'resync'],
  },
  http: {},
} as const;

export const productionUnfreezeBatchMembershipV1 = {
  operationId: 'production.unfreeze-batch-membership.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    unfreeze: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/unfreeze',
    },
  },
} as const;

export const productionUpdateShiftV1 = {
  operationId: 'production.update-shift.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    request: {
      method: 'PATCH',
      path: '/production/locations/:locationId/shifts/:productionShiftId',
    },
  },
} as const;

export const processorClient = {
  experienceId: 'processor',
  operations: {
    'orders.accept-incoming-order-proposal.v1':
      ordersAcceptIncomingOrderProposalV1,
    'orders.list-incoming-order-proposals.v1':
      ordersListIncomingOrderProposalsV1,
    'orders.reject-incoming-order-proposal.v1':
      ordersRejectIncomingOrderProposalV1,
    'orders.restore-incoming-order-proposal.v1':
      ordersRestoreIncomingOrderProposalV1,
    'processor.auth-login.v1': processorAuthLoginV1,
    'processor.complete-mfa-challenge.v1': processorCompleteMfaChallengeV1,
    'processor.list-production-history-activity.v1':
      processorListProductionHistoryActivityV1,
    'processor.list-production-order-control.v1':
      processorListProductionOrderControlV1,
    'processor.load-auth-session.v1': processorLoadAuthSessionV1,
    'processor.load-production-board.v1': processorLoadProductionBoardV1,
    'processor.load-production-history-run.v1':
      processorLoadProductionHistoryRunV1,
    'processor.load-production-workspace.v1':
      processorLoadProductionWorkspaceV1,
    'processor.load-remaining-day-forecast.v1':
      processorLoadRemainingDayForecastV1,
    'processor.logout.v1': processorLogoutV1,
    'processor.preview-production-order-backlog.v1':
      processorPreviewProductionOrderBacklogV1,
    'production.accept-schedule.v1': productionAcceptScheduleV1,
    'production.advance-stage.v1': productionAdvanceStageV1,
    'production.assign-stage-machines.v1': productionAssignStageMachinesV1,
    'production.change-admission.v1': productionChangeAdmissionV1,
    'production.change-order-resolution.v1': productionChangeOrderResolutionV1,
    'production.commit-order-backlog.v1': productionCommitOrderBacklogV1,
    'production.commit-order-route.v1': productionCommitOrderRouteV1,
    'production.confirm-order-overtime.v1': productionConfirmOrderOvertimeV1,
    'production.create-schedule.v1': productionCreateScheduleV1,
    'production.create-shift.v1': productionCreateShiftV1,
    'production.freeze-batch-membership.v1': productionFreezeBatchMembershipV1,
    'production.list-history-plans.v1': productionListHistoryPlansV1,
    'production.list-history-runs.v1': productionListHistoryRunsV1,
    'production.list-locations.v1': productionListLocationsV1,
    'production.list-orders.v1': productionListOrdersV1,
    'production.load-schedule.v1': productionLoadScheduleV1,
    'production.place-order-automatically.v1':
      productionPlaceOrderAutomaticallyV1,
    'production.place-order-exactly.v1': productionPlaceOrderExactlyV1,
    'production.preview-order-route.v1': productionPreviewOrderRouteV1,
    'production.publish-scheduler-config.v1':
      productionPublishSchedulerConfigV1,
    'production.reconcile-batch-progress.v1':
      productionReconcileBatchProgressV1,
    'production.record-order-intake.v1': productionRecordOrderIntakeV1,
    'production.replace-shift-selection.v1': productionReplaceShiftSelectionV1,
    'production.set-order-priority.v1': productionSetOrderPriorityV1,
    'production.start-schedule.v1': productionStartScheduleV1,
    'production.subscribe-changes.v1': productionSubscribeChangesV1,
    'production.unfreeze-batch-membership.v1':
      productionUnfreezeBatchMembershipV1,
    'production.update-shift.v1': productionUpdateShiftV1,
  },
} as const;
