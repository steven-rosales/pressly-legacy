import type { HttpRequest } from '@pressly/cells';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  expectExactIngressInput,
  expectIngressRoundTrip,
} from '../../../testing/contract-proof.ts';
import { listDeadEventsContract } from './contract.ts';
import { listDeadEventsCellDeclaration } from './cell.ts';
import { listDeadEventsHttpSurface } from './http.ts';

const request = (query: Record<string, unknown>): HttpRequest => ({
  params: {},
  query,
  headers: {},
  body: undefined,
  context: {},
});

proveOperation({
  operationId: 'ingress.list-dead-events.v1',
  declaration: listDeadEventsCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'owns private-safe dead metadata and UTC cursor output',
      proves: ['contract'],
      run: () => {
        expectExactIngressInput(listDeadEventsContract, {
          source: 'cents',
          limit: 25,
        });
        const at = new Date('2026-08-22T16:00:00.000Z');
        expectIngressRoundTrip(listDeadEventsContract.output, {
          items: [
            {
              eventId: '81000000-0000-4000-8000-000000000001',
              source: 'cents',
              eventType: 'order_updated',
              subjectType: 'order',
              subjectId: 'order-1',
              sourceLocationId: 'store-1',
              sourceOccurredAt: at,
              attempts: 8,
              lastErrorCode: 'projection_failed',
              receivedAt: at,
            },
          ],
          nextEventId: null,
          asOf: at,
        });
      },
    },
    {
      name: 'maps the HTTP query and serializes UTC response data',
      proves: ['protocol'],
      run: () => {
        expect(
          listDeadEventsHttpSurface.toSerializedInput(
            request({ source: 'cents', limit: 25 }),
          ),
        ).toEqual({ source: 'cents', limit: 25 });
        const response = listDeadEventsHttpSurface.present({
          kind: 'success',
          value: {
            items: [],
            nextEventId: null,
            asOf: new Date('2026-08-22T16:00:00.000Z'),
          },
        });
        expect(response).toEqual({
          status: 200,
          body: {
            ok: true,
            data: {
              items: [],
              nextCursor: null,
              asOf: '2026-08-22T16:00:00.000Z',
            },
          },
        });
      },
    },
  ],
});
