import type { HttpRequest } from '@pressly/cells';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { receiveCentsWebhookContract } from './contract.ts';
import { receiveCentsWebhookCellDeclaration } from './cell.ts';
import { receiveCentsWebhookHttpSurface } from './http.ts';

proveOperation({
  operationId: 'ingress.receive-cents-webhook.v1',
  declaration: receiveCentsWebhookCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns exact raw bytes and the durable inbox acknowledgement',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(receiveCentsWebhookContract, {
          rawBodyBase64: 'e30=',
        });
        expectIngressRoundTrip(receiveCentsWebhookContract.output, {
          eventId: '81000000-0000-4000-8000-000000000001',
          duplicate: false,
          status: 'pending',
        });
        expectIngressRoundTrip(receiveCentsWebhookContract.failure, {
          kind: 'validation',
          code: 'invalid_cents_webhook_body',
          message: 'Cents webhook body was not valid JSON.',
          safeMessage: 'The vendor webhook body is invalid.',
        });
      },
    },
    {
      name: 'maps raw HTTP bytes and the durable accepted response',
      proves: ['protocol'],
      run: () => {
        const request: HttpRequest = {
          params: {},
          query: {},
          headers: {},
          body: new TextEncoder().encode('{}'),
          context: {},
        };
        expect(
          receiveCentsWebhookHttpSurface.toSerializedInput(request),
        ).toEqual({
          rawBodyBase64: 'e30=',
        });
        const value = {
          eventId: '81000000-0000-4000-8000-000000000001',
          duplicate: false,
          status: 'pending' as const,
        };
        expect(
          receiveCentsWebhookHttpSurface.present({ kind: 'success', value }),
        ).toEqual({
          status: 202,
          body: { ok: true, data: value },
        });
      },
    },
  ],
});
