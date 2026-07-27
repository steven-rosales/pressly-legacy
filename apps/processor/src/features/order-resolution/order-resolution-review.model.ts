import type {
  ChangeProductionOrderResolutionCommand,
  CommitProductionOrderBacklogCommand,
  PreviewProductionOrderBacklogCommand,
  ProductionOrderBacklogCategory,
  ProductionOrderBacklogClassificationReason,
  ProductionOrderBacklogCommitResult,
  ProductionOrderBacklogCursor,
  ProductionOrderBacklogFilter,
  ProcessorProductionOrderBacklogPreview,
  ProcessorProductionOrderBacklogPreviewItem,
} from "@pressly/contracts"

type ResolutionReason = ProcessorProductionOrderBacklogPreview["reason"]
type ResolveWithoutProductionCommand = Extract<
  ChangeProductionOrderResolutionCommand,
  { action: "resolve_without_production" }
>

export type OrderResolutionReviewScope = Readonly<{
  filter: ProductionOrderBacklogFilter
  cutoff: string
  cutoffDate: Date | undefined
  reason: ResolutionReason | ""
  note: string
  maxOrders: number
}>

export type OrderResolutionPreviewRequest = Omit<
  PreviewProductionOrderBacklogCommand,
  "locationId"
>

export type OrderResolutionCommitRequest = Omit<
  CommitProductionOrderBacklogCommand,
  "locationId" | "idempotencyKey"
>

export type OrderResolutionIndividualRequest = Readonly<{
  item: ProcessorProductionOrderBacklogPreviewItem
  command: Pick<
    ResolveWithoutProductionCommand,
    "action" | "reason" | "note" | "confirmReviewedFacts"
  >
}>

export type OrderResolutionIndividualState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting"; orderId: string }>
  | Readonly<{
      status: "error"
      orderId: string
      message: string
    }>

export type OrderResolutionReviewModel =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{
      status: "preview"
      preview: ProcessorProductionOrderBacklogPreview
      individual: OrderResolutionIndividualState
    }>
  | Readonly<{
      status: "committing"
      preview: ProcessorProductionOrderBacklogPreview
    }>
  | Readonly<{
      status: "drift"
      preview: ProcessorProductionOrderBacklogPreview
      message: string
    }>
  | Readonly<{
      status: "success"
      result: ProductionOrderBacklogCommitResult
    }>
  | Readonly<{
      status: "error"
      preview: ProcessorProductionOrderBacklogPreview | null
      message: string
    }>

export type OrderResolutionReviewCallbacks = Readonly<{
  onOpenChange: (open: boolean) => void
  onScopeChange: (scope: OrderResolutionReviewScope) => void
  onPreview: (request: OrderResolutionPreviewRequest) => void
  onPreviewNext: (cursor: ProductionOrderBacklogCursor) => void
  onCommit: (request: OrderResolutionCommitRequest) => void
  onResolveIndividually: (request: OrderResolutionIndividualRequest) => void
  onOpenHistory: (orderId?: string) => void
  onReviewAnother: () => void
}>

type GroupCopy = Readonly<{
  title: string
  description: string
}>

export type OrderResolutionReviewCopy = Readonly<{
  trigger: string
  sheetTitle: string
  sheetDescription: string
  archiveExplanationTitle: string
  archiveExplanation: string
  scopeTitle: string
  filterLabel: string
  filterOptions: Readonly<Record<ProductionOrderBacklogFilter, string>>
  cutoffLabel: string
  cutoffPlaceholder: string
  cutoffPopoverTitle: string
  cutoffPopoverDescription: string
  reasonLabel: string
  reasonPlaceholder: string
  reasonOptions: Readonly<Record<ResolutionReason, string>>
  noteLabel: string
  noteDescription: string
  notePlaceholder: string
  otherNoteRequired: string
  reviewOrders: string
  refreshPreview: string
  close: string
  cancel: string
  loading: string
  previewErrorTitle: string
  retry: string
  driftTitle: string
  driftDescription: string
  candidateSummary: (count: number) => string
  previewGenerated: (formattedDate: string) => string
  previewLimitedTitle: string
  previewLimitedDescription: (maximum: number) => string
  groups: Readonly<Record<ProductionOrderBacklogCategory, GroupCopy>>
  groupCount: (count: number) => string
  orderDue: (formattedDate: string) => string
  sourceState: Readonly<Record<"open" | "completed" | "canceled", string>>
  classificationReasons: Readonly<
    Record<ProductionOrderBacklogClassificationReason, string>
  >
  reviewOrder: (displayReference: string) => string
  openInHistory: (displayReference: string) => string
  individualConfirmTitle: (displayReference: string) => string
  individualConfirmDescription: string
  individualAcknowledgement: string
  individualErrorTitle: string
  archiveReady: (count: number) => string
  bulkConfirmTitle: (count: number) => string
  bulkConfirmDescription: string
  bulkConfirmScope: (count: number, formattedCutoff: string) => string
  bulkConfirmAction: string
  emptyTitle: string
  emptyDescription: string
  successTitle: string
  successNextPageTitle: string
  successDescription: (count: number) => string
  successNextPageDescription: (count: number) => string
  replayed: string
  replayDescription: string
  openHistory: string
  reviewNextPage: string
  reviewAnotherCutoff: string
}>

export type OrderResolutionReviewSheetProps = Readonly<{
  canManage: boolean
  open: boolean
  locale: string
  timezone: string
  scope: OrderResolutionReviewScope
  model: OrderResolutionReviewModel
  copy: OrderResolutionReviewCopy
  callbacks: OrderResolutionReviewCallbacks
}>
