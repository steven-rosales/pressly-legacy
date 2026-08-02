import { presentAppError, type AppError } from '@pressly/errors';
import { apiFailure } from '@pressly/http';
import type { CliIO } from './io.ts';

export const writeCliOutput = (
  io: CliIO,
  output: unknown,
  json: boolean,
): void => {
  io.stdout.write(
    json
      ? `${JSON.stringify(output, null, 2)}\n`
      : `${String(output).trimEnd()}\n`,
  );
};

export const writeCliError = (
  io: CliIO,
  error: AppError,
  json: boolean,
): void => {
  io.stderr.write(
    json
      ? `${JSON.stringify(apiFailure(error), null, 2)}\n`
      : `${presentAppError(error)}\n`,
  );
};
