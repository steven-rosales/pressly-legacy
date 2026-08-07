import { defineEvent } from '@pressly/observability';

export const commercialEvents = {
  inquiryFormCompleted: () =>
    defineEvent('commercial_inquiry_form_completed')({
      source: 'commercial_form',
    }),
};
