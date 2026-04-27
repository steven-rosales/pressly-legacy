<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Pressly Next.js App Router application. Here is a summary of everything that was set up:

## What was done

- **Installed** `posthog-js` via pnpm
- **Initialized** PostHog in `instrumentation-client.ts` (Next.js 15.3+ pattern) with reverse-proxy ingestion, exception tracking enabled, and debug mode in development
- **Configured reverse proxy** in `next.config.ts` — all PostHog requests route through `/ingest/*` to avoid ad-blockers
- **Set environment variables** in `.env.local` (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`)
- **Instrumented 10 files** with `posthog.capture()` calls covering the core conversion path and engagement signals
- **Created a PostHog dashboard** ("Analytics basics") with 5 insights

## Instrumented events

| Event | Description | File |
|-------|-------------|------|
| `schedule_pickup_clicked` | User clicked "Schedule a Pickup" CTA — hero section | `src/routes/home/ui/HomeHero.tsx` |
| `schedule_pickup_clicked` | User clicked "Schedule a Pickup" CTA — mid-page section | `src/routes/home/ui/HomeConquerTime.tsx` |
| `schedule_pickup_clicked` | User clicked "Schedule a Pickup" CTA — desktop navbar | `src/routes/shared/public/NavBar.tsx` |
| `schedule_pickup_clicked` | User clicked "Get Started" CTA — mobile navbar | `src/routes/shared/public/NavBar.tsx` |
| `schedule_pickup_clicked` | User clicked "Schedule a Pickup" CTA — wash & fold pricing page | `src/routes/services-pricing/wash-fold/ui/WashFoldPricing.tsx` |
| `schedule_pickup_clicked` | User clicked "Schedule a Pickup" CTA — dry cleaning pricing page | `src/routes/services-pricing/dry-cleaning/ui/DryCleaningPricing.tsx` |
| `schedule_pickup_clicked` | User clicked "Schedule a Pickup" CTA — location page bottom section | `src/routes/new-jersey/ui/LocationsBottomSection.tsx` |
| `schedule_pickup_clicked` | User clicked "Schedule a Pickup" CTA — service page bottom section | `src/routes/services-pricing/ui/ServiceBottomSection.tsx` |
| `commercial_inquiry_submitted` | User submitted the commercial services inquiry form | `src/routes/commercial/ui/CommercialContactSection.tsx` |
| `pricing_dialog_opened` | User opened the pricing quick-reference dialog on the schedule page | `src/routes/schedule/route.tsx` |
| `faq_dialog_opened` | User opened the pickup FAQ dialog on the schedule page | `src/routes/schedule/route.tsx` |
| `contact_phone_clicked` | User clicked the phone contact link | `src/routes/contact/route.tsx` |
| `contact_email_clicked` | User clicked the email contact link | `src/routes/contact/route.tsx` |

The `schedule_pickup_clicked` event includes a `source` property identifying where on the site the click occurred: `home_hero`, `home_mid_page`, `navbar_desktop`, `navbar_mobile`, `wash_fold_pricing`, `dry_cleaning_pricing`, `location_bottom_section`, or `service_bottom_section`.

The `commercial_inquiry_submitted` event includes `company_name` and `location` properties.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/400162/dashboard/1516815
- **Schedule Pickup Clicks by Source**: https://us.posthog.com/project/400162/insights/3iBYDqMK
- **Scheduling Conversion Funnel**: https://us.posthog.com/project/400162/insights/TcbvvqCM
- **Commercial Inquiry Submissions**: https://us.posthog.com/project/400162/insights/NbLVagqS
- **Schedule Page Engagement**: https://us.posthog.com/project/400162/insights/ZWXMx65K
- **Customer Contact Interactions**: https://us.posthog.com/project/400162/insights/y8hHfMOW

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
