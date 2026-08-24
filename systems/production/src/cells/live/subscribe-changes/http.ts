import {
  decode,
  eventStream,
  type ContractIssue,
  type DecodeResult,
  type EventStreamSurface,
  type HttpRequestHead,
} from '@pressly/cells';
import { notFoundError } from '@pressly/errors/factories';
import { decodeSubscribeProductionChangesInput } from './contract.ts';
import type {
  ProductionChangeEvent,
  SubscribeProductionChangesFailure,
  SubscribeProductionChangesReady,
} from './types.ts';

const decodeLocationScope = (head: HttpRequestHead): DecodeResult<string> => {
  const decoded = decodeSubscribeProductionChangesInput({
    locationId: head.params['locationId'],
  });
  if (decoded.kind === 'valid') return decode.valid(decoded.value.locationId);

  const issues: readonly ContractIssue[] = decoded.issues.map((issue) => ({
    path: ['params', ...issue.path],
    message: issue.message,
  }));
  return decode.invalid(issues);
};

export const subscribeProductionChangesHttpSurface: EventStreamSurface<
  SubscribeProductionChangesReady,
  ProductionChangeEvent,
  SubscribeProductionChangesFailure
> = eventStream.get({
  path: '/production/locations/:locationId/events',
  retryMs: 3_000,
  eventTypes: ['ready', 'change', 'resync'],
  invalidRequest: {
    authorizationScope: {
      code: 'invalid_params_type',
      message: 'Validation params failed.',
      safeMessage: 'Invalid request input.',
      status: 400,
      location: 'params',
    },
    input: {
      code: 'invalid_params_type',
      message: 'Validation params failed.',
      safeMessage: 'Invalid request input.',
      status: 400,
      location: 'params',
    },
  },
  decodeAuthorizationScope: decodeLocationScope,
  toSerializedInput: (request) => ({
    locationId: request.params['locationId'],
  }),
  presentReady: (ready) => ({
    event: 'ready',
    id: String(ready.revision),
    data: { revision: ready.revision },
  }),
  presentEvent: (event) =>
    event.kind === 'change'
      ? {
          event: 'change',
          id: String(event.revision),
          data: { revision: event.revision },
        }
      : {
          event: 'resync',
          data: { reason: event.reason },
        },
  presentFailure: (failure) => {
    throw notFoundError({
      code: failure.code,
      message: failure.message,
      safeMessage: failure.safeMessage,
    });
  },
});
