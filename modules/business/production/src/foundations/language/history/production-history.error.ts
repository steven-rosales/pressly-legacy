import { invariantViolationError } from '@pressly/errors/factories';

export const productionHistoryInvariantViolation = (
  code: string,
  message: string,
) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });
