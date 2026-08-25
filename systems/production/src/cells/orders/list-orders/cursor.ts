import { decodeBase64UrlText, encodeBase64UrlText } from '@pressly/codec';
import { invariantViolationError } from '@pressly/errors/factories';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const decodeOrderCursor = (cursor: string): string | null => {
  const decoded = decodeBase64UrlText(cursor);
  return decoded !== null && uuidPattern.test(decoded) ? decoded : null;
};

export const encodeOrderCursor = (orderId: string): string => {
  if (!uuidPattern.test(orderId))
    throw invariantViolationError({
      code: 'production_order_cursor_point_invalid',
      message: 'Production-order cursor point is invalid.',
      safeMessage: 'Production state is inconsistent.',
    });
  return encodeBase64UrlText(orderId);
};
