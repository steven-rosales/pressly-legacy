import { decodeBase64UrlJson, encodeBase64UrlJson } from '@pressly/codec';
import type {
  IncomingOrderProposalCursor,
  ListIncomingOrderProposalsQuery,
} from './list-incoming-order-proposals.model.ts';

export const incomingOrderProposalQueryValid = (
  query: ListIncomingOrderProposalsQuery,
): boolean =>
  query.locationId.trim() !== '' &&
  Number.isInteger(query.limit) &&
  query.limit >= 1 &&
  query.limit <= 100 &&
  (query.view === 'needs_review' || query.view === 'source_closed') &&
  (query.cursor === null || query.cursor.trim() !== '');

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
    typeof parsed[0] !== 'string' ||
    typeof parsed[1] !== 'string' ||
    typeof parsed[2] !== 'string' ||
    (parsed[0] !== 'needs_review' && parsed[0] !== 'source_closed')
  )
    return null;

  const observedAt = new Date(parsed[1]);
  if (!Number.isFinite(observedAt.getTime()) || parsed[2].trim() === '')
    return null;

  return { view: parsed[0], observedAt, id: parsed[2] };
};
