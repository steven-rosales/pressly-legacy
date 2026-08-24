import { isJsonObject } from '@pressly/codec';
import { isCommandContextValid } from '@pressly/cells/command-context';
import type {
  CloseIncomingOrderSourceCommand,
  CloseIncomingOrderSourceExpectedFailure,
} from './types.ts';

export const closeIncomingOrderSourceFailure = Object.freeze({
  invalid: (): CloseIncomingOrderSourceExpectedFailure => ({
    kind: 'validation',
    code: 'incoming_order_source_close_invalid',
    message: 'The incoming source-terminal observation is invalid.',
  }),
  idempotencyConflict: (): CloseIncomingOrderSourceExpectedFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message:
      'The source-terminal idempotency key belongs to different evidence.',
  }),
});

export const validateCloseIncomingOrderSource = (
  command: CloseIncomingOrderSourceCommand,
): CloseIncomingOrderSourceExpectedFailure | null =>
  command.source.trim() !== '' &&
  command.externalOrderId.trim() !== '' &&
  (command.terminalCode === 'completed' ||
    command.terminalCode === 'canceled') &&
  isCommandContextValid(command.context) &&
  command.revision.adapterVersion.trim() !== '' &&
  /^[a-f0-9]{64}$/.test(command.revision.hash) &&
  Number.isFinite(command.revision.at.getTime()) &&
  Number.isFinite(command.revision.observedAt.getTime()) &&
  isJsonObject(command.revision.normalizedPayload)
    ? null
    : closeIncomingOrderSourceFailure.invalid();
