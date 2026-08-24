import type { CellOutcome, HttpResponse } from '@pressly/cells';
import {
  authError,
  conflictError,
  rateLimitError,
} from '@pressly/errors/factories';

type ExpectedFailure = Readonly<{
  kind: 'authentication' | 'conflict' | 'rate_limit';
  code: string;
  message: string;
}>;

export const presentCustomerAuth = <Output, Failure extends ExpectedFailure>(
  outcome: CellOutcome<Output, Failure>,
  encode: (output: Output) => unknown,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: { ok: true, data: encode(outcome.value) },
    };

  const fields = {
    code: outcome.failure.code,
    message: outcome.failure.message,
    safeMessage: outcome.failure.message,
  };
  if (outcome.failure.kind === 'rate_limit') throw rateLimitError(fields);
  if (outcome.failure.kind === 'conflict') throw conflictError(fields);
  throw authError(fields);
};

export const presentCustomerValue = <Output>(
  outcome: CellOutcome<Output, never>,
  encode: (output: Output) => unknown,
): HttpResponse => {
  if (outcome.kind === 'failure') return outcome.failure;
  return {
    status: 200,
    body: { ok: true, data: encode(outcome.value) },
  };
};
