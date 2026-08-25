import { isJsonObject, type JsonObject } from '@pressly/codec';
import type { BoundaryContract } from '@pressly/cells';

export type StoredCellWorkEvent<Output> =
  | Readonly<{
      command: JsonObject;
      result: Output;
      valid: true;
    }>
  | Readonly<{
      command: JsonObject;
      result: JsonObject;
      valid: false;
    }>;

const invalidStoredCellWorkEvent = <Output>(): StoredCellWorkEvent<Output> => ({
  command: {},
  result: {},
  valid: false,
});

/**
 * Decodes the JSON idempotency envelope at the PostgreSQL adapter boundary so
 * cell replay logic receives an owned output type rather than asserting one.
 */
export const decodeStoredCellWorkEvent = <Output>(
  outputContract: BoundaryContract<Output>,
  payload: unknown,
): StoredCellWorkEvent<Output> => {
  if (!isJsonObject(payload)) return invalidStoredCellWorkEvent();
  const envelope = payload['_idempotency'];
  if (!isJsonObject(envelope) || envelope['version'] !== 1)
    return invalidStoredCellWorkEvent();

  const command = envelope['command'];
  const decodedResult = outputContract.decode(envelope['result']);
  if (!isJsonObject(command) || decodedResult.kind === 'invalid')
    return invalidStoredCellWorkEvent();

  return {
    command,
    result: decodedResult.value,
    valid: true,
  };
};
