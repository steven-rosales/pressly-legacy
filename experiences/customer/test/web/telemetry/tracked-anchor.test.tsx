'use client';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTestWebCore } from '@test/support/make-test-web-core';
import { TrackedAnchor } from '#customer/telemetry/tracked-anchor';
import { CustomerWebCoreProvider } from '#customer/composition/web-core-context';
import { orderEntryEvents } from '#customer/features/order-entry/events';

describe('TrackedAnchor', () => {
  it('tracks event on click', async () => {
    const user = userEvent.setup();
    const core = makeTestWebCore({ route: '/' });

    render(
      <CustomerWebCoreProvider core={core}>
        <TrackedAnchor
          href="https://vendor.example.com"
          event={orderEntryEvents.intentStarted({
            source: 'hero',
            vendor: 'cents',
          })}
          onClick={(event) => event.preventDefault()}
        >
          Schedule a Pickup
        </TrackedAnchor>
      </CustomerWebCoreProvider>,
    );

    await user.click(screen.getByRole('link', { name: 'Schedule a Pickup' }));

    expect(core.calls.analytics).toHaveLength(1);
    expect(core.calls.analytics[0]).toMatchObject({
      kind: 'track',
      event: {
        name: 'order_intent_started',
        properties: {
          source: 'hero',
          vendor: 'cents',
        },
      },
    });
  });
});
