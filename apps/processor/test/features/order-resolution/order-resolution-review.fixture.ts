import type {
  ProcessorProductionOrderBacklogPreview,
  ProductionOrderBacklogCommitResult,
} from "@pressly/contracts"
import type {
  OrderResolutionReviewCopy,
  OrderResolutionReviewScope,
} from "@/features/order-resolution/order-resolution-review.model"

export const reviewCopy: OrderResolutionReviewCopy = {
  trigger: "Review old orders",
  sheetTitle: "Review old orders",
  sheetDescription: "Clear old work from the active Processor workspace.",
  archiveExplanationTitle: "Archive from active work",
  archiveExplanation:
    "These records are kept. Nothing is deleted or marked as produced.",
  scopeTitle: "Choose a cutoff and record why",
  cutoffLabel: "Due before",
  cutoffPlaceholder: "Choose a cutoff date",
  cutoffPopoverTitle: "Choose a cutoff date",
  cutoffPopoverDescription:
    "The location-day boundary is calculated before the preview request.",
  reasonLabel: "Why are you archiving these orders?",
  reasonPlaceholder: "Choose a reason",
  reasonOptions: {
    completed_outside_pressly: "Completed outside Pressly",
    processor_not_in_use: "Processor was not in use",
    duplicate_or_test: "Duplicate or test order",
    order_will_not_be_produced: "Order will not be produced",
    other: "Other",
  },
  noteLabel: "Manager note",
  noteDescription: "Optional unless Other is selected. Maximum 500 characters.",
  notePlaceholder: "Add useful context for the audit history",
  otherNoteRequired: "Add a note when Other is selected.",
  reviewOrders: "Review orders",
  refreshPreview: "Refresh preview",
  close: "Close",
  cancel: "Cancel",
  loading: "Loading old-order preview",
  previewErrorTitle: "The review could not be loaded",
  retry: "Try again",
  driftTitle: "The order list changed",
  driftDescription: "Refresh before archiving anything.",
  candidateSummary: (count) => `${count} candidates in this preview`,
  previewGenerated: (date) => `Prepared ${date}`,
  previewLimitedTitle: "More old orders are available",
  previewLimitedDescription: (maximum) =>
    `This preview is limited to ${maximum} exact candidates.`,
  groups: {
    ready_to_archive: {
      title: "Ready to archive",
      description: "Safe to remove from active work in one bounded action.",
    },
    review_individually: {
      title: "Review individually",
      description: "Contains operator-owned facts that require confirmation.",
    },
    kept_for_safety: {
      title: "Kept for safety",
      description: "Committed work cannot be archived through this review.",
    },
    already_historical: {
      title: "Already in history",
      description: "This work is already outside active operations.",
    },
  },
  groupCount: (count) => `${count} ${count === 1 ? "order" : "orders"}`,
  orderDue: (date) => `Due ${date}`,
  classificationReasons: {
    resolved_without_production: "Previously archived",
    execution_finished: "Production finished",
    execution_state_invalid: "Execution state needs review",
    resolution_transition_invalid: "Archive transition is unavailable",
    execution_committed: "Execution is committed",
    selected_for_shift: "Selected for a shift",
    batch_membership_exists: "Batch history exists",
    stage_attempt_exists: "Floor work exists",
    route_exists: "Routing history exists",
    intake_recorded: "Physical intake recorded",
    manual_admission: "Manually released",
    priority: "Priority changed in Pressly",
    pending_placement: "Placement is pending",
    no_operator_owned_facts: "No operator-owned facts",
  },
  reviewOrder: (reference) => `Review ${reference}`,
  openInHistory: (reference) => `Open ${reference} in History`,
  individualConfirmTitle: (reference) => `Archive ${reference}?`,
  individualConfirmDescription:
    "This order has Pressly-owned facts. Confirm them before removing it from active work.",
  individualAcknowledgement:
    "I reviewed the listed Pressly facts and confirm this order was not produced here.",
  individualErrorTitle: "This order was not archived",
  archiveReady: (count) =>
    `Archive ${count} ready ${count === 1 ? "order" : "orders"}`,
  bulkConfirmTitle: (count) =>
    `Archive ${count} ${count === 1 ? "order" : "orders"} from active work?`,
  bulkConfirmDescription:
    "Only the exact Ready to archive candidates in this preview will change. Records are kept and no order is marked produced.",
  bulkConfirmScope: (count, cutoff) =>
    `${count} exact candidates due before ${cutoff}.`,
  bulkConfirmAction: "Archive from active work",
  emptyTitle: "No old orders need review",
  emptyDescription: "Try a different cutoff or return when old work appears.",
  successTitle: "This review is complete",
  successNextPageTitle: "This page is complete",
  successDescription: (count) =>
    `${count} ${count === 1 ? "order was" : "orders were"} archived from active work.`,
  successNextPageDescription: (count) =>
    `${count} ${count === 1 ? "order was" : "orders were"} archived from this page. More matching orders are ready to review.`,
  replayed: "Already completed",
  replayDescription:
    "Pressly returned the original audited result without applying it twice.",
  openHistory: "Open History",
  reviewNextPage: "Review next page",
  reviewAnotherCutoff: "Review another cutoff",
}

