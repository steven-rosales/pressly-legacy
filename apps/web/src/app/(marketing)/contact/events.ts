import { defineEvent } from '@pressly/observability';

export const contactEvents = {
  clicked: (input: { method: 'phone' | 'email' }) => {
    const eventName =
      input.method === 'phone'
        ? 'contact_phone_clicked'
        : 'contact_email_clicked';

    return defineEvent(eventName)({
      source: 'contact',
      method: input.method,
    });
  },
};
