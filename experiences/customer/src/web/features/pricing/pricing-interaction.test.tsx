import { render, screen } from '@testing-library/react';
import { proveExperienceFeature } from '@pressly/testkit/experience-feature-proof';
import { customerPricingFeature } from './feature';
import userEvent from '@testing-library/user-event';
import { PricingRetryButton } from '#customer/features/pricing/ui/PricingRetryButton';
import { expect, vi } from 'vitest';

proveExperienceFeature({
  featureId: 'customer.web.pricing',
  feature: customerPricingFeature,
  scenarios: [
    {
      name: 'invokes the declared retry action from the rendered control',
      proves: ['presentation-state', 'component-interaction'],
      run: async () => {
        const user = userEvent.setup();
        const action = vi.fn(async () => undefined);

        render(<PricingRetryButton label="Retry prices" action={action} />);
        await user.click(screen.getByRole('button', { name: 'Retry prices' }));

        expect(action).toHaveBeenCalledOnce();
      },
    },
  ],
});
