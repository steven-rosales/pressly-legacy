<wizard-report>
# PostHog setup report

PostHog analytics are wired through the Pressly frontend core/adapters boundary.
Components declare typed product events; the browser adapter is the only place
that calls `posthog.capture()`.

## What was done

- **Installed** `posthog-js` via pnpm
- **Initialized** PostHog in `src/instrumentation-client.ts`
- **Configured optional reverse proxy** rewrites in `next.config.ts`
- **Set environment variables** in `.env.local` (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`)
- **Added typed public events** in `src/common/core/analytics/events.ts`
- **Added a PostHog adapter** in `src/common/adapters/analytics/posthog-tracker.ts`
- **Added declarative CTA tracking** through `SchedulePickupButton`
- **Created a PostHog dashboard** ("Analytics basics") with 5 insights

## Instrumented events

| Event                               | Meaning                                                         |
| ----------------------------------- | --------------------------------------------------------------- |
| `order_intent_started`              | User clicked a first-party CTA that starts the Cents order flow |
| `order_schedule_shell_viewed`       | User loaded the first-party `/schedule` Cents iframe shell      |
| `commercial_inquiry_form_completed` | User completed the local commercial inquiry form validation     |
| `pricing_dialog_opened`             | User opened a pricing quick-reference dialog                    |
| `faq_dialog_opened`                 | User opened a pickup FAQ dialog                                 |
| `contact_phone_clicked`             | User clicked the phone contact link                             |
| `contact_email_clicked`             | User clicked the email contact link                             |

`order_intent_started` includes `source` and `vendor: "cents"`. It does not
mean an order was placed. It means the user expressed intent by clicking into
the external Cents order flow.

The commercial inquiry event intentionally excludes company name, location,
email, phone, and free-text fields.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/400162/dashboard/1516815
- **Order Intent by Source**: https://us.posthog.com/project/400162/insights/3iBYDqMK
- **Scheduling Conversion Funnel**: https://us.posthog.com/project/400162/insights/TcbvvqCM
- **Commercial Inquiry Submissions**: https://us.posthog.com/project/400162/insights/NbLVagqS
- **Schedule Page Engagement**: https://us.posthog.com/project/400162/insights/ZWXMx65K
- **Customer Contact Interactions**: https://us.posthog.com/project/400162/insights/y8hHfMOW

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
