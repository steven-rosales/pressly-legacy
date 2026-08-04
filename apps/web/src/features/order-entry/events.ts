import { defineEvent } from '@pressly/observability';

export type OrderEntrySource =
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
  | 'schedule'
  | 'schedule_open_new_tab'
  | 'unknown';

export const orderEntryEvents = {
  intentStarted: (input: { source: OrderEntrySource; vendor: 'cents' }) =>
    defineEvent('order_intent_started')({
      source: input.source,
      vendor: input.vendor,
    }),

  scheduleShellViewed: (input: { vendor: 'cents' }) =>
    defineEvent('order_schedule_shell_viewed')({ vendor: input.vendor }),
};
