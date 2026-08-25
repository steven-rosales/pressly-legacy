import {
  previewProductionOrderBacklogRequestSchema,
  productionOrderBacklogPreviewSchema,
  type ProductionOrderBacklogPreview,
} from '../../../read-models/production-order-backlog/contract.ts';
import { productionLocationParamsSchema } from './boundary.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  ProductionOrderBacklogCursorFailure,
  ProductionOrderBacklogScope,
} from '../../../read-models/production-order-backlog/model.ts';
import { previewOrderBacklogCursorInvalid } from './failures.ts';
import type { PreviewOrderBacklogExpectedFailure } from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const prefixedIssues = (
  prefix: 'params' | 'body' | 'output',
  values: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: [prefix, ...issue.path.map(String)],
    message: issue.message,
  }));

const decodeInput = (
  serialized: unknown,
): DecodeResult<ProductionOrderBacklogScope> => {
  if (!isRecord(serialized))
    return decode.invalid([
      {
        path: [],
        message: 'The preview-order-backlog input must be an object.',
      },
    ]);
  const params = productionLocationParamsSchema.safeParse(serialized['params']);
  const body = previewProductionOrderBacklogRequestSchema.safeParse(
    serialized['body'],
  );
  const failures = [
    ...(params.success ? [] : prefixedIssues('params', params.error.issues)),
    ...(body.success ? [] : prefixedIssues('body', body.error.issues)),
  ];
  if (!params.success || !body.success) return decode.invalid(failures);

  return decode.valid({
    locationId: params.data.locationId,
    filter: body.data.filter,
    cutoff: body.data.cutoff,
    reason: body.data.reason,
    cursor: body.data.cursor,
    maxOrders: body.data.maxOrders,
  });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ProductionOrderBacklogPreview> => {
  const parsed = productionOrderBacklogPreviewSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: ProductionOrderBacklogPreview): unknown => {
  const parsed = productionOrderBacklogPreviewSchema.safeParse(value);
  if (!parsed.success)
    throw invariantViolationError({
      code: 'invalid_cell_success_response',
      message:
        'A preview-order-backlog success result did not satisfy its serialized contract.',
      safeMessage: 'The production order backlog preview is invalid.',
      cause: parsed.error,
    });
  return parsed.data;
};

const isCursorReason = (
  value: unknown,
): value is ProductionOrderBacklogCursorFailure['code'] =>
  value === 'production_order_backlog_cursor_invalid' ||
  value === 'production_order_backlog_cursor_scope_mismatch';

const decodeFailure = (
  serialized: unknown,
): DecodeResult<PreviewOrderBacklogExpectedFailure> => {
  const details = isRecord(serialized) ? serialized['details'] : null;
  if (
    !isRecord(serialized) ||
    serialized['tag'] !== 'ProductionFailure' ||
    serialized['kind'] !== 'validation' ||
    serialized['classification'] !== 'malformed' ||
    serialized['code'] !== 'production_order_backlog_cursor_invalid' ||
    typeof serialized['message'] !== 'string' ||
    typeof serialized['safeMessage'] !== 'string' ||
    serialized['safeMessage'] !== serialized['message'] ||
    !isRecord(details) ||
    !isCursorReason(details['reason'])
  )
    return decode.invalid([
      { path: [], message: 'The preview-order-backlog failure is invalid.' },
    ]);

  return decode.valid(
    previewOrderBacklogCursorInvalid({
      code: details['reason'],
      message: serialized['message'],
    }),
  );
};

export const previewOrderBacklogContract = defineCellContract<
  ProductionOrderBacklogScope,
  ProductionOrderBacklogPreview,
  PreviewOrderBacklogExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: { locationId: input.locationId },
      body: {
        filter: input.filter,
        cutoff: input.cutoff,
        reason: input.reason,
        cursor: input.cursor,
        maxOrders: input.maxOrders,
      },
    }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeOutput,
    encode: encodeOutput,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: decodeFailure,
    encode: (failure) => ({
      ...failure,
      details: { ...failure.details },
    }),
  }),
});
