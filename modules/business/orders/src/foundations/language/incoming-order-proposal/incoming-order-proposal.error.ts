import type { AppError } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';

export const incomingOrderProposalInvariant = (
  code: string,
  message: string,
): AppError =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored incoming order data is inconsistent.',
  });
