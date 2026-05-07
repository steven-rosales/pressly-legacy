'use client';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { publicEvents } from '../../core/analytics/events';
import { makeTestWebCore } from '../../testing/make-test-web-core';
import { InjectedWebCoreProvider } from '../runtime/web-core-context';
import { TrackedAnchor } from './tracked-anchor';

describe('TrackedAnchor', () => {
  it('tracks event on click', async () => {
    const user = userEvent.setup();
    const core = makeTestWebCore({ route: '/' });

    render(
      <InjectedWebCoreProvider core={core}>
        <TrackedAnchor
          href="https://vendor.example.com"
          event={publicEvents.orderIntentStarted({
            source: 'hero',
            vendor: 'cents',
          })}
          onClick={(event) => event.preventDefault()}
        >
          Schedule a Pickup
        </TrackedAnchor>
      </InjectedWebCoreProvider>,
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