export const spanishReviewCopy: OrderResolutionReviewCopy = {
  ...reviewCopy,
  trigger: "Revisar pedidos antiguos",
  sheetTitle: "Revisar pedidos antiguos",
  sheetDescription: "Quita trabajo antiguo del espacio operativo de Processor.",
  archiveExplanationTitle: "Archivar del trabajo activo",
  archiveExplanation:
    "Los registros se conservan. Nada se elimina ni se marca como producido.",
  scopeTitle: "Elige qué revisar",
  reviewOrders: "Revisar pedidos",
  close: "Cerrar",
  cancel: "Cancelar",
}

export const reviewScope: OrderResolutionReviewScope = {
  filter: "all_due_before_cutoff",
  cutoff: "2026-06-30T03:59:59.999Z",
  cutoffDate: new Date(2026, 5, 29, 12),
  reason: "processor_not_in_use",
  note: "Processor was offline during this period.",
  maxOrders: 250,
}

const baseItem = {
  dueAt: "2026-06-01T21:00:00.000Z",
  expectedVersion: 3,
  expectedResolutionState: "open" as const,
}

export const reviewPreview: ProcessorProductionOrderBacklogPreview = {
  locationId: "location-1",
  filter: reviewScope.filter,
  cutoff: reviewScope.cutoff,
  reason: "processor_not_in_use",
  maxOrders: reviewScope.maxOrders,
  candidateCount: 4,
  hasMore: false,
  cursor: null,
  nextCursor: null,
  previewHash: "a".repeat(64),
  generatedAt: "2026-07-27T04:30:00.000Z",
  groups: {
    readyToArchive: [
      {
        ...baseItem,
        orderId: "00000000-0000-4000-8000-000000000001",
        displayReference: "Order C-1001",
        identity: {
          displayNumber: "C-1001",
          customerDisplayName: "Rivera Cleaners",
        },
        category: "ready_to_archive",
        reasons: ["no_operator_owned_facts"],
      },
    ],
    reviewIndividually: [
      {
        ...baseItem,
        orderId: "00000000-0000-4000-8000-000000000002",
        displayReference: "Order C-1002",
        identity: {
          displayNumber: "C-1002",
          customerDisplayName: "Mateo Johnson",
        },
        category: "review_individually",
        reasons: ["intake_recorded"],
      },
    ],
    keptForSafety: [
      {
        ...baseItem,
        orderId: "00000000-0000-4000-8000-000000000003",
        displayReference: "Order C-1003",
        identity: {
          displayNumber: "C-1003",
          customerDisplayName: null,
        },
        category: "kept_for_safety",
        reasons: ["batch_membership_exists"],
      },
    ],
    alreadyHistorical: [
      {
        ...baseItem,
        orderId: "00000000-0000-4000-8000-000000000004",
        displayReference: "Order C-1004",
        identity: {
          displayNumber: "C-1004",
          customerDisplayName: "Bright Hotel",
        },
        category: "already_historical",
        reasons: ["resolved_without_production"],
        expectedResolutionState: "resolved_without_production",
      },
    ],
  },
}

export const emptyReviewPreview: ProcessorProductionOrderBacklogPreview = {
  ...reviewPreview,
  candidateCount: 0,
  groups: {
    readyToArchive: [],
    reviewIndividually: [],
    keptForSafety: [],
    alreadyHistorical: [],
  },
}

export const reviewResult: ProductionOrderBacklogCommitResult = {
  locationId: "location-1",
  bulkOperationId: "00000000-0000-4000-8000-000000000020",
  previewHash: reviewPreview.previewHash,
  nextCursor: null,
  resolvedCount: 1,
  resolved: [
    {
      orderId: reviewPreview.groups.readyToArchive[0]!.orderId,
      resolutionState: "resolved_without_production",
      version: 4,
    },
  ],
  committedAt: "2026-07-27T04:35:00.000Z",
  replayed: false,
}
