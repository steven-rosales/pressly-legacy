import { defineEvent } from '@pressly/metrics';

export type PublicEventSource =
  | 'nav'
  | 'hero'
  | 'home_hero'
  | 'home_wash_fold'
  | 'home_dry_cleaning'
  | 'home_mid_page'
  | 'navbar_mobile'
  | 'navbar_desktop'
  | 'navbar_mobile_menu'
  | 'pricing'
  | 'wash_fold_pricing'
  | 'dry_cleaning_pricing'
  | 'location'
  | 'location_hero'
  | 'location_hiw'
  | 'location_story'
  | 'location_local_proof'
  | 'location_wash_fold'
  | 'location_dry_cleaning'
  | 'location_bottom_section'
  | 'service_bottom_section'
  | 'faq'
  | 'footer'
  | 'about'
  | 'contact'
  | 'commercial_form'
  | 'schedule'
  | 'schedule_open_new_tab'
  | 'unknown';

export const publicEvents = {
  orderIntentStarted: (input: { source: PublicEventSource; vendor: 'cents' }) =>
    defineEvent('order_intent_started')({
      source: input.source,
      vendor: input.vendor,
    }),

  orderScheduleShellViewed: (input: { vendor: 'cents' }) =>
    defineEvent('order_schedule_shell_viewed')({ vendor: input.vendor }),

  pricingViewed: (input: { source: PublicEventSource }) =>
    defineEvent('pricing_dialog_opened')({ source: input.source }),

  locationPageViewed: (input: { locationSlug: string }) =>
    defineEvent('location_page_viewed')({ location_slug: input.locationSlug }),

  faqOpened: (input: { questionId: string }) =>
    defineEvent('faq_dialog_opened')({ question_id: input.questionId }),

  contactClicked: (input: {
    source: PublicEventSource;
    method: 'phone' | 'email';
  }) => {
    const eventName =
      input.method === 'phone'
        ? 'contact_phone_clicked'
        : 'contact_email_clicked';

    return defineEvent(eventName)({
      source: input.source,
      method: input.method,
    });
  },

  commercialInquiryFormCompleted: (input: { source: PublicEventSource }) =>
    defineEvent('commercial_inquiry_form_completed')({
      source: input.source,
    }),
};
