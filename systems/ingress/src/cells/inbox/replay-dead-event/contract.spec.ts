import type { HttpRequest } from '@pressly/cells';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { replayDeadEventContract } from './contract.ts';
import { replayDeadEventCellDeclaration } from './cell.ts';
import { replayDeadEventHttpSurface } from './http.ts';

const eventId = '81000000-0000-4000-8000-000000000001';

const request: HttpRequest = {
  params: { eventId },
  query: {},
  headers: {},
  body: { confirmation: 'replay-dead-webhook-event' },
  context: {},
};

proveOperation({
  operationId: 'ingress.replay-dead-event.v1',
  declaration: replayDeadEventCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns replay identity outcome and expected rejection data',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(replayDeadEventContract, { eventId });
        expectIngressRoundTrip(replayDeadEventContract.output, {
          eventId,
          outcome: 'queued',
        });
        expectIngressRoundTrip(replayDeadEventContract.failure, {
          kind: 'not_found',
          code: 'webhook_event_not_found',
          message: 'The webhook event was not found.',
          safeMessage: 'The webhook event was not found.',
        });
      },
    },
    {
      name: 'maps route scope and success through the HTTP surface',
      proves: ['protocol'],
      run: () => {
        expect(replayDeadEventHttpSurface.toSerializedInput(request)).toEqual({
          eventId,
        });
        expect(
          replayDeadEventHttpSurface.present({
            kind: 'success',
            value: { eventId, outcome: 'queued' },
          }),
        ).toEqual({
          status: 200,
          body: { ok: true, data: { eventId, outcome: 'queued' } },
        });
      },
    },
  ],
});
