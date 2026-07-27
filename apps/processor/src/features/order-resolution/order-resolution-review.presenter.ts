import type {
  OrderResolutionCommitRequest,
  OrderResolutionPreviewRequest,
  OrderResolutionReviewScope,
} from "./order-resolution-review.model"

export type OrderResolutionReviewValidation = Readonly<{
  valid: boolean
  otherNoteMissing: boolean
}>

export const validateOrderResolutionReviewScope = (
  scope: OrderResolutionReviewScope
): OrderResolutionReviewValidation => {
  const otherNoteMissing =
    scope.reason === "other" && scope.note.trim().length === 0

  return {
    valid:
      scope.cutoff.length > 0 &&
      scope.cutoffDate !== undefined &&
      scope.reason.length > 0 &&
      !otherNoteMissing,
    otherNoteMissing,
  }
}

export const toOrderResolutionPreviewRequest = (
  scope: OrderResolutionReviewScope
): OrderResolutionPreviewRequest | null => {
  const validation = validateOrderResolutionReviewScope(scope)
  if (!validation.valid || scope.reason === "") return null

  return {
    filter: scope.filter,
    cutoff: scope.cutoff,
    reason: scope.reason,
    cursor: null,
    maxOrders: scope.maxOrders,
  }
}

export const toOrderResolutionCommitRequest = (
  scope: OrderResolutionReviewScope,
  previewHash: string,
  cursor: OrderResolutionCommitRequest["cursor"]
): OrderResolutionCommitRequest | null => {
  const preview = toOrderResolutionPreviewRequest(scope)
  if (preview === null) return null

  return {
    ...preview,
    cursor,
    note: scope.note.trim().length === 0 ? null : scope.note.trim(),
    previewHash,
  }
}
