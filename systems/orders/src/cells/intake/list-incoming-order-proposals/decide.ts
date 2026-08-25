import { decodeBase64UrlJson, encodeBase64UrlJson } from '@pressly/codec';
import type {
  IncomingOrderProposalCursor,
  ListIncomingOrderProposalsExpectedFailure,
  ListIncomingOrderProposalsQuery,
} from './types.ts';

export const validateListIncomingOrderProposals = (
  query: ListIncomingOrderProposalsQuery,
): ListIncomingOrderProposalsExpectedFailure | null =>
  query.locationId.trim() === '' ||
  !Number.isInteger(query.limit) ||
  query.limit < 1 ||
  query.limit > 100 ||
  (query.view !== 'needs_review' && query.view !== 'source_closed') ||
  (query.cursor !== null && query.cursor.trim() === '')
    ? {
        kind: 'validation',
        code: 'incoming_order_proposal_query_invalid',
        message: 'The incoming Order proposal query is invalid.',
      }
    : null;

export const encodeIncomingOrderProposalCursor = (
  cursor: IncomingOrderProposalCursor,
): string =>
  encodeBase64UrlJson([
    cursor.view,
    cursor.observedAt.toISOString(),
    cursor.id,
  ]);

export const decodeIncomingOrderProposalCursor = (
  cursor: string,
): IncomingOrderProposalCursor | null => {
  const parsed = decodeBase64UrlJson(cursor);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    (parsed[0] !== 'needs_review' && parsed[0] !== 'source_closed') ||
    typeof parsed[1] !== 'string' ||
    typeof parsed[2] !== 'string'
  )
    return null;
  const observedAt = new Date(parsed[1]);
  return !Number.isFinite(observedAt.getTime()) || parsed[2].trim() === ''
    ? null
    : { view: parsed[0], observedAt, id: parsed[2] };
};

export const invalidIncomingOrderProposalCursor =
  (): ListIncomingOrderProposalsExpectedFailure => ({
    kind: 'validation',
    code: 'incoming_order_proposal_cursor_invalid',
    message: 'The incoming Order proposal cursor is invalid.',
  });
