import { defineEvent } from '@pressly/metrics';

export const commercialEvents = {
  inquiryFormCompleted: () =>
    defineEvent('commercial_inquiry_form_completed')({
      source: 'commercial_form',
    }),
};
