import { defineEvent } from '@pressly/metrics';

export const pricingEvents = {
  viewed: (input: { source: 'schedule' }) =>
    defineEvent('pricing_dialog_opened')({ source: input.source }),
};
